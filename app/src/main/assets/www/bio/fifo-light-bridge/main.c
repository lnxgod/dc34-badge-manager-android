#include <stdint.h>

#include "bio.h"

#define FRAME_MAGIC 0xDC34B10CU
#define CODON_PREFIX 0x4000U
#define CODON_COUNT 9U
#define EYE_OFF 0x10000000U
#define EYE_ON 0x20000000U
#define LOCKED (CODON_COUNT + 1U)

// Relay framed light-gene commands from the loader's FIFO 3 to the stock
// renderer on FIFO 1. FRAME_MAGIC starts or restarts a frame, followed by
// phenotype indices 0 through 8 in exact order and one eye opcode. A complete
// frame relocks the relay; any unexpected word also relocks it. FRAME_MAGIC is
// control-only and is never forwarded.
void main(void) {
    uint32_t expected = LOCKED;

    while (1) {
        uint32_t word = pop_fifo3();

        if (word == FRAME_MAGIC) {
            expected = 0;
            continue;
        }

        if (expected < CODON_COUNT) {
            uint32_t index = (word >> 8) & 0xff;

            if ((word >> 16) == CODON_PREFIX && index == expected) {
                push_fifo1(word);
                expected++;
            } else {
                expected = LOCKED;
            }
            continue;
        }

        if (expected == CODON_COUNT && (word == EYE_OFF || word == EYE_ON)) {
            push_fifo1(word);
        }
        expected = LOCKED;
    }
}
