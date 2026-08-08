'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SERIAL_CHAR_DELAY_MS,
  classifyWholeLineResponse,
  createCommandEchoGate,
  writeBytesBurst,
  writeBytesPaced,
} = require('../../main/assets/www/serial-protocol.js');

function accepts(command, lines, accepted = 'OK') {
  const gate = createCommandEchoGate(command);
  for (const line of lines) {
    const result = gate.consume(line);
    if (result.kind === 'conflicting-echo') throw new Error('conflicting command echo');
    if (result.kind === 'response' && result.authorized && line === accepted) return true;
  }
  return false;
}

test('stale command echo is ignored until the current exact echo arrives', () => {
  assert.equal(accepts('image CURRENT', [
    '[console] image OLD',
    '[console] image CURRENT',
    'OK',
  ]), true);
});

test('a stale echo and final response cannot authorize a command by themselves', () => {
  assert.equal(accepts('image CURRENT', ['[console] image OLD', 'OK']), false);
});

test('a final response before the exact echo is ignored', () => {
  assert.equal(accepts('image CURRENT', [
    'OK',
    '[console] image CURRENT',
    'OK',
  ]), true);
});

test('a different command echo after the expected echo is ambiguous', () => {
  assert.throws(() => accepts('image CURRENT', [
    '[console] image CURRENT',
    '[console] image OTHER',
    'OK',
  ]), /conflicting command echo/);
});

test('the firmware bare console marker remains harmless chatter', () => {
  assert.equal(accepts('image CURRENT', [
    '[console]',
    '[console] image CURRENT',
    '[console]',
    'OK',
  ]), true);
});

test('serial bytes use the physically verified 60 ms inter-character delay', async () => {
  const events = [];
  await writeBytesPaced(Uint8Array.of(0x41, 0x42, 0x43), {
    write: async (byte) => events.push(['write', [...byte]]),
    wait: async (milliseconds) => events.push(['wait', milliseconds]),
  });

  assert.equal(SERIAL_CHAR_DELAY_MS, 60);
  assert.deepEqual(events, [
    ['write', [0x41]],
    ['wait', 60],
    ['write', [0x42]],
    ['wait', 60],
    ['write', [0x43]],
  ]);
});

test('a one-byte serial write has no trailing delay', async () => {
  const events = [];
  await writeBytesPaced(Uint8Array.of(0x0a), {
    write: async (byte) => events.push(['write', [...byte]]),
    wait: async (milliseconds) => events.push(['wait', milliseconds]),
  });

  assert.deepEqual(events, [['write', [0x0a]]]);
});

test('the official image path writes a complete command in one burst', async () => {
  const events = [];
  await writeBytesBurst(Uint8Array.of(0x41, 0x42, 0x0a), {
    assertReady: () => events.push(['ready']),
    write: async (bytes) => events.push(['write', [...bytes]]),
  });

  assert.deepEqual(events, [
    ['ready'],
    ['write', [0x41, 0x42, 0x0a]],
    ['ready'],
  ]);
});

test('the official image parser accepts only exact whole-line replies', () => {
  const accepted = ['OK', 'SUCCESS'];
  assert.equal(classifyWholeLineResponse('OK', accepted), 'accepted');
  assert.equal(classifyWholeLineResponse('SUCCESS', accepted), 'accepted');
  assert.equal(classifyWholeLineResponse('ERR', accepted), 'error');
  assert.equal(classifyWholeLineResponse('ERR :display timeout', accepted), 'chatter');
  assert.equal(classifyWholeLineResponse('[console] image AAAA', accepted), 'chatter');
  assert.equal(classifyWholeLineResponse('Input overflow to 17, dropping keys!', accepted), 'chatter');
});
