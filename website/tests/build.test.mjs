import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSiteBasePath, sitePath } from '../scripts/site-base.mjs';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = resolve(testsDirectory, '..');
const repositoryDirectory = resolve(websiteDirectory, '..');
const distDirectory = join(websiteDirectory, 'dist');
const badgeSourceDirectory = join(repositoryDirectory, 'app', 'src', 'main', 'assets', 'www');
const officialTalkTitle = "Why Couldn't I See My Own Drone? Remote ID, ESP32s, and the Packet Trail to Friend or Foe";
const siteBasePath = resolveSiteBasePath();

async function text(path) {
  return readFile(path, 'utf8');
}

function occurrences(source, value) {
  return source.split(value).length - 1;
}

test('site base path accepts project paths and rejects unsafe values', () => {
  assert.equal(resolveSiteBasePath('/dc34-badge-manager-android'), '/dc34-badge-manager-android');
  assert.equal(resolveSiteBasePath('/'), '');
  for (const unsafeValue of ['dc34badge', '/dc34badge/', '//dc34badge', '/../dc34badge', '/dc34badge?preview=1', '/dc34badge\\preview']) {
    assert.throws(() => resolveSiteBasePath(unsafeValue), /SITE_BASE_PATH/);
  }
});

test('landing page has one verified talk promotion', async () => {
  const html = await text(join(distDirectory, 'index.html'));

  assert.equal(occurrences(html, officialTalkTitle), 1);
  assert.match(html, /Saturday, Aug 8 · 4–5 PM PDT/);
  assert.match(html, /LVCC Level 1 · Exhibit Hall West 3 · Room 1102/);
  assert.match(html, /Will Hatzer \+ Charles “OhYou_” Grow/);
});

test('landing page credits the Chief Codex Pilot and uses the selected base path', async () => {
  const html = await text(join(distDirectory, 'index.html'));

  assert.match(html, /Charles “OhYou_” Grow/);
  assert.match(html, /Chief Codex Pilot/);
  assert.ok(html.includes(`data-site-base-path="${siteBasePath}"`));
  assert.ok(html.includes(`href="${sitePath(siteBasePath, 'workbench/index.html')}"`));
  assert.ok(html.includes(`href="${sitePath(siteBasePath, 'workbench/index.html')}#image"`));
  for (const hash of ['image', 'bio', 'console', 'qr', 'lights', 'about']) {
    assert.match(html, new RegExp(`data-hash="${hash}"`));
  }
  assert.match(html, /id="job-panel"[^>]+role="tabpanel"[^>]+aria-labelledby="job-tab-image"/);
  assert.ok(html.includes(`src="${sitePath(siteBasePath, 'site.js')}?v=1"`));
  assert.ok(html.includes(`href="${sitePath(siteBasePath, 'styles.css')}?v=2"`));
  assert.equal(occurrences(html, 'releases/tag/v0.1.1-beta.3'), 2);
  assert.match(html, /rel="canonical" href="https:\/\/gamechangersai\.org\/dc34badge"/);
  assert.doesNotMatch(html, /__DC34_SITE_BASE_PATH__/);

  const siteJavaScript = await text(join(distDirectory, 'site.js'));
  assert.match(siteJavaScript, /dataset\.siteBasePath/);
  assert.doesNotMatch(siteJavaScript, /\/dc34badge\/workbench/);
});

test('web workbench keeps every shared Android control id', async () => {
  const sourceHtml = await text(join(badgeSourceDirectory, 'index.html'));
  const builtHtml = await text(join(distDirectory, 'workbench', 'index.html'));
  const sourceIds = [...sourceHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const builtIds = new Set([...builtHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

  for (const id of sourceIds) assert.ok(builtIds.has(id), `Missing shared workbench id: ${id}`);
  assert.match(builtHtml, /styles\.css\?v=11/);
  assert.match(builtHtml, /web-theme\.css\?v=2/);
  assert.match(builtHtml, /web\.js\?v=1/);
  assert.match(builtHtml, /Desktop Chrome or Edge for USB/);
  assert.match(builtHtml, /Charles “OhYou_” Grow · Chief Codex Pilot/);
  assert.ok(builtHtml.includes(`href="${sitePath(siteBasePath)}">Back to badge page</a>`));
  assert.match(builtHtml, /Saving this scene at startup takes about four minutes/);
  assert.match(builtHtml, /Light pattern simulator/);
  assert.match(builtHtml, /src="wled-catalog\.js\?v=1"/);
  assert.match(builtHtml, /src="direct-led-patterns\.js\?v=1"/);
  assert.match(builtHtml, /src="serial-protocol\.js\?v=2"/);
  assert.match(builtHtml, /src="app\.js\?v=31"/);
  assert.doesNotMatch(builtHtml, /Why Couldn't I See My Own Drone/);
});

test('motion stays smooth, stable, and respectful of user preferences', async () => {
  const landingCss = await text(join(websiteDirectory, 'src', 'styles.css'));
  const workbenchCss = await text(join(websiteDirectory, 'src', 'workbench-theme.css'));
  const appJavaScript = await text(join(badgeSourceDirectory, 'app.js'));

  assert.match(landingCss, /badge-float 5s ease-in-out 700ms infinite alternate/);
  assert.match(landingCss, /\.job \{[^}]*margin: 5px 0;/);
  assert.doesNotMatch(landingCss, /\.job\.active \{[^}]*margin:/);
  assert.match(workbenchCss, /\.tab \{[^}]*margin: 5px 0;/);
  assert.doesNotMatch(workbenchCss, /\.tab\.active \{[^}]*margin:/);
  assert.match(workbenchCss, /prefers-reduced-motion:[\s\S]*?animation-iteration-count: 1 !important/);
  assert.match(appJavaScript, /LIGHT_PREVIEW_FRAME_MS = 1_000 \/ 30/);
  assert.match(appJavaScript, /previewVisible && !prefersReducedMotion\(\)/);
});

test('build copies shared runtime and binary assets without changing them', async () => {
  const sharedFiles = [
    'app.js',
    'direct-led-patterns.js',
    'wled-catalog.js',
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
  for (const relativePath of ['index.html', 'styles.css', 'site.js', 'favicon.svg', 'workbench/index.html', 'workbench/web-theme.css', 'workbench/web.js', 'workbench/direct-led-patterns.js', 'workbench/wled-catalog.js']) {
    const result = await stat(join(distDirectory, relativePath));
    assert.ok(result.isFile(), `Missing deploy file: ${relativePath}`);
  }
});
