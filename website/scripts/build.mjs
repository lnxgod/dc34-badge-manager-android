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
  '<link rel="stylesheet" href="styles.css?v=13" />',
  '<link rel="stylesheet" href="styles.css?v=13" />\n    <link rel="stylesheet" href="web-theme.css?v=2" />',
  'the workbench theme',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<script src="app.js?v=37"></script>',
  '<script src="app.js?v=37"></script>\n    <script src="web.js?v=1"></script>',
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
  '<p class="eyebrow">LOCAL BADGE WORKBENCH</p>\n        <p class="hero-copy">Pick a tool, then connect the badge when needed. Files stay on this device.</p>',
  '<p class="eyebrow">DC34 BADGE WORKBENCH</p>\n        <h1>Choose a tool. Make it yours.</h1>\n        <p class="hero-copy">Connect when needed. Files stay on this device.</p>',
  'the workbench introduction',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="note">Web: use desktop Chrome or Edge. Android: use USB host mode.</p>',
  '<p class="note">Web: use desktop Chrome or Edge. Android: use a USB-C OTG data cable.</p>',
  'the connection helper text',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="note direct-startup-note">Startup save takes about six minutes. Keep the badge connected. After reboot, wait two seconds. To edit later, check <strong>ColorKernel installed</strong>.</p>',
  '<div class="note direct-startup-note task-note"><strong>Startup save takes about six minutes.</strong><p>Keep the badge connected. After reboot, wait two seconds. To edit later, check <strong>ColorKernel installed</strong>.</p></div>',
  'the direct-light startup instructions',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="note warning">Installing replaces the current BIO program. ColorKernel and BadgeMu use the same BIO slot. Bright scenes use more power. Rapid flashing can trigger photosensitive reactions.</p>',
  '<div class="note warning task-note"><strong>Before you install</strong><ul><li>ColorKernel and BadgeMu share one BIO slot.</li><li>Installing replaces the current BIO program.</li><li>Bright scenes use more power.</li><li>Rapid flashing can trigger photosensitive reactions.</li></ul></div>',
  'the direct-light installation warning',
);
workbenchIndex = replaceOnce(
  workbenchIndex,
  '<p class="note warning">Installing replaces the current BIO program. Check <strong>BadgeMu installed</strong> after reconnecting. Restore returns to the saved badge pattern.</p>',
  '<div class="note warning task-note"><strong>Choose the installed controller</strong><p>Installing replaces the current BIO program. After reconnecting, check <strong>BadgeMu installed</strong>. Restore returns to the saved badge pattern.</p></div>',
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
