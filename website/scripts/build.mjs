import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSiteBasePath, sitePath } from './site-base.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(websiteDirectory, '..');
const sourceDirectory = join(websiteDirectory, 'src');
const distDirectory = join(websiteDirectory, 'dist');
const badgeSourceDirectory = join(repositoryDirectory, 'app', 'src', 'main', 'assets', 'www');
const workbenchDirectory = join(distDirectory, 'workbench');
const siteBasePath = resolveSiteBasePath();
const siteBasePathToken = '__DC34_SITE_BASE_PATH__';

if (distDirectory !== join(websiteDirectory, 'dist')) {
  throw new Error('Refusing to clean an unexpected build directory.');
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first === -1) throw new Error(`Could not update ${label}; the shared workbench markup changed.`);
  if (source.indexOf(search, first + search.length) !== -1) {
    throw new Error(`Could not update ${label}; expected one source match.`);
  }
  return source.replace(search, replacement);
}

await rm(distDirectory, { recursive: true, force: true });
await mkdir(workbenchDirectory, { recursive: true });

for (const filename of ['styles.css', 'site.js', 'favicon.svg']) {
  await cp(join(sourceDirectory, filename), join(distDirectory, filename));
}

const landingTemplate = await readFile(join(sourceDirectory, 'index.html'), 'utf8');
if (!landingTemplate.includes(siteBasePathToken)) {
  throw new Error('Could not configure the landing page; the site base path token is missing.');
}
const landingIndex = landingTemplate.replaceAll(siteBasePathToken, siteBasePath);
if (landingIndex.includes(siteBasePathToken)) {
  throw new Error('Could not configure the landing page; an unresolved site base path token remains.');
}
await writeFile(join(distDirectory, 'index.html'), landingIndex, 'utf8');

await cp(badgeSourceDirectory, workbenchDirectory, { recursive: true });
await cp(join(sourceDirectory, 'workbench-theme.css'), join(workbenchDirectory, 'web-theme.css'));
await cp(join(sourceDirectory, 'workbench-web.js'), join(workbenchDirectory, 'web.js'));

const workbenchIndexPath = join(workbenchDirectory, 'index.html');
let workbenchIndex = await readFile(workbenchIndexPath, 'utf8');

workbenchIndex = replaceOnce(
  workbenchIndex,
  '<meta name="theme-color" content="#101411" />',
  '<meta name="theme-color" content="#06100f" />\n    <meta name="description" content="Customize the DEF CON 34 badge from a local-first browser workbench by GameChangers AI." />\n    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />',
  'the workbench metadata',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<title>DC34 / badge control</title>',
  '<title>DC34 Badge Workbench · GameChangers AI</title>',
  'the workbench title',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<link rel="stylesheet" href="styles.css?v=10" />',
  '<link rel="stylesheet" href="styles.css?v=10" />\n    <link rel="stylesheet" href="web-theme.css?v=1" />',
  'the workbench theme',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<script src="app.js?v=29"></script>',
  '<script src="app.js?v=29"></script>\n    <script src="web.js?v=1"></script>',
  'the web-only workbench behavior',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<a class="brand" href="#image" aria-label="DC34 Badge Control home">',
  '<a class="brand" href="#image" aria-label="DC34 Badge Workbench home">',
  'the workbench home label',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<span class="brand-mark">DC</span><span>34 / badge control</span>',
  '<span class="brand-mark">GC</span><span>GameChangers AI / DC34</span>',
  'the workbench brand',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="eyebrow">LOCAL BADGE WORKBENCH</p>\n        <p class="hero-copy">Prepare display art, load BIO programs, talk to the badge console, and create Vault provisioning codes. Badge data stays in this browser and serial traffic goes only to the device you select.</p>',
  '<p class="eyebrow">DC34 BADGE WORKBENCH</p>\n        <h1>Pick a job. We’ll handle the format.</h1>\n        <p class="hero-copy">Send screen art, load a BIO program, use the badge console, build QR codes, or tune the lights. Your files stay on this device, and USB traffic goes only to the badge you choose.</p>',
  'the workbench introduction',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p>Convert any image to the badge’s 128 × 128 black-and-white display format, then send it in 32 checked chunks.</p>',
  '<p>Choose an image. We’ll resize it to the badge’s 128 × 128 black-and-white format, show you the result, and send it safely.</p>',
  'the image helper text',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="note">The Android app uses native USB host mode; the desktop site uses Web Serial. The badge port opens at 1,000,000 baud with drop-safe command pacing.</p>',
  '<p class="note">On the web, USB access needs desktop Chrome or Edge over HTTPS. The Android app uses native USB. Both use careful pacing so the badge does not miss commands.</p>',
  'the connection helper text',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<div><p class="eyebrow">BIO + SAO HACKING</p><h2>I/O co-processor</h2></div>\n          <p>Load a compiled BIO binary, route its four external I/O lines, set its clock, and exchange values through FIFO 3.</p>',
  '<div><p class="eyebrow">BIO + SAO</p><h2>Load a small badge program</h2></div>\n          <p>Choose a compiled .bin file, then tell the badge which SAO pins and clock speed the program should use.</p>',
  'the BIO introduction',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<legend>External I/O mapping</legend>',
  '<legend>Connect the pins you need</legend>',
  'the BIO pin legend',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<label class="field-label" for="quantum">Clock setting <span>maximum 350 MHz</span></label>',
  '<label class="field-label" for="quantum">Clock speed <span>25 kHz to 350 MHz</span></label>',
  'the BIO clock label',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<div><p class="eyebrow">USB REPL</p><h2>Serial console</h2></div>\n          <p>Send stock console commands, inspect multiline responses, and use command history with the up and down arrow keys.</p>',
  '<div><p class="eyebrow">BADGE ACTIVITY</p><h2>Serial console</h2></div>\n          <p>Send a badge command and read the full reply. Use the up and down arrow keys to reuse earlier commands.</p>',
  'the console introduction',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="note direct-startup-note">Startup saving safely clears, writes, and confirms the persistent BIO image before reloading it. It takes about eight minutes at the badge’s drop-safe serial speed; an interrupted save falls back to the stock light pattern. On reboot, wait two seconds for the saved scene. The controller keeps valid LED timing during ordinary WFI sleep, so the display may sleep without turning the LEDs white; the stock battery-only deep power-down still occurs after roughly 25 minutes. To edit after reconnecting, choose <strong>Current controller already installed</strong> before Apply—Install controller &amp; apply intentionally disables the saved startup scene. Normal Apply remains runtime-only.</p>',
  '<div class="note direct-startup-note task-note"><strong>Saving this scene at startup takes about eight minutes.</strong><ol><li>Turn on <em>Auto-start this scene after reboot</em>.</li><li>Choose <em>Save startup setting</em> and keep the badge connected until it finishes.</li><li>After a reboot, wait two seconds for the lights to start.</li></ol><p>To edit the scene after reconnecting, choose <strong>Current controller already installed</strong>. Installing the controller again turns off the saved startup scene.</p><details class="technical-details"><summary>Technical details</summary><p>An interrupted save returns to the stock light pattern. A normal Apply changes only the current session. The controller keeps valid LED timing during ordinary WFI sleep; the badge’s battery-only deep power-down still occurs after roughly 25 minutes.</p></details></div>',
  'the direct-light startup instructions',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="note warning">Installation replaces any existing BIO program, but does not flash firmware or read/write <code>k0</code>. Delay is a one-time start offset with 20 ms resolution; it staggers flash and RGB phases. Full scene transfers hold the LEDs off until the complete scene is ready; later single-pixel changes use an atomic four-word update. Rapid 3–30 Hz flashing can trigger photosensitive reactions.</p>',
  '<div class="note warning task-note"><strong>Before you install</strong><ul><li>This replaces any BIO program already on the badge.</li><li>Bright white scenes can draw significant power.</li><li>Rapid 3–30 Hz flashing can trigger photosensitive reactions.</li></ul><details class="technical-details"><summary>Technical details</summary><p>This does not flash firmware or read or write <code>k0</code>. Delay is a one-time start offset in 20 ms steps. A full transfer keeps the LEDs off until the scene is ready; later one-pixel changes use an atomic four-word update.</p></details></div>',
  'the direct-light installation warning',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<div><p class="eyebrow">LIGHT-GENE LAB</p><h2>Phenotype simulator</h2></div>\n          <p>Use the signed stock procedural renderer instead of direct pixels: explore its nine-byte phenotype and official badge-type ranges.</p>',
  '<div><p class="eyebrow">SAVED LIGHT PATTERN</p><h2>Light pattern simulator</h2></div>\n          <p>Preview and adjust the nine settings used by the badge’s built-in light renderer.</p>',
  'the light-pattern introduction',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<label class="stack-label" for="gene-hex">Nine phenotype bytes</label>',
  '<label class="stack-label" for="gene-hex">Nine pattern bytes</label>',
  'the light-pattern byte label',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="note warning">First use replaces any existing BIO program. After reconnecting, use <code>Bridge already installed</code> only when this workbench or the direct repair session installed it. The bridge remains across reboot, while the forced phenotype is RAM-only. <code>Restore</code> clears the bridge and asks Vault to render the saved gene again. It never reads or writes <code>k0</code>.</p>',
  '<div class="note warning task-note"><strong>Using the light-pattern bridge</strong><ol><li>On first use, <em>Install bridge &amp; apply</em> replaces the badge’s current BIO program.</li><li>After reconnecting, choose <em>Bridge already installed</em> only if this workbench installed it.</li><li>Choose <em>Restore saved badge gene</em> to remove the bridge and return to the badge’s saved pattern.</li></ol><details class="technical-details"><summary>Technical details</summary><p>The bridge survives a reboot, but the previewed pattern lives only in RAM. Restore asks Vault to render the saved pattern again. The bridge never reads or writes <code>k0</code>.</p></details></div>',
  'the light-pattern bridge instructions',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<footer><span>Android · offline-first · no Internet permission.</span><a href="https://defcon.org/34b/" target="_blank" rel="noreferrer">Official badge help ↗</a></footer>',
  `<footer><span>Local by design · Desktop Chrome or Edge for USB</span><span>Charles “OhYou_” Grow · Chief Codex Pilot</span><a href="${sitePath(siteBasePath)}">Back to badge page</a></footer>`,
  'the workbench footer',
);

await writeFile(workbenchIndexPath, workbenchIndex, 'utf8');

console.log(`Built DC34 badge website for ${sitePath(siteBasePath)} at ${distDirectory}`);
