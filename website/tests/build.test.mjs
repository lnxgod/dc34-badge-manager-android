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
  assert.equal(occurrences(html, 'releases/tag/v0.1.1-beta.5'), 2);
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
  assert.match(builtHtml, /styles\.css\?v=13/);
  assert.match(builtHtml, /web-theme\.css\?v=2/);
  assert.match(builtHtml, /web\.js\?v=1/);
  assert.match(builtHtml, /Desktop Chrome or Edge for USB/);
  assert.match(builtHtml, /Charles “OhYou_” Grow · Chief Codex Pilot/);
  assert.ok(builtHtml.includes(`href="${sitePath(siteBasePath)}">Back to badge page</a>`));
  assert.match(builtHtml, /Choose a tool\. Make it yours\./);
  assert.match(builtHtml, /Startup save takes about six minutes/);
  assert.match(builtHtml, /Choose a pattern, tune it, then apply it/);
  assert.doesNotMatch(builtHtml, /Startup saving safely clears, writes, and confirms/);
  assert.doesNotMatch(builtHtml, /Experimental shared-pin takeover/);
  assert.match(builtHtml, /Light pattern simulator/);
  assert.doesNotMatch(builtHtml, /src="wled-catalog\.js/);
  assert.match(builtHtml, /src="direct-led-patterns\.js\?v=1"/);
  assert.match(builtHtml, /src="serial-protocol\.js\?v=5"/);
  assert.match(builtHtml, /src="app\.js\?v=37"/);
  assert.match(builtHtml, /id="adopt-direct-leds" type="checkbox"/);
  assert.match(builtHtml, /id="adopt-light-bridge" type="checkbox"/);
  assert.match(builtHtml, /ColorKernel installed/);
  assert.match(builtHtml, /BadgeMu installed/);
  assert.doesNotMatch(builtHtml, /Current controller already installed|Bridge already installed/);
  assert.doesNotMatch(builtHtml, /Why Couldn't I See My Own Drone/);
});

test('workbench opens with a ready-to-send Triforce starter image', async () => {
  const appJavaScript = await text(join(badgeSourceDirectory, 'app.js'));
  const builtHtml = await text(join(distDirectory, 'workbench', 'index.html'));

  assert.match(appJavaScript, /function createDefaultTriforce\(\)/);
  assert.match(appJavaScript, /triangle\(64, 13, 37, 91, 60\)/);
  assert.match(appJavaScript, /triangle\(36, 64, 9, 63, 111\)/);
  assert.match(appJavaScript, /triangle\(92, 64, 65, 119, 111\)/);
  assert.match(appJavaScript, /state\.imageName = 'Triforce starter'/);
  assert.match(appJavaScript, /state\.image = createDefaultTriforce\(\);\nstate\.imageName = 'Triforce starter';\nrenderImage\(\);/);
  assert.match(builtHtml, /During upload:<\/strong> Keep the badge still and on the same screen/);
  assert.match(builtHtml, /id="image-transfer-status"[^>]+aria-live="polite"/);
  assert.match(appJavaScript, /Moving or tilting it can change the badge screen and break the transfer/);
  assert.match(appJavaScript, /if \(!approved\) return log\('Image upload cancelled\.'/);
  assert.match(appJavaScript, /IMAGE_CHUNK_SETTLE_MS = 200/);
  assert.match(appJavaScript, /writeMode: 'burst'/);
  assert.match(appJavaScript, /settleMs: IMAGE_CHUNK_SETTLE_MS/);
  assert.match(appJavaScript, /responseMode: 'whole-line'/);
  assert.match(appJavaScript, /Waiting for badge connection/);
  assert.match(appJavaScript, /Uploading image · \$\{completed\} of \$\{total\} chunks/);
  assert.match(appJavaScript, /setLightBridgeStatus\('WAITING FOR BADGE…', 'active'\)/);
  assert.match(appJavaScript, /setLightBridgeStatus\('SENDING LIGHT SCENE…', 'active'\)/);
  assert.match(appJavaScript, /setLightBridgeStatus\('SENDING LIGHT PATTERN…', 'active'\)/);
  assert.match(appJavaScript, /summarizeSerialLine\(line\)/);
  assert.match(appJavaScript, /Image stopped after \$\{completedChunks\}\/32 chunks/);
  assert.doesNotMatch(appJavaScript, /Upload stopped: \$\{error\.message\}/);
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
