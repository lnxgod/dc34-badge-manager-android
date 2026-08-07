'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../main/assets/www/wled-catalog.js');

test('contains all 216 registered WLED v16.0.1 effects exactly once', () => {
  const ids = catalog.effects.map(({ id }) => id);

  assert.equal(catalog.version, '16.0.1');
  assert.equal(catalog.effects.length, 216);
  assert.equal(new Set(ids).size, 216);
});

test('omits the four reserved effect IDs', () => {
  const ids = new Set(catalog.effects.map(({ id }) => id));

  assert.deepEqual(
    [142, 169, 170, 171].filter((id) => ids.has(id)),
    [],
  );
});

test('classifies effects from official WLED metadata flags', () => {
  const counts = Object.fromEntries(
    ['one-d', 'audio', 'matrix'].map((group) => [
      group,
      catalog.effects.filter((effect) => effect.group === group).length,
    ]),
  );

  assert.deepEqual(counts, {
    'one-d': 135,
    audio: 28,
    matrix: 53,
  });
});

test('exports deeply frozen catalog data', () => {
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.effects), true);
  assert.equal(catalog.effects.every(Object.isFrozen), true);
});
