'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCommandEchoGate } = require('../../main/assets/www/serial-protocol.js');

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
