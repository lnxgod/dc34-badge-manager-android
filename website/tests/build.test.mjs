import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = resolve(testsDirectory, '..');
const repositoryDirectory = resolve(websiteDirectory, '..');
const distDirectory = join(websiteDirectory, 'dist');
const badgeSourceDirectory = join(repositoryDirectory, 'app', 'src', 'main', 'assets', 'www');
const officialTalkTitle = "Why Couldn't I See My Own Drone? Remote ID, ESP32s, and the Packet Trail to Friend or Foe";

async function text(path) {
  return readFile(path, 'utf8');
}

function occurrences(source, value) {
  return source.split(value).length - 1;
}

test('landing page has one verified talk promotion', async () => {
  const html = await text(join(distDirectory, 'index.html'));

  assert.equal(occurrences(html, officialTalkTitle), 1);
  assert.match(html, /Saturday, Aug 8 · 4–5 PM PDT/);
  assert.match(html, /LVCC Level 1 · Exhibit Hall West 3 · Room 1102/);
  assert.match(html, /Will Hatzer \+ Charles “OhYou_” Grow/);
});

test('landing page credits the Chief Codex Pilot and uses the production subpath', async () => {
  const html = await text(join(distDirectory, 'index.html'));

  assert.match(html, /Charles “OhYou_” Grow/);
  assert.match(html, /Chief Codex Pilot/);
  assert.match(html, /href="\/dc34badge\/workbench\/index\.html"/);
  assert.match(html, /href="\/dc34badge\/workbench\/index\.html#image"/);
  for (const hash of ['image', 'bio', 'console', 'qr', 'lights', 'about']) {
    assert.match(html, new RegExp(`data-hash="${hash}"`));
  }
  assert.match(html, /id="job-panel"[^>]+role="tabpanel"[^>]+aria-labelledby="job-tab-image"/);
  assert.match(html, /src="\/dc34badge\/site\.js\?v=1"/);
  assert.match(html, /href="\/dc34badge\/styles\.css\?v=1"/);
});

test('web workbench keeps every shared Android control id', async () => {
  const sourceHtml = await text(join(badgeSourceDirectory, 'index.html'));
  const builtHtml = await text(join(distDirectory, 'workbench', 'index.html'));
  const sourceIds = [...sourceHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const builtIds = new Set([...builtHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

  for (const id of sourceIds) assert.ok(builtIds.has(id), `Missing shared workbench id: ${id}`);
  assert.match(builtHtml, /web-theme\.css\?v=1/);
  assert.match(builtHtml, /web\.js\?v=1/);
  assert.match(builtHtml, /Desktop Chrome or Edge for USB/);
  assert.match(builtHtml, /Charles “OhYou_” Grow · Chief Codex Pilot/);
  assert.match(builtHtml, /href="\/dc34badge">Back to badge page<\/a>/);
  assert.match(builtHtml, /Saving this scene at startup takes about eight minutes/);
  assert.match(builtHtml, /Light pattern simulator/);
  assert.doesNotMatch(builtHtml, /Why Couldn't I See My Own Drone/);
});

test('build copies shared runtime and binary assets without changing them', async () => {
  const sharedFiles = [
    'app.js',
    'serial-protocol.js',
    'android-serial.js',
    'vendor/qrcodegen.js',
    'bio/direct-led-bridge/direct-led-bridge.bin',
  ];

  for (const relativePath of sharedFiles) {
    const source = await readFile(join(badgeSourceDirectory, relativePath));
    const built = await readFile(join(distDirectory, 'workbench', relativePath));
    assert.deepEqual(built, source, `Shared asset changed during build: ${relativePath}`);
  }
});

test('expected deploy entry points exist', async () => {
  for (const relativePath of ['index.html', 'styles.css', 'site.js', 'favicon.svg', 'workbench/index.html', 'workbench/web-theme.css', 'workbench/web.js']) {
    const result = await stat(join(distDirectory, relativePath));
    assert.ok(result.isFile(), `Missing deploy file: ${relativePath}`);
  }
});
