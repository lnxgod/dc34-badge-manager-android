'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PATTERNS, PALETTES, compilePattern, packTiming, encodeMorse } = require('../../main/assets/www/direct-led-patterns.js');

const nativeEffects = new Set(['steady', 'flash', 'rgb']);

test('every selectable badge pattern compiles to ten valid native pixels', () => {
  for (const pattern of PATTERNS.filter((candidate) => candidate.id !== 'custom')) {
    const scene = compilePattern({ id: pattern.id, paletteId: 'dc34', speed: 52, level: 100, width: 35, count: 10, brightnessMax: 64 });
    assert.equal(scene.length, 10, pattern.id);
    for (const led of scene) {
      assert.match(led.color, /^#[0-9a-f]{6}$/i, pattern.id);
      assert.ok(led.brightness >= 0 && led.brightness <= 64, pattern.id);
      assert.ok(nativeEffects.has(led.effect), pattern.id);
      assert.equal(led.periodMs % 20, 0, pattern.id);
      assert.equal(led.delayMs % 20, 0, pattern.id);
    }
  }
});

test('blink is synchronized and alternates with true black', () => {
  const scene = compilePattern({ id: 'blink', paletteId: 'warm', speed: 50, level: 80, width: 42, count: 10, brightnessMax: 64 });
  assert.ok(scene.every((led) => led.effect === 'flash'));
  assert.ok(scene.every((led) => led.duty === 42));
  assert.ok(scene.every((led) => led.delayMs === 0));
});

test('blackout sets every selected pixel brightness to zero', () => {
  const scene = compilePattern({ id: 'off', count: 8, level: 100, brightnessMax: 255 });
  assert.equal(scene.length, 8);
  assert.ok(scene.every((led) => led.brightness === 0 && led.effect === 'steady'));
});

test('solid uses one palette color across every selected pixel', () => {
  const scene = compilePattern({ id: 'solid', paletteId: 'rainbow', count: 10, level: 100, brightnessMax: 64 });
  assert.equal(new Set(scene.map((led) => led.color)).size, 1);
  assert.ok(scene.every((led) => led.effect === 'steady' && led.brightness === 64));
});

test('chase direction reverses phase delays', () => {
  const forward = compilePattern({ id: 'chase', count: 8, speed: 60, level: 60, width: 20, direction: 'forward' });
  const reverse = compilePattern({ id: 'chase', count: 8, speed: 60, level: 60, width: 20, direction: 'reverse' });
  assert.deepEqual(forward.map((led) => led.delayMs), reverse.map((led) => led.delayMs).reverse());
  assert.ok(forward[0].delayMs < forward.at(-1).delayMs);
});

test('rainbow uses safe RGB periods and a shared repeating epoch', () => {
  const scene = compilePattern({ id: 'rainbow', count: 10, speed: 100, level: 100, direction: 'forward', brightnessMax: 64 });
  assert.ok(scene.every((led) => led.effect === 'rgb' && led.periodMs >= 1_000));
  assert.equal(new Set(scene.map((led) => led.periodMs)).size, 1);
  assert.equal(scene[0].delayMs, 0);
  assert.ok(scene.at(-1).delayMs > 0);
});

test('packed timing reports the controller effective duty after tick quantization', () => {
  assert.deepEqual(packTiming({ effect: 'flash', periodMs: 80, duty: 1 }), {
    periodMs: 80,
    periodTicks: 4,
    onTimeTicks: 1,
    effectiveDuty: 0.25,
  });
});

test('identify colors remain unique for full, ring-only, and eye-only targets', () => {
  for (const count of [10, 8, 2]) {
    const scene = compilePattern({ id: 'identify', count, level: 100, brightnessMax: 64 });
    assert.equal(new Set(scene.map((led) => led.color)).size, count);
  }
});

test('sweep and chase compile to visibly distinct scenes', () => {
  const options = { count: 10, paletteId: 'dc34', speed: 55, width: 25, level: 60, brightnessMax: 64 };
  assert.notDeepEqual(compilePattern({ ...options, id: 'sweep' }), compilePattern({ ...options, id: 'chase' }));
});

test('traffic signal cycles red, green, and amber groups on the 20 ms grid', () => {
  const scene = compilePattern({ id: 'traffic', count: 10, speed: 55, level: 60, brightnessMax: 64 });
  assert.deepEqual([...new Set(scene.map((led) => led.color))], ['#ff2020', '#20db55', '#ffb000']);
  assert.equal(new Set(scene.map((led) => led.periodMs)).size, 1);
  assert.equal(new Set(scene.map((led) => led.delayMs)).size, 3);
  assert.ok(scene.every((led) => led.effect === 'flash' && led.periodMs % 20 === 0 && led.delayMs % 20 === 0));
});

test('Morse encoder maps SOS to nine timed marks without changing the controller quantum', () => {
  const encoded = encodeMorse('SOS');
  assert.equal(encoded.normalized, 'SOS');
  assert.equal(encoded.code, '... --- ...');
  assert.equal(encoded.marks.length, 9);
  assert.equal(encoded.truncated, false);

  const scene = compilePattern({ id: 'morse', morseText: 'SOS', count: 10, speed: 55, level: 60, brightnessMax: 64 });
  assert.equal(scene.filter((led) => led.effect === 'flash').length, 9);
  assert.equal(scene.filter((led) => led.brightness === 0).length, 1);
  assert.ok(scene.every((led) => led.periodMs % 20 === 0 && led.delayMs % 20 === 0));
  assert.deepEqual(scene.slice(0, 9).map((led) => led.delayMs), [...scene.slice(0, 9).map((led) => led.delayMs)].sort((a, b) => a - b));
});

test('meme scenes are distinct native animations', () => {
  const options = { count: 10, speed: 55, level: 60, brightnessMax: 64 };
  const nyan = compilePattern({ ...options, id: 'nyan' });
  const hack = compilePattern({ ...options, id: 'hack-planet' });
  assert.ok(nyan.every((led) => led.effect === 'flash'));
  assert.ok(hack.every((led) => led.effect === 'flash'));
  assert.notDeepEqual(nyan, hack);
});

test('ping pong alternates the physical left and right badge halves', () => {
  const scene = compilePattern({ id: 'ping-pong', count: 10, speed: 55, width: 50, level: 60, brightnessMax: 64 });
  const expectedSides = [0, 1, 0, 1, 1, 1, 1, 0, 0, 0];
  const delays = [...new Set(scene.map((led) => led.delayMs))];
  assert.equal(delays.length, 2);
  expectedSides.forEach((side, index) => assert.equal(scene[index].delayMs, delays[side]));
  assert.ok(scene.every((led) => led.effect === 'flash' && led.duty === 50));
});

test('friend or foe uses green and red opposing sides', () => {
  const scene = compilePattern({ id: 'friend-foe', count: 10, speed: 55, width: 40, level: 60, brightnessMax: 64 });
  assert.deepEqual([...new Set(scene.map((led) => led.color))], ['#20db55', '#ff2038']);
  assert.equal(scene[0].color, '#20db55');
  assert.equal(scene[1].color, '#ff2038');
  assert.notEqual(scene[0].delayMs, scene[1].delayMs);
});

test('portal collision sends mirrored cyan and magenta pairs inward', () => {
  const scene = compilePattern({ id: 'portal-collision', count: 10, speed: 55, width: 25, level: 60, brightnessMax: 64 });
  assert.equal(scene[0].color, '#00d8ff');
  assert.equal(scene.at(-1).color, '#ff00aa');
  assert.deepEqual(scene.map((led) => led.delayMs), [...scene.map((led) => led.delayMs)].reverse());
});

test('triforce pulse cycles three gold groups on the controller tick grid', () => {
  const scene = compilePattern({ id: 'triforce-pulse', count: 10, speed: 55, width: 30, level: 60, brightnessMax: 64 });
  assert.equal(new Set(scene.map((led) => led.color)).size, 3);
  assert.equal(new Set(scene.map((led) => led.delayMs)).size, 3);
  assert.ok(scene.every((led) => led.periodMs % 20 === 0 && led.delayMs % 20 === 0));
});

test('entropy engine is a practical 707-quintillion-year native show', () => {
  const scene = compilePattern({ id: 'entropy-engine', count: 10, level: 60, brightnessMax: 64 });
  const expectedTicks = [4001, 4093, 149, 257, 401, 613, 887, 1291, 2053, 3079];
  const actualTicks = scene.map((led) => packTiming(led).periodTicks);
  const gcd = (left, right) => right === 0 ? left : gcd(right, left % right);

  assert.deepEqual(actualTicks, expectedTicks);
  assert.deepEqual(scene.map((led) => led.effect), ['rgb', 'rgb', 'flash', 'flash', 'flash', 'flash', 'flash', 'flash', 'flash', 'flash']);
  assert.ok(scene.every((led) => led.periodMs <= 81_900 && led.delayMs <= 81_900));
  for (let left = 0; left < actualTicks.length; left += 1) {
    for (let right = left + 1; right < actualTicks.length; right += 1) {
      assert.equal(gcd(actualTicks[left], actualTicks[right]), 1);
    }
  }

  const repeatTicks = actualTicks.reduce((product, ticks) => product * BigInt(ticks), 1n);
  assert.equal(repeatTicks, 1_115_791_465_593_196_987_157_903_261_123n);
  const repeatYears = Number(repeatTicks) * 0.02 / (365.2425 * 86_400);
  assert.ok(repeatYears > 7e20);
});

test('catalog ids and palette ids are unique', () => {
  assert.equal(PATTERNS.filter((pattern) => pattern.id !== 'custom').length, 25);
  assert.equal(new Set(PATTERNS.map((pattern) => pattern.id)).size, PATTERNS.length);
  assert.equal(new Set(PALETTES.map((palette) => palette.id)).size, PALETTES.length);
});
