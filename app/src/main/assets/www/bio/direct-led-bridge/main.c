#include <stddef.h>
#include <stdint.h>

#include "bio.h"

/*
 * Sealed-mode direct LED controller for the standard DC34 badge.
 *
 * The signed stock light renderer owns the ten-LED WS2812C chain on BIO 15.
 * This runtime program keeps that renderer in its documented, self-clearing
 * pause window and writes complete pixel frames while it is paused.  It does
 * not flash Xous, enter developer mode, or access the badge exchange key.
 *
 * FIFO3 protocol (all words are u32):
 *
 *   FRAME_V2_MAGIC
 *   10 x 0x00GGRRBB colors, in physical chain order
 *   10 x animation configs
 *   10 x effect configs
 *
 * A single LED can be changed atomically with:
 *
 *   PIXEL_V2_MAGIC | index (0..9)
 *   0x00GGRRBB
 *   animation config
 *   effect config
 *
 * Animation config:
 *   bits  7:0   brightness, 0..255
 *   bits 19:8   period in 20 ms ticks; 0 means steady
 *   bits 31:20  on-time in 20 ms ticks; must be <= period
 *
 * Effect config:
 *   bits 11:0   one-shot start/phase delay in 20 ms ticks
 *   bit  12     smooth RGB color-wheel mode
 *   bits 31:13  reserved; must be zero
 *
 * V2 scenes are staged in full and commit only after their final effect word.
 * While a V2 full scene is arriving, the chain is deliberately held black so
 * a slow console transfer never exposes an intermediate base color.  Legacy
 * FRAME_MAGIC and PIXEL_MAGIC packets retain their two-stage behavior.
 *
 * RELEASE_MAGIC relinquishes the LED chain without deleting the bridge; the
 * stock renderer resumes after its pause gate expires.
 *
 * The final BootScene data record is passive in the published binary.  The
 * WebUI may personalize its payload and CRC before upload; a valid enabled
 * record is copied through the same validation and commit path during boot.
 * A valid boot scene waits before touching FIFO1 or GPIO so the stock light
 * core can consume its required pin/count startup words first.
 */

#define LED_PIN              15U
#define LED_COUNT            10U
#define FRAME_MAGIC          0xDC34D1CEU
#define FRAME_V2_MAGIC       0xDC34D2CEU
#define PIXEL_MAGIC          0xDC34E100U
#define PIXEL_V2_MAGIC       0xDC34E200U
#define PIXEL_MAGIC_MASK     0xFFFFFFF0U
#define RELEASE_MAGIC        0xDC340FF0U
#define STOCK_PAUSE          0x80000000U
#define FIFO3_AVAILABLE_MASK FIFO_EVENT_MASK(3, 1)
/*
 * The loader must configure this core for a 2.8 MHz target quantum.  At about
 * 357 ns/quantum, both WS2812 symbols can be generated entirely from quantum
 * waits (0 = 1Q high/2Q low, 1 = 2Q high/2Q low).  The BIO service rescales
 * TargetFreqInt dividers around WFI, so this waveform remains valid at both
 * the normal and 48 MHz BIO input clocks.  This deliberately avoids the
 * instruction-counted ws2812c_wfi() path, whose timing is not interchangeable
 * with the normal-clock ws2812c() path during an unsignalled transition.
 */
#define QUANTA_PER_MS        2800U
#define FRAME_TICK_MS        20U
#define PAUSE_REFRESH_MS     70U
#define TAKEOVER_GUARD_MS    100U
#define CLOCK_CHANGE_GUARD_MS 100U
#define BOOT_HOLDOFF_MS      2000U
#define QUANTUM_CLASS_THRESHOLD 64U
#define QUANTUM_CLASS_UNKNOWN 0U
#define QUANTUM_CLASS_SHORT   1U
#define QUANTUM_CLASS_LONG    2U
#define ACLK_COUNTER_MASK     0x3FFFFFFFU
#define EFFECT_DELAY_MASK    0x00000FFFU
#define EFFECT_RGB           0x00001000U
#define EFFECT_VALID_MASK    (EFFECT_DELAY_MASK | EFFECT_RGB)
#define RGB_WHEEL_STEPS      768U
#define RGB_MIN_PERIOD       50U
#define FRAME_V2_STATE       0x20U
#define FRAME_V2_END         (FRAME_V2_STATE + LED_COUNT * 3U)
#define FRAME_V2_TIMEOUT_MS  15000U
#define BOOT_MAGIC0          0x42343344U
#define BOOT_MAGIC1          0x31544F4FU
#define BOOT_FORMAT          0x0001001EU
#define BOOT_ENABLE          0xA5C33CA5U
#define BOOT_DISABLED_CRC32  0xF6652507U
#define BOOT_TAIL            0x21444E45U

typedef struct {
    uint32_t magic0;
    uint32_t magic1;
    uint32_t format;
    uint32_t flags;
    uint32_t colors[LED_COUNT];
    uint32_t configs[LED_COUNT];
    uint32_t effects[LED_COUNT];
    uint32_t crc32;
    uint32_t tail;
} BootScene;

_Static_assert(sizeof(BootScene) == 144U, "BootScene layout changed");
_Static_assert(offsetof(BootScene, format) == 8U, "BootScene format offset changed");
_Static_assert(offsetof(BootScene, colors) == 16U, "BootScene color offset changed");
_Static_assert(offsetof(BootScene, configs) == 56U, "BootScene config offset changed");
_Static_assert(offsetof(BootScene, effects) == 96U, "BootScene effect offset changed");
_Static_assert(offsetof(BootScene, crc32) == 136U, "BootScene CRC offset changed");
_Static_assert(offsetof(BootScene, tail) == 140U, "BootScene tail offset changed");

/*
 * Keep every persistent value in one volatile object.  The BIO assembly
 * converter cannot preserve byte-accurate offsets when LLVM's GlobalMerge
 * pass combines several independent globals and emits `.set` aliases for
 * them.  A single object makes all field offsets explicit in the generated
 * loads/stores and prevents the controller's flags from being relocated.
 */
typedef struct {
    uint32_t colors[LED_COUNT];
    uint32_t staged_colors[LED_COUNT];
    uint32_t configs[LED_COUNT];
    uint32_t staged_configs[LED_COUNT];
    uint32_t effects[LED_COUNT];
    uint32_t staged_effects[LED_COUNT];
    uint16_t phases[LED_COUNT];
    uint16_t delays[LED_COUNT];
    uint16_t rgb_fractions[LED_COUNT];
    uint32_t staged_pixel;
    uint32_t staged_config;
    uint8_t receive_index;
    uint8_t active;
    uint8_t guard_ms;
    uint8_t pause_ms;
    uint8_t frame_ms;
    uint8_t v2_was_active;
    uint16_t v2_timeout_ms;
    uint16_t boot_holdoff_ms;
    /* Occupies pre-existing alignment padding; BootScene stays at 320. */
    uint8_t quantum_class;
    BootScene boot;
} ControllerState;

_Static_assert(offsetof(ControllerState, quantum_class) == 318U, "Clock-class padding changed");
_Static_assert(offsetof(ControllerState, boot) == 320U, "Controller boot-record offset changed");
_Static_assert(sizeof(ControllerState) == 464U, "ControllerState layout changed");

static volatile ControllerState controller = {
    .boot = {
        .magic0 = BOOT_MAGIC0,
        .magic1 = BOOT_MAGIC1,
        .format = BOOT_FORMAT,
        .flags = 0U,
        .crc32 = BOOT_DISABLED_CRC32,
        .tail = BOOT_TAIL,
    },
};

static void wait_one_ms(void) {
    for (uint32_t i = 0; i < QUANTA_PER_MS; i++) {
        wait_quantum();
    }
}

static uint32_t aclk_delta(uint32_t start, uint32_t end) {
    return (end - start) & ACLK_COUNTER_MASK;
}

/*
 * Measure one complete, already-aligned quantum.  With the required 2.8 MHz
 * TargetFreqInt setup, the normal-clock divider is well above the threshold
 * and the 48 MHz WFI divider is about 17.  The class is not used to select a
 * waveform; it only detects divider handoffs so a frame is never continued
 * across one.
 */
static uint8_t measure_aligned_quantum_class(void) {
    uint32_t start = aclk_counter();
    wait_quantum();
    uint32_t elapsed = aclk_delta(start, aclk_counter());
    return elapsed < QUANTUM_CLASS_THRESHOLD ? QUANTUM_CLASS_SHORT : QUANTUM_CLASS_LONG;
}

static uint8_t measure_quantum_class(void) {
    /* Discard the first, phase-dependent wait; the next interval is whole. */
    wait_quantum();
    return measure_aligned_quantum_class();
}

static void hold_led_data_low(void) {
    uint32_t mask = 1U << LED_PIN;
    set_gpio_mask(mask);
    set_output_pins(mask);
    clear_gpio_pins_n(~mask);
}

static void note_quantum_class(uint8_t observed) {
    if (controller.quantum_class == QUANTUM_CLASS_UNKNOWN) {
        controller.quantum_class = observed;
        if (controller.guard_ms < CLOCK_CHANGE_GUARD_MS) {
            controller.guard_ms = CLOCK_CHANGE_GUARD_MS;
        }
    } else if (controller.quantum_class != observed) {
        controller.quantum_class = observed;
        controller.guard_ms = CLOCK_CHANGE_GUARD_MS;
        hold_led_data_low();
    }
}

/*
 * Keep symbol selection outside these noinline pulse routines.  This prevents
 * the optimizer from hoisting a shared GPIO-high operation ahead of the bit
 * branch.  Each routine first aligns to a quantum while the line is low, then
 * has no data-dependent branch while high.  Its final low wait plus the next
 * symbol's alignment wait provide the two-quantum low interval.
 */
__attribute__((noinline))
static void send_quantum_zero(uint32_t mask, uint32_t antimask) {
    /* Keep both GPIO values live before the pulse begins. */
    __asm__ volatile ("" : "+r"(mask), "+r"(antimask) : : "memory");
    wait_quantum();
    set_gpio_pins(mask);
    wait_quantum();
    clear_gpio_pins_n(antimask);
    wait_quantum();
}

__attribute__((noinline))
static void send_quantum_one(uint32_t mask, uint32_t antimask) {
    /* Keep both GPIO values live before the pulse begins. */
    __asm__ volatile ("" : "+r"(mask), "+r"(antimask) : : "memory");
    wait_quantum();
    set_gpio_pins(mask);
    wait_quantum();
    wait_quantum();
    clear_gpio_pins_n(antimask);
    wait_quantum();
}

static void send_quantum_pixel(uint32_t mask, uint32_t antimask, uint32_t pixel) {
    for (uint32_t bit = 0U; bit < 24U; bit++) {
        if ((pixel & 0x800000U) == 0U) {
            send_quantum_zero(mask, antimask);
        } else {
            send_quantum_one(mask, antimask);
        }
        pixel <<= 1;
    }
}

/*
 * Re-check a full, phase-aligned divider interval at every pixel boundary.
 * A handoff can corrupt at most the pixel already in flight; the data line is
 * then held low for a reset interval and CLOCK_CHANGE_GUARD_MS before a
 * complete replacement frame is sent.  In steady operation, the two-quantum
 * low probe between pixels remains orders of magnitude below the WS2812 reset
 * time.
 */
static void send_quantum_frame(uint32_t *pixels) {
    uint32_t mask = 1U << LED_PIN;
    uint32_t antimask = ~mask;
    uint8_t frame_class = controller.quantum_class;

    set_gpio_mask(mask);
    set_output_pins(mask);
    clear_gpio_pins_n(antimask);
    wait_quantum();

    for (uint32_t i = 0U; i < LED_COUNT; i++) {
        uint8_t observed = measure_quantum_class();
        if (observed != frame_class) {
            note_quantum_class(observed);
            hold_led_data_low();
            return;
        }
        send_quantum_pixel(mask, antimask, pixels[i]);
    }

    /* Catch a clock handoff in the final pixel before permitting another. */
    uint8_t observed = measure_quantum_class();
    if (observed != frame_class) {
        note_quantum_class(observed);
        hold_led_data_low();
    }
}

static uint8_t scale_channel(uint8_t channel, uint8_t brightness) {
    if (brightness == 255U) {
        return channel;
    }
    return (uint8_t) ((((uint32_t) channel) * ((uint32_t) brightness + 1U)) >> 8);
}

static uint8_t receiving_v2_frame(void) {
    return controller.receive_index >= FRAME_V2_STATE && controller.receive_index < FRAME_V2_END;
}

static void abort_v2_frame(void) {
    if (receiving_v2_frame() == 0U) {
        return;
    }
    controller.receive_index = 0xFFU;
    controller.v2_timeout_ms = 0U;
    controller.active = controller.v2_was_active;
    controller.frame_ms = 0U;
    if (controller.active == 0U) {
        set_gpio_mask(0U);
    }
}

static void render_frame(void) {
    uint32_t pixels[LED_COUNT];
    uint8_t blank_for_v2 = receiving_v2_frame();

    for (uint32_t i = 0; i < LED_COUNT; i++) {
        if (blank_for_v2 != 0U) {
            pixels[i] = 0U;
            continue;
        }

        uint32_t config = controller.configs[i];
        uint32_t effect = controller.effects[i];
        uint32_t period = (config >> 8) & 0xFFFU;
        uint32_t on_time = (config >> 20) & 0xFFFU;
        uint8_t brightness = (uint8_t) config;
        uint8_t enabled = 1U;
        uint8_t red = 0U;
        uint8_t green = 0U;
        uint8_t blue = 0U;

        if (controller.delays[i] != 0U) {
            controller.delays[i]--;
            enabled = 0U;
        } else if ((effect & EFFECT_RGB) != 0U) {
            uint16_t hue = controller.phases[i];
            uint8_t fade = (uint8_t) hue;

            if (hue < 256U) {
                red = (uint8_t) (255U - fade);
                green = fade;
            } else if (hue < 512U) {
                green = (uint8_t) (255U - fade);
                blue = fade;
            } else {
                blue = (uint8_t) (255U - fade);
                red = fade;
            }

            controller.rgb_fractions[i] = (uint16_t) (controller.rgb_fractions[i] + RGB_WHEEL_STEPS);
            while (controller.rgb_fractions[i] >= period) {
                controller.rgb_fractions[i] = (uint16_t) (controller.rgb_fractions[i] - period);
                hue++;
                if (hue >= RGB_WHEEL_STEPS) {
                    hue = 0U;
                }
            }
            controller.phases[i] = hue;
        } else {
            uint32_t color = controller.colors[i];
            enabled = (period == 0U || controller.phases[i] < on_time);
            red = (uint8_t) (color >> 8);
            green = (uint8_t) (color >> 16);
            blue = (uint8_t) color;

            if (period != 0U) {
                controller.phases[i]++;
                if (controller.phases[i] >= period) {
                    controller.phases[i] = 0U;
                }
            }
        }

        if (enabled != 0U && brightness != 0U) {
            green = scale_channel(green, brightness);
            red = scale_channel(red, brightness);
            blue = scale_channel(blue, brightness);
            pixels[i] = ((uint32_t) green << 16) | ((uint32_t) red << 8) | blue;
        } else {
            pixels[i] = 0U;
        }
    }

    send_quantum_frame(pixels);
}

static uint8_t valid_config(uint32_t config) {
    uint32_t period = (config >> 8) & 0xFFFU;
    uint32_t on_time = (config >> 20) & 0xFFFU;
    return (period == 0U && on_time == 0U) || (period != 0U && on_time <= period);
}

static uint8_t valid_effect(uint32_t effect, uint32_t config) {
    uint32_t period = (config >> 8) & 0xFFFU;
    uint32_t on_time = (config >> 20) & 0xFFFU;
    uint32_t delay = effect & EFFECT_DELAY_MASK;

    if ((effect & ~EFFECT_VALID_MASK) != 0U) {
        return 0U;
    }
    if ((effect & EFFECT_RGB) != 0U) {
        return period >= RGB_MIN_PERIOD && on_time == period;
    }
    return period != 0U || delay == 0U;
}

static void reset_animation(uint32_t index, uint32_t effect) {
    controller.phases[index] = 0U;
    controller.delays[index] = (uint16_t) (effect & EFFECT_DELAY_MASK);
    controller.rgb_fractions[index] = 0U;
}

static void commit_frame(void) {
    uint8_t was_active = controller.active;

    for (uint32_t i = 0; i < LED_COUNT; i++) {
        controller.colors[i] = controller.staged_colors[i];
        controller.configs[i] = controller.staged_configs[i];
        controller.effects[i] = controller.staged_effects[i];
        reset_animation(i, controller.staged_effects[i]);
    }

    controller.active = 1U;
    if (was_active == 0U) {
        controller.guard_ms = TAKEOVER_GUARD_MS;
    }
    controller.pause_ms = 0U;
    controller.frame_ms = 0U;
}

static void commit_pixel(uint32_t index, uint32_t effect) {
    uint8_t was_active = controller.active;

    controller.colors[index] = controller.staged_pixel;
    controller.configs[index] = controller.staged_config;
    controller.effects[index] = effect;
    reset_animation(index, effect);
    controller.active = 1U;
    if (was_active == 0U) {
        controller.guard_ms = TAKEOVER_GUARD_MS;
    }
    controller.pause_ms = 0U;
    controller.frame_ms = 0U;
}

static uint32_t boot_scene_crc32(void) {
    const volatile uint8_t *bytes = (const volatile uint8_t *) &controller.boot.format;
    uint32_t crc = 0xFFFFFFFFU;

    for (uint32_t i = 0; i < 128U; i++) {
        crc ^= bytes[i];
        for (uint32_t bit = 0; bit < 8U; bit++) {
            crc = (crc >> 1) ^ (0xEDB88320U & (0U - (crc & 1U)));
        }
    }
    return crc ^ 0xFFFFFFFFU;
}

static void load_boot_scene(void) {
    if (controller.boot.magic0 != BOOT_MAGIC0
        || controller.boot.magic1 != BOOT_MAGIC1
        || controller.boot.format != BOOT_FORMAT
        || controller.boot.flags != BOOT_ENABLE
        || controller.boot.tail != BOOT_TAIL
        || controller.boot.crc32 != boot_scene_crc32()) {
        return;
    }

    for (uint32_t i = 0; i < LED_COUNT; i++) {
        if ((controller.boot.colors[i] & 0xFF000000U) != 0U
            || valid_config(controller.boot.configs[i]) == 0U
            || valid_effect(controller.boot.effects[i], controller.boot.configs[i]) == 0U) {
            return;
        }
    }

    for (uint32_t i = 0; i < LED_COUNT; i++) {
        controller.staged_colors[i] = controller.boot.colors[i];
        controller.staged_configs[i] = controller.boot.configs[i];
        controller.staged_effects[i] = controller.boot.effects[i];
    }
    commit_frame();
    controller.boot_holdoff_ms = BOOT_HOLDOFF_MS;
}

static void receive_word(uint32_t word) {
    /* Control words always recover or restart a partial serial transaction. */
    if (word == RELEASE_MAGIC) {
        controller.receive_index = 0xFFU;
        controller.v2_timeout_ms = 0U;
        controller.boot_holdoff_ms = 0U;
        controller.active = 0U;
        set_gpio_mask(0U);
        return;
    }
    if (word == FRAME_MAGIC) {
        abort_v2_frame();
        for (uint32_t i = 0; i < LED_COUNT; i++) {
            controller.staged_effects[i] = 0U;
        }
        controller.receive_index = 0U;
        return;
    }
    if (word == FRAME_V2_MAGIC) {
        if (receiving_v2_frame() == 0U) {
            controller.v2_was_active = controller.active;
        }
        controller.receive_index = FRAME_V2_STATE;
        controller.active = 1U;
        if (controller.v2_was_active == 0U) {
            controller.guard_ms = TAKEOVER_GUARD_MS;
        }
        controller.pause_ms = 0U;
        controller.frame_ms = 0U;
        controller.v2_timeout_ms = FRAME_V2_TIMEOUT_MS;
        return;
    }
    if ((word & PIXEL_MAGIC_MASK) == PIXEL_MAGIC && (word & 0xFU) < LED_COUNT) {
        abort_v2_frame();
        controller.receive_index = (uint8_t) (0x80U | (word & 0xFU));
        return;
    }
    if ((word & PIXEL_MAGIC_MASK) == PIXEL_V2_MAGIC && (word & 0xFU) < LED_COUNT) {
        abort_v2_frame();
        controller.receive_index = (uint8_t) (0xB0U | (word & 0xFU));
        return;
    }

    if (controller.receive_index == 0xFFU) {
        return;
    }

    if ((controller.receive_index & 0xF0U) == 0x80U) {
        if ((word & 0xFF000000U) == 0U) {
            controller.staged_pixel = word;
            controller.receive_index = (uint8_t) (0x90U | (controller.receive_index & 0xFU));
        } else {
            controller.receive_index = 0xFFU;
        }
        return;
    }

    if ((controller.receive_index & 0xF0U) == 0x90U) {
        uint32_t index = controller.receive_index & 0xFU;
        if (valid_config(word) != 0U) {
            controller.staged_config = word;
            commit_pixel(index, 0U);
            controller.receive_index = (uint8_t) (0xA0U | index);
        } else {
            controller.receive_index = 0xFFU;
        }
        return;
    }

    if ((controller.receive_index & 0xF0U) == 0xA0U) {
        uint32_t index = controller.receive_index & 0xFU;
        if (valid_effect(word, controller.staged_config) != 0U) {
            commit_pixel(index, word);
        }
        controller.receive_index = 0xFFU;
        return;
    }

    if ((controller.receive_index & 0xF0U) == 0xB0U) {
        if ((word & 0xFF000000U) == 0U) {
            controller.staged_pixel = word;
            controller.receive_index = (uint8_t) (0xC0U | (controller.receive_index & 0xFU));
        } else {
            controller.receive_index = 0xFFU;
        }
        return;
    }

    if ((controller.receive_index & 0xF0U) == 0xC0U) {
        uint32_t index = controller.receive_index & 0xFU;
        if (valid_config(word) != 0U) {
            controller.staged_config = word;
            controller.receive_index = (uint8_t) (0xD0U | index);
        } else {
            controller.receive_index = 0xFFU;
        }
        return;
    }

    if ((controller.receive_index & 0xF0U) == 0xD0U) {
        uint32_t index = controller.receive_index & 0xFU;
        if (valid_effect(word, controller.staged_config) != 0U) {
            commit_pixel(index, word);
        }
        controller.receive_index = 0xFFU;
        return;
    }

    if (controller.receive_index >= FRAME_V2_STATE && controller.receive_index < FRAME_V2_END) {
        uint32_t position = controller.receive_index - FRAME_V2_STATE;
        if (position < LED_COUNT) {
            if ((word & 0xFF000000U) != 0U) {
                abort_v2_frame();
                return;
            }
            controller.staged_colors[position] = word;
        } else if (position < LED_COUNT * 2U) {
            if (valid_config(word) == 0U) {
                abort_v2_frame();
                return;
            }
            controller.staged_configs[position - LED_COUNT] = word;
        } else {
            uint32_t index = position - LED_COUNT * 2U;
            if (valid_effect(word, controller.staged_configs[index]) == 0U) {
                abort_v2_frame();
                return;
            }
            controller.staged_effects[index] = word;
        }

        controller.receive_index++;
        controller.v2_timeout_ms = FRAME_V2_TIMEOUT_MS;
        if (controller.receive_index == FRAME_V2_END) {
            commit_frame();
            controller.receive_index = 0xFFU;
            controller.v2_timeout_ms = 0U;
        }
        return;
    }

    if (controller.receive_index < LED_COUNT) {
        if ((word & 0xFF000000U) != 0U) {
            controller.receive_index = 0xFFU;
            return;
        }
        controller.staged_colors[controller.receive_index++] = word;
        return;
    }

    if (controller.receive_index < LED_COUNT * 2U) {
        if (valid_config(word) == 0U) {
            controller.receive_index = 0xFFU;
            return;
        }
        controller.staged_configs[controller.receive_index - LED_COUNT] = word;
        controller.receive_index++;
        if (controller.receive_index == LED_COUNT * 2U) {
            /* Legacy-compatible base commit; effect words may follow. */
            commit_frame();
        }
        return;
    }

    if (controller.receive_index < LED_COUNT * 3U) {
        uint32_t index = controller.receive_index - LED_COUNT * 2U;
        if (valid_effect(word, controller.staged_configs[index]) == 0U) {
            controller.receive_index = 0xFFU;
            return;
        }
        controller.staged_effects[index] = word;
        controller.receive_index++;
        if (controller.receive_index == LED_COUNT * 3U) {
            commit_frame();
            controller.receive_index = 0xFFU;
        }
    }
}

void main(void) {
    controller.receive_index = 0xFFU;
    set_event_mask(0U);
    load_boot_scene();

    while (1) {
        while ((event_status() & FIFO3_AVAILABLE_MASK) != 0U) {
            receive_word(pop_fifo3());
        }

        /*
         * A complete scene normally arrives one console command at a time.
         * If USB disappears mid-transfer, stop holding the chain black and
         * restore the scene (or released stock renderer) that owned it before
         * the V2 header.  Every accepted payload word refreshes this deadline.
         */
        if (receiving_v2_frame() != 0U) {
            if (controller.v2_timeout_ms != 0U) {
                controller.v2_timeout_ms--;
            }
            if (controller.v2_timeout_ms == 0U) {
                abort_v2_frame();
            }
        }

        /*
         * Persisted BIO is reloaded before the stock Lightgenes core is
         * created.  That core's first two FIFO1 words must be pin=15 and
         * LED-count=10.  A boot scene therefore stays completely silent long
         * enough for stock initialization; runtime-only installs have a zero
         * holdoff and remain immediate.
         */
        if (controller.boot_holdoff_ms != 0U) {
            controller.boot_holdoff_ms--;
        } else if (controller.active != 0U) {
            if (controller.pause_ms == 0U) {
                push_fifo1(STOCK_PAUSE);
                controller.pause_ms = PAUSE_REFRESH_MS;
            }

            note_quantum_class(measure_quantum_class());

            if (controller.guard_ms != 0U) {
                controller.guard_ms--;
            } else if (controller.frame_ms == 0U) {
                render_frame();
                controller.frame_ms = FRAME_TICK_MS;
            }

            if (controller.pause_ms != 0U) {
                controller.pause_ms--;
            }
            if (controller.frame_ms != 0U) {
                controller.frame_ms--;
            }
        }

        wait_one_ms();
    }
}
