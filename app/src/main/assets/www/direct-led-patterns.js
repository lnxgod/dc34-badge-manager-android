/*
 * Badge-safe light patterns compiled to the DC34 controller's three native
 * pixel modes: steady, flash-to-black, and RGB color wheel. WLED names and
 * IDs are used only for interoperability and attribution; no WLED algorithms
 * are copied. See https://kno.wled.ge/features/effects/.
 */
((root, factory) => {
  'use strict';
  const patterns = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = patterns;
  if (root) root.DC34DirectLedPatterns = patterns;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  'use strict';

  const TICK_MS = 20;
  const MAX_MS = 81_900;
  const RGB_MIN_MS = 1_000;

  const PATTERNS = Object.freeze([
    { id: 'custom', label: 'Custom / per-pixel', support: 'custom', description: 'Fine-tune each LED below.' },
    { id: 'off', label: 'Blackout / blank', support: 'exact', description: 'Turn every selected LED fully off.' },
    { id: 'solid', label: 'Solid on', support: 'exact', wledId: 0, description: 'Hold the selected palette at a steady brightness.' },
    { id: 'blink', label: 'Blink on → black', support: 'exact', wledId: 1, description: 'Blink between the selected palette and true black/off.' },
    { id: 'strobe', label: 'Strobe', support: 'exact', wledId: 23, description: 'Short flashes; rapid playback requires an explicit preview opt-in.' },
    { id: 'colorloop', label: 'Colorloop', support: 'exact', wledId: 8, description: 'Cycle every selected LED smoothly through red, green, and blue.' },
    { id: 'rainbow', label: 'Rainbow sweep', support: 'exact', wledId: 9, description: 'Stagger RGB color wheels across the selected pixels.' },
    { id: 'sweep', label: 'Sweep', support: 'approx', wledId: 6, description: 'A badge-safe one-way sweep built from staggered flashes.' },
    { id: 'twinkle', label: 'Twinkle', support: 'approx', wledId: 17, description: 'Deterministic staggered flashes that drift out of phase.' },
    { id: 'sparkle', label: 'Sparkle', support: 'approx', wledId: 20, description: 'Brief staggered flashes over a mostly dark scene.' },
    { id: 'chase', label: 'Chase', support: 'approx', wledId: 28, description: 'A repeating one-way chase; Direction reverses its travel.' },
    { id: 'running', label: 'Running lights', support: 'approx', wledId: 15, description: 'A wider staggered wave around the selected pixels.' },
    { id: 'dual-sweep', label: 'Dual sweep', support: 'approx', description: 'Two mirrored sweeps move from the edges toward the center.' },
    { id: 'police', label: 'Red + blue', support: 'badge', description: 'Alternate red and blue pixel groups.' },
    { id: 'traffic', label: 'Traffic signal', support: 'approx', wledId: 35, description: 'Cycle red, green, and amber groups with badge-safe timing.' },
    { id: 'morse', label: 'Morse encoder', support: 'badge', description: 'Repeat up to ten Morse marks across the selected LEDs using the original 20 ms timing.' },
    { id: 'nyan', label: 'Nyan rainbow', support: 'badge', description: 'Run a candy-colored rainbow trail around the selected LEDs.' },
    { id: 'hack-planet', label: 'Hack the planet', support: 'badge', description: 'Send a green terminal chase across the selected LEDs.' },
    { id: 'holiday', label: 'Holiday red + green', support: 'badge', description: 'Alternate red and green lights.' },
    { id: 'halloween', label: 'Halloween orange + purple', support: 'badge', description: 'Alternate orange and purple lights.' },
    { id: 'identify', label: 'Identify pixels', support: 'badge', description: 'Give every selected pixel a distinct steady color.' },
  ].map(Object.freeze));

  const PALETTES = Object.freeze([
    { id: 'dc34', label: 'DC34 spectrum', colors: ['#ff5a24', '#ff5a24', '#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0080ff', '#8000ff', '#ff00ff'] },
    { id: 'rainbow', label: 'Rainbow', colors: ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0080ff', '#8000ff', '#ff00ff'] },
    { id: 'party', label: 'Party', colors: ['#ff00aa', '#00d8ff', '#d7ff63', '#ff7a00'] },
    { id: 'ocean', label: 'Ocean', colors: ['#001b44', '#005b96', '#00a6c8', '#8fffe0'] },
    { id: 'forest', label: 'Forest', colors: ['#062d1c', '#16834b', '#79ffb0', '#d7ff63'] },
    { id: 'lava', label: 'Lava', colors: ['#300000', '#b31200', '#ff5a00', '#fff0a0'] },
    { id: 'fire', label: 'Fire', colors: ['#ff2b00', '#ff7800', '#ffd000', '#fff3cf'] },
    { id: 'icefire', label: 'Icefire', colors: ['#001c3d', '#006cff', '#55d8ff', '#ffffff'] },
    { id: 'sunset', label: 'Sunset', colors: ['#101050', '#6a1f8f', '#ff4054', '#ffb33b'] },
    { id: 'candy', label: 'Candy', colors: ['#ffe45e', '#ff5fa2', '#ff8b6a', '#7c5cff'] },
    { id: 'red-blue', label: 'Red + blue', colors: ['#ff2038', '#105dff'] },
    { id: 'c9', label: 'C9', colors: ['#ff2b1c', '#ff9a1f', '#43d05a', '#2f6bff'] },
    { id: 'warm', label: 'Warm white', colors: ['#ffd7a0'] },
    { id: 'mono', label: 'Cool white', colors: ['#eefcff'] },
  ].map((palette) => Object.freeze({ ...palette, colors: Object.freeze(palette.colors) })));

  const MORSE = Object.freeze({
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
    K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
    U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function quantizeMs(value, minimum = 0) {
    return clamp(Math.round(value / TICK_MS) * TICK_MS, minimum, MAX_MS);
  }

  function periodForSpeed(speed, slowest, fastest) {
    const position = clamp(Number(speed) || 1, 1, 100) / 100;
    return quantizeMs(slowest - (slowest - fastest) * position, fastest);
  }

  function paletteColors(id) {
    return (PALETTES.find((palette) => palette.id === id) || PALETTES[0]).colors;
  }

  function makeLed(color, brightness, effect = 'steady', periodMs = 1_000, duty = 50, delayMs = 0) {
    return {
      color,
      brightness,
      effect,
      periodMs: quantizeMs(periodMs, effect === 'rgb' ? RGB_MIN_MS : (effect === 'flash' ? 40 : 0)),
      duty: clamp(Math.round(duty), 1, 99),
      delayMs: quantizeMs(delayMs),
    };
  }

  function packTiming(led = {}) {
    const effect = ['steady', 'flash', 'rgb'].includes(led.effect) ? led.effect : 'steady';
    if (effect === 'steady') {
      return { periodMs: 0, periodTicks: 0, onTimeTicks: 0, effectiveDuty: 1 };
    }
    const minimumPeriod = effect === 'rgb' ? RGB_MIN_MS : 40;
    const periodMs = quantizeMs(Number.isFinite(Number(led.periodMs)) ? Number(led.periodMs) : 1_000, minimumPeriod);
    const periodTicks = clamp(Math.round(periodMs / TICK_MS), 1, 0xFFF);
    const requestedDuty = clamp(Number.isFinite(Number(led.duty)) ? Number(led.duty) : 50, 1, 99);
    const onTimeTicks = effect === 'rgb'
      ? periodTicks
      : clamp(Math.round(periodTicks * requestedDuty / 100), 1, periodTicks);
    return { periodMs, periodTicks, onTimeTicks, effectiveDuty: onTimeTicks / periodTicks };
  }

  function encodeMorse(value = 'SOS', maximumMarks = 10) {
    const normalized = String(value).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() || 'SOS';
    const timeline = [];
    let cursor = 0;
    const characters = [...normalized];
    characters.forEach((character, characterIndex) => {
      if (character === ' ') return;
      const code = MORSE[character];
      [...code].forEach((mark, markIndex) => {
        timeline.push({ mark, startUnits: cursor, durationUnits: mark === '-' ? 3 : 1 });
        cursor += mark === '-' ? 3 : 1;
        if (markIndex < code.length - 1) cursor += 1;
      });
      const nextCharacter = characters[characterIndex + 1];
      if (nextCharacter) cursor += nextCharacter === ' ' ? 7 : 3;
    });
    const marks = timeline.slice(0, clamp(Math.round(Number(maximumMarks) || 10), 1, 10));
    const last = marks.at(-1);
    return Object.freeze({
      normalized,
      code: characters.map((character) => character === ' ' ? '/' : MORSE[character]).join(' '),
      marks: Object.freeze(marks.map(Object.freeze)),
      totalUnits: (last ? last.startUnits + last.durationUnits : 1) + 7,
      truncated: timeline.length > marks.length,
    });
  }

  function compilePattern(options = {}) {
    const id = String(options.id || 'solid');
    const pattern = PATTERNS.find((candidate) => candidate.id === id);
    if (!pattern || id === 'custom') throw new Error(`Unsupported badge pattern: ${id}`);

    const count = clamp(Math.round(Number(options.count) || 10), 1, 10);
    const maximum = clamp(Math.round(Number(options.brightnessMax) || 64), 0, 255);
    const level = clamp(Number(options.level) || 0, 0, 100);
    const brightness = Math.round(maximum * level / 100);
    const width = clamp(Number(options.width) || 1, 1, 100);
    const reverse = options.direction === 'reverse';
    const colors = paletteColors(options.paletteId);
    const colorAt = (index) => colors[index % colors.length];
    const positionAt = (index) => reverse ? count - 1 - index : index;
    const flashPeriod = periodForSpeed(options.speed, 6_000, 200);
    const rgbPeriod = periodForSpeed(options.speed, 12_000, RGB_MIN_MS);
    const cyclePeriod = periodForSpeed(options.speed, 12_000, Math.max(400, count * 40));
    const phaseDelay = (position, period = cyclePeriod, positions = count) => (
      quantizeMs(period * position / Math.max(positions, 1))
    );
    const widthPixels = clamp(Math.round(1 + width / 100 * Math.max(1, count - 1)), 1, count);
    const chaseDuty = clamp(Math.round(widthPixels / count * 100), 1, 99);

    if (id === 'off') return Array.from({ length: count }, (_, index) => makeLed(colorAt(index), 0));
    if (id === 'solid') return Array.from({ length: count }, () => makeLed(colors[0], brightness));
    if (id === 'identify') {
      const identify = ['#ff2d2d', '#ff8c1a', '#ffe600', '#52e85d', '#00d8c8', '#1e90ff', '#485cff', '#963cff', '#e43cff', '#ff4f9a'];
      return Array.from({ length: count }, (_, index) => makeLed(identify[index], brightness));
    }
    if (id === 'blink' || id === 'strobe') {
      const period = id === 'strobe' ? periodForSpeed(options.speed, 900, 80) : flashPeriod;
      const duty = id === 'strobe' ? clamp(Math.round(width), 1, 25) : width;
      return Array.from({ length: count }, (_, index) => makeLed(colorAt(index), brightness, 'flash', period, duty));
    }
    if (id === 'colorloop' || id === 'rainbow') {
      return Array.from({ length: count }, (_, index) => makeLed(
        '#ff0000',
        brightness,
        'rgb',
        rgbPeriod,
        99,
        id === 'rainbow' ? phaseDelay(positionAt(index), rgbPeriod) : 0,
      ));
    }
    if (id === 'police' || id === 'holiday' || id === 'halloween') {
      const pair = id === 'police' ? ['#ff2038', '#105dff']
        : id === 'holiday' ? ['#ff2020', '#20db55']
          : ['#ff6a00', '#9b35ff'];
      return Array.from({ length: count }, (_, index) => makeLed(
        pair[index % 2], brightness, 'flash', flashPeriod, 50, index % 2 ? quantizeMs(flashPeriod / 2) : 0,
      ));
    }
    if (id === 'traffic') {
      const traffic = ['#ff2020', '#20db55', '#ffb000'];
      const period = periodForSpeed(options.speed, 9_000, 1_200);
      return Array.from({ length: count }, (_, index) => makeLed(
        traffic[index % traffic.length], brightness, 'flash', period, 28, phaseDelay(index % 3, period, 3),
      ));
    }
    if (id === 'morse') {
      const message = encodeMorse(options.morseText, count);
      const unitMs = periodForSpeed(options.speed, 600, 100);
      const period = quantizeMs(message.totalUnits * unitMs, 200);
      return Array.from({ length: count }, (_, index) => {
        const mark = message.marks[positionAt(index)];
        if (!mark) return makeLed(colorAt(index), 0);
        return makeLed(
          colorAt(index), brightness, 'flash', period,
          clamp(mark.durationUnits / message.totalUnits * 100, 1, 99),
          quantizeMs(mark.startUnits * unitMs),
        );
      });
    }
    if (id === 'twinkle' || id === 'sparkle') {
      return Array.from({ length: count }, (_, index) => {
        const drift = 0.72 + ((index * 37) % 53) / 100;
        const period = quantizeMs(cyclePeriod * drift, 80);
        const duty = id === 'sparkle' ? clamp(Math.round(width / 10), 1, 12) : clamp(Math.round(width / 3), 6, 34);
        return makeLed(colorAt(index), brightness, 'flash', period, duty, phaseDelay((index * 7) % count, period));
      });
    }
    if (id === 'dual-sweep') {
      const positions = Math.ceil(count / 2);
      return Array.from({ length: count }, (_, index) => {
        const mirrored = Math.min(index, count - 1 - index);
        const position = reverse ? positions - 1 - mirrored : mirrored;
        return makeLed(colorAt(index), brightness, 'flash', cyclePeriod, chaseDuty, phaseDelay(position, cyclePeriod, positions));
      });
    }

    if (id === 'nyan') {
      const nyan = PALETTES.find((palette) => palette.id === 'candy').colors;
      return Array.from({ length: count }, (_, index) => makeLed(
        nyan[index % nyan.length], brightness, 'flash', cyclePeriod, 34, phaseDelay(positionAt(index)),
      ));
    }

    if (id === 'hack-planet') {
      return Array.from({ length: count }, (_, index) => makeLed(
        index % 3 === 0 ? '#d7ff63' : '#20db55', brightness, 'flash', cyclePeriod, 24, phaseDelay(positionAt(index)),
      ));
    }

    if (id === 'sweep') {
      return Array.from({ length: count }, (_, index) => makeLed(
        colors[0], brightness, 'flash', cyclePeriod, chaseDuty, phaseDelay(positionAt(index)),
      ));
    }

    const duty = id === 'running' ? clamp(Math.max(chaseDuty, 45), 1, 75) : chaseDuty;
    return Array.from({ length: count }, (_, index) => makeLed(
      colorAt(index), brightness, 'flash', cyclePeriod, duty, phaseDelay(positionAt(index)),
    ));
  }

  return { PATTERNS, PALETTES, compilePattern, paletteColors, packTiming, encodeMorse };
});
