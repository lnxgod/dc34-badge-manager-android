/* DC34 Badge Control: local browser tools for the public image, BIO, console, and Vault protocols. */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const encoder = new TextEncoder();
const {
  SERIAL_CHAR_DELAY_MS,
  createCommandEchoGate,
  writeBytesPaced: writeSerialBytesPaced,
} = window.DC34SerialProtocol;

const IMAGE_BAUD = 1_000_000;
const BIO_MAX_BYTES = 0xF00;
const BIO_CHUNKS = 60;
const BIO_MIN_CLOCK = 25_000;
const BIO_MAX_CLOCK = 350_000_000;
const LIGHT_BRIDGE_CLOCK = 1_000_000;
const LIGHT_BRIDGE_FRAME_MAGIC = '0xdc34b10c';
// A slower quantum lets one waveform stay valid at both the normal BIO clock
// and the 48 MHz clock used while the main CPU is in WFI sleep.
const DIRECT_LED_BRIDGE_CLOCK = 2_800_000;
const DIRECT_LED_FRAME_MAGIC = '0xdc34d2ce';
const DIRECT_LED_PIXEL_MAGIC = 0xDC34E200;
const DIRECT_LED_RELEASE_MAGIC = '0xdc340ff0';
const DIRECT_LED_COUNT = 10;
const DIRECT_LED_TICK_MS = 20;
const LIGHT_PREVIEW_FRAME_MS = 1_000 / 30;
const DIRECT_LED_EFFECT_RGB = 0x1000;
const DIRECT_LED_RGB_MIN_PERIOD_MS = 1_000;
const DIRECT_LED_RGB_PRESET_PERIOD_MS = 3_000;
const DIRECT_LED_BOOT_MAGIC0 = 0x42343344;
const DIRECT_LED_BOOT_MAGIC1 = 0x31544F4F;
const DIRECT_LED_BOOT_FORMAT = 0x0001001E;
const DIRECT_LED_BOOT_ENABLE = 0xA5C33CA5;
const DIRECT_LED_BOOT_TAIL = 0x21444E45;
const DIRECT_LED_BOOT_RECORD_BYTES = 144;
const DIRECT_LED_BINARY_URL = 'bio/direct-led-bridge/direct-led-bridge.bin';
const DIRECT_LED_BINARY_SIZE = 3_052;
const DIRECT_LED_BINARY_SHA256 = '3e3d18f928c3091a22c8a036ad0701f3e60fbbc1e71f35fec2d496b52f17dfe9';
const DIRECT_LED_STORAGE_KEY = 'dc34badge.direct-led-scene.v1';
const DIRECT_LED_NAMES = Object.freeze([
  'Eye 1', 'Eye 2',
  'Ring 1', 'Ring 2', 'Ring 3', 'Ring 4',
  'Ring 5', 'Ring 6', 'Ring 7', 'Ring 8',
]);
const DIRECT_LED_DEFAULT_COLORS = Object.freeze([
  '#ff5a24', '#ff5a24', '#ff0000', '#ff8000', '#ffff00',
  '#00ff00', '#00ffff', '#0080ff', '#8000ff', '#ff00ff',
]);
const {
  PATTERNS: DIRECT_LED_PATTERNS,
  PALETTES: DIRECT_LED_PALETTES,
  compilePattern: compileDirectLedPattern,
  packTiming: packDirectLedTiming,
  encodeMorse: encodeDirectMorse,
} = window.DC34DirectLedPatterns;
const WLED_EFFECTS = window.WledCatalog.effects;
// This one-second post-command boundary is separate from the 30 ms typing gap
// and the controller's 20 ms LED animation quantum.
const SERIAL_COMMAND_SETTLE_MS = 1_000;
const COMMAND_PURGE_BACKSPACES = 128;
let commandBoundarySequence = 0;
let lightAnimationFrame = null;
let lastLightPreviewRender = Number.NEGATIVE_INFINITY;
const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
// Built from bio/fifo-light-bridge/main.c with the official Zig 0.15.2 BIO toolchain.
// The locked bridge accepts only a magic-framed 0..8 phenotype sequence and
// one exact eye-control opcode. SHA-256:
// 30575636ea2ebc7f0f25f64dc01490fd7548a4725546c5e25a7569badc67ea36
const LIGHT_BRIDGE_BINARY = new Uint8Array([
  0x37, 0x11, 0x00, 0x00, 0x09, 0xA0, 0x41, 0x11, 0x22, 0xC6, 0xA9, 0x46,
  0xB7, 0xB5, 0x34, 0xDC, 0x21, 0x45, 0x91, 0x63, 0x25, 0x46, 0x37, 0x03,
  0x00, 0x20, 0x13, 0x87, 0xC5, 0x10, 0xB7, 0x02, 0x00, 0x10, 0xCE, 0x87,
  0xB6, 0x85, 0x81, 0x46, 0xE3, 0x8D, 0xE7, 0xFE, 0x63, 0x7D, 0xB5, 0x00,
  0xA9, 0x46, 0xE3, 0x98, 0xC5, 0xFE, 0x63, 0x85, 0x67, 0x00, 0xA9, 0x46,
  0xE3, 0x93, 0x57, 0xFE, 0xBE, 0x88, 0xA9, 0x46, 0xF9, 0xBF, 0x13, 0xD4,
  0x07, 0x01, 0xA9, 0x46, 0xE3, 0x1B, 0x74, 0xFC, 0x93, 0x96, 0x07, 0x01,
  0x13, 0xD4, 0x86, 0x01, 0xA9, 0x46, 0xE3, 0x14, 0xB4, 0xFC, 0xBE, 0x88,
  0x93, 0x86, 0x15, 0x00, 0x7D, 0xBF,
]);
const SAO_PIN_MAP = Object.freeze({ 1: 21, 2: 22, 3: 30, 4: 31 });
const MAX_RX_LINES = 600;
const MAX_RX_QUEUED_CHARS = 256 * 1024;
const MAX_SERIAL_LINE_CHARS = 16 * 1024;
const MAX_CONSOLE_LINES = 800;
const MAX_CONSOLE_CHARS = 512 * 1024;
const MAX_QR_PAYLOAD_BYTES = 1_800;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const state = {
  port: null,
  writer: null,
  reader: null,
  readTask: null,
  closing: false,
  rxBuffer: '',
  rxLines: [],
  rxQueuedChars: 0,
  rxWaiters: [],
  serialTail: Promise.resolve(),
  serialOperationPending: false,
  serialBusy: 0,
  serialSession: 0,
  activeSerialSession: null,
  connecting: false,
  shellSynchronized: false,
  image: null,
  imageName: '',
  imageUrl: '',
  bio: null,
  consoleHistory: [],
  historyIndex: 0,
  qrPayload: '',
  gene: new Uint8Array([2, 128, 255, 208, 6, 32, 144, 160, 64]),
  bridgeMode: null,
  directLeds: DIRECT_LED_NAMES.map((_, index) => ({
    color: DIRECT_LED_DEFAULT_COLORS[index],
    brightness: index < 2 ? 32 : 16,
    effect: 'steady',
    periodMs: 1_000,
    duty: 50,
    delayMs: 0,
  })),
  directLedDirty: new Set(Array.from({ length: DIRECT_LED_COUNT }, (_, index) => index)),
  directLedSynced: false,
  directStartupState: 'unknown',
  directStartupFingerprint: null,
  directPatternSettings: {
    id: 'custom',
    paletteId: 'dc34',
    target: 'all',
    direction: 'forward',
    speed: 55,
    width: 25,
    level: 60,
    morseText: 'SOS',
  },
};

const canvas = $('#image-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function boundedText(element, text, maxLines, maxChars = MAX_CONSOLE_CHARS) {
  element.textContent += `${element.textContent ? '\n' : ''}${text}`;
  const lines = element.textContent.split('\n');
  if (lines.length > maxLines) element.textContent = lines.slice(-maxLines).join('\n');
  if (element.textContent.length > maxChars) element.textContent = element.textContent.slice(-maxChars);
  element.scrollTop = element.scrollHeight;
}

function log(message, level = 'info') {
  const now = new Date().toLocaleTimeString([], { hour12: false });
  boundedText($('#log'), `[${now}] ${level.padEnd(5)} ${message}`, 300);
}

function appendConsole(message) {
  boundedText($('#console-output'), message, MAX_CONSOLE_LINES);
}

function displaySerialLine(line) {
  if (!line) return;
  let display = line;
  if (line.length > 180 && /^\[console\]\s+(?:image|bio)\s/.test(line)) {
    display = `${line.slice(0, line.indexOf(' ', 11))} <chunk payload omitted>`;
  }
  appendConsole(`< ${display}`);
}

function updateConnection(connected) {
  $('#connection-dot').classList.toggle('connected', connected);
  if (connected) $('#connection-label').textContent = 'badge connected';
  else if (!serialAvailable()) $('#connection-label').textContent = 'Web Serial unavailable';
  else $('#connection-label').textContent = 'device disconnected';
  $('#connect-button').textContent = connected ? 'Disconnect' : 'Connect badge';
}

function activeImageReady() {
  $('#send-image').disabled = !state.image;
}

function activeBioReady() {
  $('#send-bio').disabled = !state.bio || state.bio.size === 0 || state.bio.size > BIO_MAX_BYTES;
}

function setImageEditorDisabled(disabled) {
  ['#send-image', '#clear-image', '#image-file', '#threshold', '#dither', '#invert'].forEach((selector) => {
    $(selector).disabled = disabled;
  });
  if (!disabled) activeImageReady();
}

function setBioEditorDisabled(disabled) {
  ['#send-bio', '#clear-bio', '#bio-file', '#quantum'].forEach((selector) => {
    $(selector).disabled = disabled;
  });
  $$('.sao-option input').forEach((input) => { input.disabled = disabled; });
  if (!disabled) activeBioReady();
}

function setLightBridgeStatus(message, level = '') {
  ['#light-bridge-status', '#direct-led-status'].forEach((selector) => {
    const status = $(selector);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('active', level === 'active');
    status.classList.toggle('error', level === 'error');
  });
  $('#apply-gene').textContent = state.bridgeMode === 'gene' ? 'Apply changes' : 'Install gene bridge & apply';
  const directButton = $('#apply-direct-leds');
  if (directButton) {
    directButton.textContent = state.bridgeMode === 'direct' ? 'Apply LED changes' : 'Install controller & apply';
  }
}

/* Tabs */
const tabs = $$('.tab');
const panels = $$('.panel');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function selectTab(name, { updateUrl = false, focus = false } = {}) {
  const target = tabs.find((tab) => tab.dataset.tab === name) || tabs[0];
  tabs.forEach((tab) => {
    const active = tab === target;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  panels.forEach((panel) => {
    const active = panel.dataset.panel === target.dataset.tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  updateLightAnimation();
  if (updateUrl && location.hash !== `#${target.dataset.tab}`) {
    history.pushState(null, '', `#${target.dataset.tab}`);
  }
  if (focus) target.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab, { updateUrl: true }));
  tab.addEventListener('keydown', (event) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(tabs[nextIndex].dataset.tab, { updateUrl: true, focus: true });
  });
});

function selectHashTab() {
  selectTab(location.hash.slice(1) || 'image');
}
window.addEventListener('hashchange', selectHashTab);
selectHashTab();
requestAnimationFrame(() => window.scrollTo(0, 0));
$('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  selectTab('image', { updateUrl: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('#clear-log').addEventListener('click', () => { $('#log').textContent = '[ready] Activity log cleared.'; });

/* Persistent Web Serial transport */
function serialAvailable() {
  return Boolean(window.DC34Android) || (window.isSecureContext && 'serial' in navigator);
}

function serialErrorMessage(error) {
  if (window.DC34Android && error?.message) return error.message;
  if (error?.name === 'NotFoundError') return 'Port selection was cancelled.';
  if (error?.name === 'SecurityError') return 'Serial access is blocked by browser security or site policy.';
  if (error?.name === 'NetworkError') return 'The serial port could not open; it may already be in use.';
  if (error?.name === 'InvalidStateError') return 'The selected serial port is already open.';
  return error?.message || 'Unknown serial error.';
}

function dispatchSerialLine(rawLine) {
  if (rawLine.length > MAX_SERIAL_LINE_CHARS) {
    const error = new Error(`Serial line exceeded ${MAX_SERIAL_LINE_CHARS.toLocaleString()} characters.`);
    state.shellSynchronized = false;
    rejectRxWaiters(error);
    displaySerialLine(`${rawLine.slice(0, 240)} … <oversized line discarded>`);
    log(error.message, 'error');
    return;
  }
  const line = rawLine.replace(/\r$/, '');
  displaySerialLine(line);
  const waiter = state.rxWaiters.shift();
  if (waiter) {
    clearTimeout(waiter.timer);
    waiter.resolve(line);
    return;
  }
  state.rxLines.push(line);
  state.rxQueuedChars += line.length;
  while (state.rxLines.length > MAX_RX_LINES || state.rxQueuedChars > MAX_RX_QUEUED_CHARS) {
    state.rxQueuedChars -= state.rxLines.shift().length;
  }
}

function feedSerialText(text, flush = false) {
  const parts = `${state.rxBuffer}${text}`.split('\n');
  state.rxBuffer = parts.pop() || '';
  parts.forEach(dispatchSerialLine);
  if (state.rxBuffer.length > MAX_SERIAL_LINE_CHARS) {
    const error = new Error(`Serial input exceeded ${MAX_SERIAL_LINE_CHARS.toLocaleString()} characters without a line break.`);
    state.rxBuffer = '';
    state.shellSynchronized = false;
    rejectRxWaiters(error);
    log(error.message, 'error');
  }
  if (flush && state.rxBuffer) {
    dispatchSerialLine(state.rxBuffer);
    state.rxBuffer = '';
    state.shellSynchronized = false;
  }
}

function rejectRxWaiters(error) {
  while (state.rxWaiters.length) {
    const waiter = state.rxWaiters.shift();
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
}

function nextSerialLine(timeoutMs) {
  if (state.rxLines.length) {
    const line = state.rxLines.shift();
    state.rxQueuedChars -= line.length;
    return Promise.resolve(line);
  }
  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      const index = state.rxWaiters.indexOf(waiter);
      if (index >= 0) state.rxWaiters.splice(index, 1);
      resolve(null);
    }, timeoutMs);
    state.rxWaiters.push(waiter);
  });
}

function clearRxQueue() {
  // Command boundaries discard an incomplete stale line as well as completed
  // lines. Otherwise its prefix can be joined to the next exact command echo.
  state.rxBuffer = '';
  state.rxLines.length = 0;
  state.rxQueuedChars = 0;
}

function startReadPump() {
  const reader = state.port.readable.getReader();
  const streamDecoder = new TextDecoder();
  let endedUnexpectedly = false;
  state.reader = reader;
  state.readTask = (async () => {
    try {
      while (!state.closing) {
        const { value, done } = await reader.read();
        if (done) {
          endedUnexpectedly = !state.closing;
          break;
        }
        if (value) feedSerialText(streamDecoder.decode(value, { stream: true }));
      }
      feedSerialText(streamDecoder.decode(), true);
    } catch (error) {
      if (!state.closing) {
        endedUnexpectedly = true;
        log(`Serial input stopped: ${error.message}`, 'warn');
      }
    } finally {
      try { reader.releaseLock(); } catch (_) { /* already released */ }
      if (state.reader === reader) state.reader = null;
      if (endedUnexpectedly) setTimeout(() => { if (state.port && !state.closing) void closeSerial(true); }, 0);
    }
  })();
}

async function connect() {
  if (state.connecting) {
    log('A USB connection request is already in progress.', 'info');
    return false;
  }
  if (!serialAvailable()) {
    log('Web Serial needs desktop Chrome or Edge on localhost/HTTPS. This browser can still use image previews and QR tools.', 'error');
    return false;
  }
  if (state.port) {
    await closeSerial(false);
    return false;
  }
  state.connecting = true;
  $('#connect-button').disabled = true;
  let chosenPort = null;
  try {
    chosenPort = await navigator.serial.requestPort();
    await chosenPort.open({ baudRate: IMAGE_BAUD, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    state.serialSession += 1;
    state.port = chosenPort;
    state.writer = chosenPort.writable.getWriter();
    state.closing = false;
    state.rxBuffer = '';
    clearRxQueue();
    startReadPump();
    updateConnection(true);
    log('Serial device opened at 1,000,000 baud.', 'ok');
    appendConsole('[transport] connected at 1,000,000 baud');
    return true;
  } catch (error) {
    const message = serialErrorMessage(error);
    log(message, error?.name === 'NotFoundError' ? 'info' : 'error');
    state.closing = true;
    try { if (state.reader) await state.reader.cancel(); } catch (_) { /* best effort */ }
    try { if (state.readTask) await state.readTask; } catch (_) { /* best effort */ }
    try { if (state.writer) state.writer.releaseLock(); } catch (_) { /* best effort */ }
    if (chosenPort?.readable || chosenPort?.writable) {
      try { await chosenPort.close(); } catch (_) { /* best effort */ }
    }
    state.port = null;
    state.writer = null;
    state.reader = null;
    state.readTask = null;
    state.closing = false;
    updateConnection(false);
    return false;
  } finally {
    state.connecting = false;
    $('#connect-button').disabled = false;
  }
}

async function closeSerial(physical = false) {
  const port = state.port;
  if (!port || state.closing) return;
  state.serialSession += 1;
  state.closing = true;
  rejectRxWaiters(new Error('Serial device disconnected.'));
  try {
    if (state.reader) await state.reader.cancel();
  } catch (_) { /* unplugged ports can reject cancel */ }
  try {
    if (state.readTask) await state.readTask;
  } catch (_) { /* pump reports its own errors */ }
  if (state.writer) {
    try { state.writer.releaseLock(); } catch (_) { /* already released */ }
  }
  if (!physical) {
    try { await port.close(); } catch (error) { log(`Disconnect warning: ${error.message}`, 'warn'); }
  }
  state.port = null;
  state.writer = null;
  state.reader = null;
  state.readTask = null;
  state.rxBuffer = '';
  state.shellSynchronized = false;
  clearRxQueue();
  state.bridgeMode = null;
  state.directLedSynced = false;
  state.directStartupState = 'unknown';
  state.directStartupFingerprint = null;
  setLightBridgeStatus('STATUS UNKNOWN');
  state.closing = false;
  updateConnection(false);
  appendConsole(`[transport] ${physical ? 'device removed' : 'disconnected'}`);
  log(physical ? 'Badge disconnected.' : 'Serial device disconnected.', physical ? 'warn' : 'info');
}

$('#connect-button').addEventListener('click', connect);
if (serialAvailable()) {
  navigator.serial.addEventListener('disconnect', (event) => {
    const removedPort = event.port || event.target;
    if (removedPort === state.port) void closeSerial(true);
  });
} else {
  $('#connect-button').disabled = true;
  updateConnection(false);
  log('Serial controls are disabled here; use desktop Chrome or Edge for badge transfers.', 'warn');
}

async function ensureConnected() {
  if (!state.port) await connect();
  return Boolean(state.port && state.writer);
}

function runSerialOperation(operation) {
  if (state.serialOperationPending) {
    return Promise.reject(new Error('Another badge operation is already running; wait for it to finish.'));
  }
  const session = state.serialSession;
  const port = state.port;
  const writer = state.writer;
  if (!port || !writer || state.closing) {
    return Promise.reject(new Error('No serial device is connected.'));
  }
  state.serialOperationPending = true;
  const run = state.serialTail.then(async () => {
    state.serialBusy += 1;
    state.activeSerialSession = session;
    document.body.dataset.serialBusy = 'true';
    updateLightAnimation();
    try {
      assertSerialSession(session, port, writer);
      await synchronizeShell();
      assertSerialSession(session, port, writer);
      const result = await operation();
      assertSerialSession(session, port, writer);
      return result;
    } catch (error) {
      // A disconnect or ambiguous command result can leave a partial line in
      // the badge-side keyboard buffer. Require the slow purge next time.
      state.shellSynchronized = false;
      throw error;
    }
    finally {
      if (state.activeSerialSession === session) state.activeSerialSession = null;
      state.serialBusy -= 1;
      state.serialOperationPending = false;
      if (!state.serialBusy) delete document.body.dataset.serialBusy;
      updateLightAnimation();
    }
  });
  state.serialTail = run.catch(() => undefined);
  return run;
}

function assertSerialSession(session = state.activeSerialSession, port = state.port, writer = state.writer) {
  if (session === null || session !== state.serialSession || port !== state.port || writer !== state.writer || state.closing) {
    throw new Error('The serial connection changed; the queued badge action was cancelled.');
  }
}

async function writeBytesPaced(bytes) {
  const writer = state.writer;
  const port = state.port;
  const session = state.activeSerialSession;
  if (!writer || !port || session === null) throw new Error('No serial device is connected.');
  await writeSerialBytesPaced(bytes, {
    write: (byte) => writer.write(byte),
    wait: sleep,
    assertReady: () => assertSerialSession(session, port, writer),
  });
}

async function writeLine(line) {
  await writeBytesPaced(encoder.encode(`${line}\n`));
}

async function establishCommandBoundary() {
  if (!state.writer) throw new Error('No serial device is connected.');
  if (state.shellSynchronized) return;
  log('Slow-syncing the badge console; the first serial action takes about 6 seconds.', 'info');
  clearRxQueue();
  await writeBytesPaced(new Uint8Array(COMMAND_PURGE_BACKSPACES).fill(0x08));
  // writeBytesPaced intentionally omits a trailing delay, so preserve the
  // inter-byte gap between the final purge key and the following newline.
  await sleep(SERIAL_CHAR_DELAY_MS);
  await writeLine('');
  await sleep(SERIAL_COMMAND_SETTLE_MS);
  clearRxQueue();

  const token = `S${(commandBoundarySequence++).toString(36)}${Date.now().toString(36).slice(-6)}`;
  await exchange(`echo ${token}`, {
    accepted: [token],
    retries: 0,
    unmatchedRetries: 0,
    silenceMs: 2_000,
    maxTotalMs: 6_000,
  });
  state.shellSynchronized = true;
  log('Badge console synchronized with drop-safe pacing.', 'ok');
}

async function writeCommandLine(line) {
  await writeLine(line);
}

async function exchange(line, options = {}) {
  const {
    accepted = ['OK'],
    retries = 0,
    unmatchedRetries = 0,
    silenceMs = 4_000,
    maxTotalMs = 12_000,
  } = options;
  let lastResponse = 'no response';
  let retryAttempt = 0;
  let unmatchedAttempt = 0;

  while (true) {
    assertSerialSession();
    clearRxQueue();
    await writeCommandLine(line);
    assertSerialSession();
    const commandSentAt = performance.now();
    const chatter = [];
    const deadline = Date.now() + maxTotalMs;
    const echoGate = createCommandEchoGate(line);
    const { expectedEcho } = echoGate;
    let retryableError = false;
    let unmatchedCommand = false;
    lastResponse = 'no response';

    while (Date.now() < deadline) {
      const waitMs = Math.max(1, Math.min(silenceMs, deadline - Date.now()));
      const raw = await nextSerialLine(waitMs);
      assertSerialSession();
      if (raw === null) break;
      const response = raw.trim();
      if (!response) continue;
      if (raw.includes('Input overflow') && raw.includes('dropping keys')) {
        throw new Error('Badge keyboard queue dropped serial characters; command aborted.');
      }
      const echoState = echoGate.consume(response);
      if (echoState.kind !== 'response') {
        if (echoState.kind === 'conflicting-echo') {
          throw new Error(`Expected exact command echo, received “${response}”.`);
        }
        chatter.push(raw);
        continue;
      }
      // Firmware prints the command echo before dispatch. Anything arriving
      // before that exact echo is stale chatter and must never authorize the
      // current command, even if it happens to be `OK` or `SUCCESS`.
      if (!echoState.authorized) {
        chatter.push(raw);
        continue;
      }
      lastResponse = response;
      if (accepted.includes(response)) {
        const responseDelayMs = performance.now() - commandSentAt;
        state.shellSynchronized = true;
        await sleep(SERIAL_COMMAND_SETTLE_MS);
        assertSerialSession();
        return { response, chatter, responseDelayMs };
      }
      // The stock shell emits this banner when no command verb matched. A
      // caller may opt into replay only when duplicate execution is harmless;
      // `bio pad`, FIFO reads, and FIFO writes must remain one-shot.
      if (response.startsWith('Commands:')) {
        unmatchedCommand = true;
        break;
      }
      if (response === 'ERR' || response.startsWith('ERR ')) {
        retryableError = true;
        break;
      }
      chatter.push(raw);
    }
    if (!echoGate.hasExpectedEcho()) lastResponse = `no exact echo “${expectedEcho}”`;

    const commandName = line.split(' ')[0];
    if (unmatchedCommand && unmatchedAttempt < unmatchedRetries) {
      unmatchedAttempt += 1;
      log(`${commandName} staging line was rejected; duplicate-safe retry (${unmatchedAttempt}/${unmatchedRetries}).`, 'warn');
      await sleep(350);
      continue;
    }

    if (!unmatchedCommand && retryAttempt < retries) {
      retryAttempt += 1;
      log(`${commandName} received ${retryableError ? `“${lastResponse}”` : 'no final response'}; retrying (${retryAttempt}/${retries}).`, 'warn');
      await sleep(500);
      continue;
    }

    break;
  }
  throw new Error(`Expected ${accepted.join(' or ')}, received ${lastResponse}.`);
}

async function synchronizeShell() {
  if (!state.shellSynchronized) {
    await establishCommandBoundary();
    return;
  }
  const token = `Q${(commandBoundarySequence++).toString(36)}${Date.now().toString(36).slice(-6)}`;
  await exchange(`echo ${token}`, {
    accepted: [token],
    retries: 0,
    unmatchedRetries: 0,
    silenceMs: 2_000,
    maxTotalMs: 6_000,
  });
}

async function runRawConsoleCommand(line) {
  clearRxQueue();
  appendConsole(`> ${line}`);
  await writeCommandLine(line);
  const deadline = Date.now() + 20_000;
  const responses = [];
  const echoGate = createCommandEchoGate(line);
  const { expectedEcho } = echoGate;
  let sawResponse = false;

  while (Date.now() < deadline) {
    const timeout = sawResponse ? 900 : 4_000;
    const raw = await nextSerialLine(Math.min(timeout, deadline - Date.now()));
    if (raw === null) break;
    const response = raw.trim();
    if (!response) continue;
    if (raw.includes('Input overflow') && raw.includes('dropping keys')) {
      throw new Error('Badge keyboard queue dropped serial characters; command aborted.');
    }
    const echoState = echoGate.consume(response);
    if (echoState.kind !== 'response') {
      if (echoState.kind === 'conflicting-echo') {
        throw new Error(`Expected exact command echo, received “${response}”.`);
      }
      continue;
    }
    if (!echoState.authorized) continue;
    responses.push(raw);
    sawResponse = true;
    if (['OK', 'CLEAR', 'SUCCESS', 'BIO load successful'].includes(response) || response === 'ERR' || response.startsWith('ERR ')) break;
  }
  if (!echoGate.hasExpectedEcho()) throw new Error(`No exact command echo “${expectedEcho}” was received.`);
  await sleep(SERIAL_COMMAND_SETTLE_MS);
  if (!responses.length) log(`Console command “${line.split(' ')[0]}” returned no response before timeout.`, 'warn');
  return responses;
}

/* Screen image preparation and upload */
function drawBlank() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
}
drawBlank();

function renderImage() {
  if (!state.image) return;
  const source = document.createElement('canvas');
  source.width = 128;
  source.height = 128;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  sourceCtx.fillStyle = '#ffffff';
  sourceCtx.fillRect(0, 0, 128, 128);
  sourceCtx.drawImage(state.image, 0, 0, 128, 128);
  const data = sourceCtx.getImageData(0, 0, 128, 128);
  const pixels = data.data;
  const threshold = Number($('#threshold').value);
  const dither = $('#dither').checked;
  const invert = $('#invert').checked;
  const gray = new Float32Array(128 * 128);

  for (let i = 0; i < gray.length; i += 1) {
    gray[i] = pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114;
  }
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const i = y * 128 + x;
      const oldValue = gray[i];
      const value = oldValue >= threshold ? 255 : 0;
      const error = oldValue - value;
      const finalValue = invert ? 255 - value : value;
      pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = finalValue;
      pixels[i * 4 + 3] = 255;
      if (dither) {
        if (x < 127) gray[i + 1] += error * 7 / 16;
        if (y < 127) {
          if (x) gray[i + 127] += error * 3 / 16;
          gray[i + 128] += error * 5 / 16;
          if (x < 127) gray[i + 129] += error / 16;
        }
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  $('#image-status').textContent = 'READY TO SEND';
  $('#image-info').textContent = `${state.imageName} · 128 × 128 · 1-bit`;
  $('#image-size').textContent = '2,048 B payload';
  activeImageReady();
}

$('#image-file').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  image.onload = () => {
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    state.imageUrl = objectUrl;
    state.image = image;
    state.imageName = file.name;
    renderImage();
    log(`Prepared ${file.name} as a 128 × 128 monochrome image.`, 'ok');
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    log(`${file.name} could not be decoded as an image.`, 'error');
  };
  image.src = objectUrl;
});

['threshold', 'dither', 'invert'].forEach((id) => {
  $(`#${id}`).addEventListener('input', () => {
    $('#threshold-value').value = $('#threshold').value;
    renderImage();
  });
});

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function base64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 0x8000) result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(result);
}

function imagePayload() {
  const raw = ctx.getImageData(0, 0, 128, 128).data;
  const words = [];
  for (let y = 0; y < 128; y += 1) {
    for (let word = 0; word < 4; word += 1) {
      let packed = 0;
      for (let bit = 0; bit < 32; bit += 1) {
        const x = 127 - (word * 32 + bit);
        const isBlack = raw[(y * 128 + x) * 4] < 128;
        if (isBlack) packed |= (1 << (31 - bit));
      }
      words.push(packed >>> 0);
    }
  }
  const reordered = [];
  for (let i = 0; i < words.length; i += 4) reordered.push(words[i + 3], words[i + 2], words[i + 1], words[i]);
  const output = new Uint8Array(2048);
  const view = new DataView(output.buffer);
  reordered.forEach((word, index) => view.setUint32(index * 4, word, false));
  return output;
}

function makeChunk(index, data) {
  const wire = new Uint8Array(70);
  const view = new DataView(wire.buffer);
  view.setUint16(0, index, false);
  wire.set(data, 2);
  view.setUint32(66, crc32(wire.subarray(0, 66)), false);
  return wire;
}

async function sendChunks(prefix, bytes, chunkCount, capacityChunks, retries = 0, timing = {}) {
  for (let index = 0; index < chunkCount; index += 1) {
    const data = bytes.subarray(index * 64, index * 64 + 64);
    const payload = new Uint8Array(64);
    payload.set(data);
    const isCapacityEnd = index === capacityChunks - 1;
    const { response } = await exchange(`${prefix} ${base64(makeChunk(index, payload))}`, {
      accepted: isCapacityEnd ? ['OK', 'SUCCESS'] : ['OK'],
      retries,
      ...timing,
    });
    log(`${prefix} chunk ${index + 1}/${capacityChunks}${response === 'SUCCESS' ? ' · complete' : ''}`, 'ok');
  }
}

$('#send-image').addEventListener('click', async () => {
  if (!state.image || $('#send-image').disabled) return;
  const payload = imagePayload();
  setImageEditorDisabled(true);
  try {
    if (!(await ensureConnected())) return;
    await runSerialOperation(async () => {
      log('Starting image upload (32 chunks).', 'info');
      await sendChunks('image', payload, 32, 32, 0);
      log('Image transfer complete.', 'ok');
    });
  } catch (error) {
    log(`Image upload failed: ${error.message}`, 'error');
  } finally {
    setImageEditorDisabled(false);
  }
});

$('#clear-image').addEventListener('click', async () => {
  if ($('#clear-image').disabled) return;
  setImageEditorDisabled(true);
  try {
    if (!(await ensureConnected())) return;
    await runSerialOperation(() => exchange('image clear', { accepted: ['CLEAR'], retries: 0 }));
    drawBlank();
    state.image = null;
    state.imageName = '';
    $('#image-file').value = '';
    $('#image-status').textContent = 'SCREEN IMAGE CLEARED';
    $('#image-info').textContent = '128 × 128 · 1-bit';
    $('#image-size').textContent = '0 B ready';
    activeImageReady();
    log('Badge screen image cleared.', 'ok');
  } catch (error) {
    log(`Could not clear image: ${error.message}`, 'error');
  } finally {
    setImageEditorDisabled(false);
  }
});

/* BIO upload, mapping, and FIFO tools */
function selectedSaos() {
  return $$('.sao-option input:checked').map((input) => Number(input.value));
}

function selectedPins() {
  return selectedSaos().map((slot) => SAO_PIN_MAP[slot]);
}

function parseClock(raw) {
  const match = raw.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(mhz|khz|hz)?$/i);
  if (!match) return null;
  const units = { mhz: 1e6, khz: 1e3, hz: 1 };
  const hz = Number(match[1]) * units[(match[2] || 'hz').toLowerCase()];
  return Number.isFinite(hz) && hz >= BIO_MIN_CLOCK && hz <= BIO_MAX_CLOCK ? Math.round(hz) : null;
}

function updateBioPlan() {
  const pins = selectedPins();
  const hz = parseClock($('#quantum').value);
  const chunks = state.bio ? Math.ceil(state.bio.size / 64) : 0;
  const settings = [];
  settings.push(pins.length ? `bio pin ${pins.join(' ')}` : 'saved pin mapping retained');
  settings.push(hz ? `bio clk ${hz}` : 'clock must be 25kHz–350MHz');
  $('#bio-config').innerHTML = `<code>${settings.join(' · ')}</code>`;
  $('#bio-transfer').innerHTML = state.bio
    ? `<code>${chunks}/${BIO_CHUNKS} chunks · ${state.bio.size.toLocaleString()} B</code>`
    : '<code>Choose a binary first</code>';
  activeBioReady();
}

async function uploadBioBytes(bytes, {
  pins = null,
  hz,
  label = 'BIO program',
  chunkRetries = 0,
  chunkTiming = {},
}) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > BIO_MAX_BYTES) {
    throw new Error(`${label} must contain 1–${BIO_MAX_BYTES.toLocaleString()} bytes.`);
  }
  await exchange('bio ready');
  // `bio pin 0` is filtered to an empty pin set by stock firmware. This is how
  // the light bridge releases any saved SAO mapping without claiming LED pin 15.
  if (pins !== null) await exchange(`bio pin ${pins.length ? pins.join(' ') : '0'}`);
  await exchange(`bio clk ${hz}`);
  const chunks = Math.ceil(bytes.length / 64);
  log(`Uploading ${label}: ${chunks}/${BIO_CHUNKS} BIO chunks.`, 'info');
  await sendChunks('bio', bytes, chunks, BIO_CHUNKS, chunkRetries, chunkTiming);
  // pad commits and clears the device's staging buffer. Retrying after a lost
  // SUCCESS would commit an all-zero program, so a new Apply must restart it.
  if (chunks < BIO_CHUNKS) await exchange('bio pad', { accepted: ['SUCCESS'], retries: 0 });
  await exchange('bio reload', { accepted: ['BIO load successful'], retries: 0 });
}

$('#bio-file').addEventListener('change', (event) => {
  const [file] = event.target.files;
  state.bio = file || null;
  if (!file) return updateBioPlan();
  $('#bio-size').textContent = `${file.name} · ${file.size.toLocaleString()} B`;
  $('#bio-meter').textContent = file.size > BIO_MAX_BYTES ? 'TOO LARGE' : `${Math.round(file.size / BIO_MAX_BYTES * 100)}% used`;
  if (file.size === 0) log(`${file.name} is empty; choose a BIO binary with data.`, 'error');
  else if (file.size > BIO_MAX_BYTES) log(`${file.name} exceeds the 3,840-byte BIO limit.`, 'error');
  else log(`Loaded BIO file ${file.name}.`, 'ok');
  updateBioPlan();
});

$$('.sao-option input').forEach((input) => input.addEventListener('change', updateBioPlan));
$('#quantum').addEventListener('input', updateBioPlan);
updateBioPlan();

$('#send-bio').addEventListener('click', async () => {
  if (!state.bio || $('#send-bio').disabled) return;
  const bioFile = state.bio;
  const pins = selectedPins();
  const hz = parseClock($('#quantum').value);
  if (!hz) return log('Clock must be between 25kHz and 350MHz (for example: 10MHz).', 'error');
  setBioEditorDisabled(true);
  try {
    if (!(await ensureConnected())) return;
    const knownBridge = state.bridgeMode;
    state.bridgeMode = null;
    state.directLedSynced = false;
    state.directStartupState = 'unknown';
    state.directStartupFingerprint = null;
    setLightBridgeStatus('OTHER BIO PENDING');
    const bytes = new Uint8Array(await bioFile.arrayBuffer());
    await runSerialOperation(async () => {
      if (knownBridge) {
        try {
          await releaseInstalledBridge(knownBridge);
          await sleep(100);
        } catch (error) {
          log(`Bridge cleanup warning: ${error.message} Continuing with BIO replacement.`, 'warn');
        }
      }
      // Always clear the prior program and all staging slots before a replacement.
      // Otherwise stale tail chunks from a failed longer upload could survive when
      // the next program is shorter.
      await exchange('bio clear', { accepted: ['CLEAR'], retries: 0 });
      await uploadBioBytes(bytes, { pins: pins.length ? pins : null, hz, label: bioFile.name || 'BIO program' });
      state.directStartupState = 'disabled';
      state.directStartupFingerprint = null;
      setLightBridgeStatus('OTHER BIO ACTIVE');
      log('BIO program loaded and activated.', 'ok');
    });
  } catch (error) {
    log(`BIO upload failed: ${error.message}`, 'error');
  } finally {
    setBioEditorDisabled(false);
  }
});

$('#clear-bio').addEventListener('click', async () => {
  if ($('#clear-bio').disabled) return;
  setBioEditorDisabled(true);
  try {
    if (!(await ensureConnected())) return;
    const knownBridge = state.bridgeMode;
    state.bridgeMode = null;
    state.directLedSynced = false;
    setLightBridgeStatus('CLEARING BIO');
    await runSerialOperation(async () => {
      if (knownBridge) {
        try {
          await releaseInstalledBridge(knownBridge);
          await sleep(100);
        } catch (error) {
          log(`Bridge release warning: ${error.message} Continuing with BIO clear.`, 'warn');
        }
      }
      await exchange('bio clear', { accepted: ['CLEAR'], retries: 0 });
    });
    state.bridgeMode = null;
    state.directLedSynced = false;
    state.directStartupState = 'disabled';
    state.directStartupFingerprint = null;
    setLightBridgeStatus('SAVED GENE ACTIVE');
    log('BIO program cleared.', 'ok');
  } catch (error) {
    log(`Could not clear BIO: ${error.message}`, 'error');
  } finally {
    setBioEditorDisabled(false);
  }
});

function parseUint32(raw) {
  const value = raw.trim();
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) return null;
  try {
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > 0xFFFF_FFFFn) return null;
    return value.toLowerCase().startsWith('0x') ? `0x${parsed.toString(16)}` : parsed.toString(10);
  } catch (_) {
    return null;
  }
}

$('#bio-tx').addEventListener('click', async () => {
  const button = $('#bio-tx');
  if (button.disabled) return;
  const value = parseUint32($('#bio-tx-value').value);
  const repeat = Number($('#bio-tx-repeat').value);
  if (!value) return log('BIO TX value must be a decimal or 0x-prefixed 32-bit unsigned integer.', 'error');
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 256) return log('BIO TX repeat must be from 1 to 256.', 'error');
  const line = `bio tx ${value} ${repeat}`;
  button.disabled = true;
  $('#bio-tx-value').disabled = true;
  $('#bio-tx-repeat').disabled = true;
  try {
    if (!(await ensureConnected())) return;
    await runSerialOperation(async () => {
      appendConsole(`> ${line}`);
      const { chatter } = await exchange(line, { retries: 0, silenceMs: 6_500, maxTotalMs: 8_000 });
      log(`BIO TX completed${chatter.length ? ` with ${chatter.length} device log line(s)` : ''}.`, 'ok');
    });
  } catch (error) {
    log(`BIO TX failed without retrying: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    $('#bio-tx-value').disabled = false;
    $('#bio-tx-repeat').disabled = false;
  }
});

$('#bio-rx').addEventListener('click', async () => {
  const button = $('#bio-rx');
  if (button.disabled) return;
  const count = Number($('#bio-rx-count').value);
  const timeout = Number($('#bio-rx-timeout').value);
  if (!Number.isInteger(count) || count < 1 || count > 60) return log('BIO RX iterations must be from 1 to 60.', 'error');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30) return log('BIO RX timeout must be from 1 to 30 seconds.', 'error');
  if (count * timeout > 60) return log('BIO RX iterations × timeout must be 60 seconds or less.', 'error');
  const line = `bio rx ${count} ${timeout}`;
  button.disabled = true;
  $('#bio-rx-count').disabled = true;
  $('#bio-rx-timeout').disabled = true;
  try {
    if (!(await ensureConnected())) return;
    await runSerialOperation(async () => {
      appendConsole(`> ${line}`);
      const { chatter } = await exchange(line, {
        retries: 0,
        silenceMs: timeout * 1_000 + 1_000,
        maxTotalMs: count * timeout * 1_000 + 4_000,
      });
      log(`BIO RX completed with ${chatter.length} raw device log line(s); inspect the serial console.`, 'ok');
    });
  } catch (error) {
    log(`BIO RX failed: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    $('#bio-rx-count').disabled = false;
    $('#bio-rx-timeout').disabled = false;
  }
});

/* General serial console */
async function submitConsoleCommand(rawLine) {
  const line = rawLine.trim();
  if (!line) return;
  if (!(await ensureConnected())) return;
  state.consoleHistory = state.consoleHistory.filter((entry) => entry !== line);
  state.consoleHistory.push(line);
  if (state.consoleHistory.length > 100) state.consoleHistory.shift();
  state.historyIndex = state.consoleHistory.length;
  try {
    await runSerialOperation(() => {
      if (/^bio(?:\s|$)/i.test(line)) {
        state.bridgeMode = null;
        state.directLedSynced = false;
        state.directStartupState = 'unknown';
        state.directStartupFingerprint = null;
        setLightBridgeStatus('BIO STATE UNKNOWN');
      }
      return runRawConsoleCommand(line);
    });
  } catch (error) {
    log(`Console command failed: ${error.message}`, 'error');
  }
}

$('#console-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#console-command');
  const line = input.value;
  if (!line.trim()) return;
  input.value = '';
  await submitConsoleCommand(line);
});

$$('.command-chip').forEach((button) => {
  button.addEventListener('click', () => submitConsoleCommand(button.dataset.command));
});

$('#console-command').addEventListener('keydown', (event) => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !state.consoleHistory.length) return;
  event.preventDefault();
  if (event.key === 'ArrowUp') state.historyIndex = Math.max(0, state.historyIndex - 1);
  else state.historyIndex = Math.min(state.consoleHistory.length, state.historyIndex + 1);
  event.currentTarget.value = state.historyIndex === state.consoleHistory.length ? '' : state.consoleHistory[state.historyIndex];
});

$('#clear-console').addEventListener('click', () => {
  $('#console-output').textContent = 'DC34 serial console output cleared.';
});

/* Vault QR provisioning */
function pad2(value) {
  return String(value).padStart(2, '0');
}

function localRfc3339(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const zone = `${sign}${pad2(Math.floor(absoluteOffset / 60))}:${pad2(absoluteOffset % 60)}`;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}${zone}`;
}

function passwordHostname(raw) {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function buildQrPayload() {
  const kind = $('#qr-kind').value;
  if (kind === 'time') {
    return { payload: `time://${localRfc3339()}`, message: 'Current local time encoded with its UTC offset.' };
  }
  if (kind === 'password') {
    const hostname = passwordHostname($('#password-url').value);
    if (!hostname) return { error: 'Enter a valid hostname or URL to create a password lookup.' };
    return { payload: `pwauth://pass/${hostname}?time=${localRfc3339()}`, message: `Password lookup for ${hostname}.` };
  }
  if (kind === 'totp') {
    const issuer = $('#otp-issuer').value.trim();
    const account = $('#otp-account').value.trim();
    const secret = $('#otp-secret').value.replace(/[\s=-]/g, '').toUpperCase();
    const algorithm = $('#otp-algorithm').value;
    const digits = $('#otp-digits').value;
    const period = Number($('#otp-period').value);
    if (!secret || !/^[A-Z2-7]+$/.test(secret)) return { error: 'Enter an RFC 4648 Base32 secret using A–Z and 2–7.' };
    if (!Number.isInteger(period) || period < 1 || period > 300) return { error: 'TOTP period must be from 1 to 300 seconds.' };
    const labelText = issuer && account ? `${issuer}:${account}` : account || issuer || 'TOTP';
    const query = new URLSearchParams({ secret, algorithm, digits, period: String(period) });
    if (issuer) query.set('issuer', issuer);
    return {
      payload: `otpauth://totp/${encodeURIComponent(labelText)}?${query.toString()}`,
      message: 'TOTP enrollment payload ready. Keep this QR code private.',
    };
  }
  const custom = $('#custom-payload').value.trim();
  if (!custom) return { error: 'Enter a custom payload to render.' };
  return { payload: custom, message: 'Custom payload rendered locally.' };
}

function clearQrCanvas(canvasElement, message = '') {
  const qrContext = canvasElement.getContext('2d');
  qrContext.fillStyle = '#ffffff';
  qrContext.fillRect(0, 0, canvasElement.width, canvasElement.height);
  if (message) {
    qrContext.fillStyle = '#33402f';
    qrContext.font = `${Math.max(13, Math.round(canvasElement.width / 28))}px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`;
    qrContext.textAlign = 'center';
    qrContext.textBaseline = 'middle';
    qrContext.fillText(message, canvasElement.width / 2, canvasElement.height / 2, canvasElement.width * .75);
  }
}

function drawQr(payload, canvasElement) {
  const qr = qrcodegen.QrCode.encodeText(payload, qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  const totalModules = qr.size + border * 2;
  const scale = Math.max(1, Math.floor(canvasElement.width / totalModules));
  const symbolSize = totalModules * scale;
  const start = Math.floor((canvasElement.width - symbolSize) / 2) + border * scale;
  const qrContext = canvasElement.getContext('2d');
  qrContext.imageSmoothingEnabled = false;
  qrContext.fillStyle = '#ffffff';
  qrContext.fillRect(0, 0, canvasElement.width, canvasElement.height);
  qrContext.fillStyle = '#101410';
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.getModule(x, y)) qrContext.fillRect(start + x * scale, start + y * scale, scale, scale);
    }
  }
  return qr;
}

function updateQr() {
  const result = buildQrPayload();
  const message = $('#qr-message');
  message.classList.toggle('error-note', Boolean(result.error));
  if (result.error) {
    state.qrPayload = '';
    $('#qr-payload').value = '';
    $('#qr-status').textContent = 'NEEDS INPUT';
    message.textContent = result.error;
    clearQrCanvas($('#qr-canvas'), 'Complete the fields');
    if ($('#qr-dialog').open) clearQrCanvas($('#qr-dialog-canvas'), 'Complete the fields');
    return;
  }
  try {
    const payloadBytes = new TextEncoder().encode(result.payload).length;
    if (payloadBytes > MAX_QR_PAYLOAD_BYTES) {
      throw new Error(`payload exceeds ${MAX_QR_PAYLOAD_BYTES.toLocaleString()} UTF-8 bytes`);
    }
    const qr = drawQr(result.payload, $('#qr-canvas'));
    if ($('#qr-dialog').open) drawQr(result.payload, $('#qr-dialog-canvas'));
    state.qrPayload = result.payload;
    $('#qr-payload').value = result.payload;
    $('#qr-status').textContent = `${qr.size} × ${qr.size} MODULES`;
    message.textContent = result.message;
  } catch (error) {
    state.qrPayload = '';
    $('#qr-payload').value = '';
    $('#qr-status').textContent = 'PAYLOAD TOO LONG';
    message.classList.add('error-note');
    message.textContent = `Could not encode this payload: ${error.message}`;
    clearQrCanvas($('#qr-canvas'), 'Payload too long');
  }
}

function updateQrFields() {
  const kind = $('#qr-kind').value;
  $$('.qr-fields').forEach((group) => { group.hidden = group.dataset.qrFields !== kind; });
  updateQr();
}

$('#qr-kind').addEventListener('change', updateQrFields);
let qrInputTimer = null;
function scheduleQrUpdate() {
  clearTimeout(qrInputTimer);
  qrInputTimer = setTimeout(updateQr, 120);
}
$$('.qr-fields input, .qr-fields select, .qr-fields textarea').forEach((control) => {
  control.addEventListener('input', scheduleQrUpdate);
  control.addEventListener('change', updateQr);
});
$('#refresh-time').addEventListener('click', updateQr);

$('#copy-payload').addEventListener('click', async () => {
  if (!state.qrPayload) return log('Complete the QR fields before copying.', 'warn');
  try {
    await navigator.clipboard.writeText(state.qrPayload);
  } catch (_) {
    const field = $('#qr-payload');
    field.removeAttribute('readonly');
    field.select();
    document.execCommand('copy');
    field.setAttribute('readonly', '');
    window.getSelection()?.removeAllRanges();
  }
  log('QR payload copied to the clipboard.', 'ok');
});

$('#download-qr').addEventListener('click', () => {
  if (!state.qrPayload) return log('Complete the QR fields before downloading.', 'warn');
  if (window.DC34Android) {
    const encoded = $('#qr-canvas').toDataURL('image/png').split(',', 2)[1];
    window.DC34Android.saveBase64File(`dc34-${$('#qr-kind').value}-qr.png`, 'image/png', encoded);
    log('Opened the Android document picker for the QR image.', 'info');
    return;
  }
  $('#qr-canvas').toBlob((blob) => {
    if (!blob) return log('The QR image could not be created.', 'error');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dc34-${$('#qr-kind').value}-qr.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    log('QR image downloaded.', 'ok');
  }, 'image/png');
});

$('#open-scan-view').addEventListener('click', () => {
  if (!state.qrPayload) return log('Complete the QR fields before opening scan view.', 'warn');
  drawQr(state.qrPayload, $('#qr-dialog-canvas'));
  $('#qr-dialog').showModal();
});
$('#close-scan-view').addEventListener('click', () => $('#qr-dialog').close());
$('#qr-dialog').addEventListener('click', (event) => {
  if (event.target === $('#qr-dialog')) $('#qr-dialog').close();
});

updateQrFields();

/* Direct built-in LED controller */
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function directColorChannels(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return [0, 0, 0];
  const packed = Number.parseInt(match[1], 16);
  return [(packed >> 16) & 0xFF, (packed >> 8) & 0xFF, packed & 0xFF];
}

function directColorWord(led) {
  const [red, green, blue] = directColorChannels(led.color);
  return ((green << 16) | (red << 8) | blue) >>> 0;
}

function quantizeDirectMs(value, fallback, minimum = 0) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return clamp(Math.round(safe / DIRECT_LED_TICK_MS) * DIRECT_LED_TICK_MS, minimum, 81_900);
}

function directConfigWord(led) {
  const brightnessLimit = $('#direct-high-power')?.checked ? 255 : 64;
  const brightness = clamp(Math.round(led.brightness), 0, brightnessLimit);
  if (led.effect === 'steady') return brightness >>> 0;
  const timing = packDirectLedTiming(led);
  return ((timing.onTimeTicks << 20) | (timing.periodTicks << 8) | brightness) >>> 0;
}

function directEffectWord(led) {
  if (led.effect === 'steady') return 0;
  const delayTicks = clamp(Math.round(quantizeDirectMs(led.delayMs, 0) / DIRECT_LED_TICK_MS), 0, 0xFFF);
  return (delayTicks | (led.effect === 'rgb' ? DIRECT_LED_EFFECT_RGB : 0)) >>> 0;
}

function saveDirectLedScene() {
  try {
    localStorage.setItem(DIRECT_LED_STORAGE_KEY, JSON.stringify(state.directLeds));
  } catch (_) { /* private storage can be unavailable */ }
}

function restoreDirectLedScene() {
  try {
    const stored = JSON.parse(localStorage.getItem(DIRECT_LED_STORAGE_KEY) || 'null');
    if (!Array.isArray(stored) || stored.length !== DIRECT_LED_COUNT) return;
    state.directLeds = stored.map((candidate, index) => {
      const fallback = state.directLeds[index];
      const legacyEffect = candidate?.flash ? 'flash' : 'steady';
      const effect = ['steady', 'flash', 'rgb'].includes(candidate?.effect) ? candidate.effect : legacyEffect;
      const minimumPeriod = effect === 'rgb' ? DIRECT_LED_RGB_MIN_PERIOD_MS : 40;
      return {
        color: /^#[0-9a-f]{6}$/i.test(candidate?.color) ? candidate.color : fallback.color,
        brightness: clamp(Number(candidate?.brightness) || 0, 0, 255),
        effect,
        periodMs: quantizeDirectMs(candidate?.periodMs, 1_000, minimumPeriod),
        duty: clamp(Number(candidate?.duty) || 50, 1, 99),
        delayMs: quantizeDirectMs(candidate?.delayMs, 0),
      };
    });
  } catch (_) { /* ignore malformed or unavailable storage */ }
}

function directWordHex(word) {
  return `0x${(word >>> 0).toString(16).padStart(8, '0')}`;
}

function directSceneWords() {
  return {
    colors: state.directLeds.map(directColorWord),
    configs: state.directLeds.map(directConfigWord),
    effects: state.directLeds.map(directEffectWord),
  };
}

function directSceneFingerprint(words = directSceneWords()) {
  return [...words.colors, ...words.configs, ...words.effects]
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

function directRuntimeStatus() {
  if (state.directStartupState === 'enabled') {
    return directSceneFingerprint() === state.directStartupFingerprint
      ? 'PIXEL ENGINE ACTIVE · STARTUP SAVED'
      : 'RUNTIME SCENE ACTIVE · STARTUP DIFFERENT';
  }
  if (state.directStartupState === 'disabled') return 'RUNTIME SCENE ACTIVE · STARTUP OFF';
  return 'PIXEL ENGINE ACTIVE · STARTUP UNKNOWN';
}

function locateDirectBootRecord(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const matches = [];
  for (let offset = 0; offset + DIRECT_LED_BOOT_RECORD_BYTES <= bytes.length; offset += 4) {
    if (view.getUint32(offset, true) === DIRECT_LED_BOOT_MAGIC0
      && view.getUint32(offset + 4, true) === DIRECT_LED_BOOT_MAGIC1
      && view.getUint32(offset + 8, true) === DIRECT_LED_BOOT_FORMAT) {
      matches.push(offset);
    }
  }
  if (matches.length !== 1) throw new Error('The controller startup-scene record is missing or ambiguous.');
  return matches[0];
}

function makeDirectStartupBinary(template, enabled, words = directSceneWords()) {
  const bytes = template.slice();
  const offset = locateDirectBootRecord(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(offset + 140, true) !== DIRECT_LED_BOOT_TAIL) {
    throw new Error('The controller startup-scene record has an invalid boundary marker.');
  }
  const templateCrc = crc32(bytes.subarray(offset + 8, offset + 136));
  if (templateCrc !== view.getUint32(offset + 136, true) || view.getUint32(offset + 12, true) !== 0) {
    throw new Error('The bundled controller is not a pristine startup-scene template.');
  }
  if (!enabled) return bytes;

  view.setUint32(offset + 12, DIRECT_LED_BOOT_ENABLE, true);
  words.colors.forEach((word, index) => view.setUint32(offset + 16 + index * 4, word, true));
  words.configs.forEach((word, index) => view.setUint32(offset + 56 + index * 4, word, true));
  words.effects.forEach((word, index) => view.setUint32(offset + 96 + index * 4, word, true));
  view.setUint32(offset + 136, crc32(bytes.subarray(offset + 8, offset + 136)), true);
  return bytes;
}

function directFlashRateHz(led) {
  if (led.effect !== 'flash') return 0;
  const timing = packDirectLedTiming(led);
  return 1_000 / timing.periodMs;
}

function directHasRapidFlash() {
  return state.directLeds.some((led) => {
    const rate = directFlashRateHz(led);
    return rate >= 3 && rate <= 30;
  });
}

function prefersReducedMotion() {
  return Boolean(reducedMotionQuery?.matches);
}

function directRapidPreviewAllowed() {
  return !prefersReducedMotion() && Boolean($('#direct-rapid-preview')?.checked);
}

function directDutyLabel(led) {
  const requested = Math.round(led.duty);
  if (led.effect !== 'flash') return `${requested}%`;
  const effective = Math.round(packDirectLedTiming(led).effectiveDuty * 100);
  return requested === effective ? `${effective}%` : `${requested}% → ${effective}%`;
}

function updateDirectPowerEstimate() {
  let currentMa = 0;
  state.directLeds.forEach((led) => {
    const [red, green, blue] = directColorChannels(led.color);
    const duty = led.effect === 'flash' ? packDirectLedTiming(led).effectiveDuty : 1;
    const channelLoad = led.effect === 'rgb' ? 1 : (red + green + blue) / 255;
    currentMa += 20 * channelLoad * (led.brightness / 255) * duty;
  });
  const unlocked = $('#direct-high-power').checked;
  $('#direct-power-note').textContent = unlocked
    ? `High-output range unlocked. Estimated scene average: about ${Math.round(currentMa)} mA; use USB power for bright scenes.`
    : `Brightness is capped at 25%. Estimated scene average: about ${Math.round(currentMa)} mA. Unlock only when the power source can support it.`;
}

function markDirectLedDirty(index) {
  state.directLedDirty.add(index);
  directLedAnimationStart = performance.now();
  saveDirectLedScene();
  updateDirectPowerEstimate();
  $('#direct-led-preview-state').textContent = `${state.directLedDirty.size} UNSENT CHANGE${state.directLedDirty.size === 1 ? '' : 'S'}`;
}

let directLedAnimationStart = performance.now();

function directPatternTargetIndices(target = state.directPatternSettings.target) {
  if (target === 'eyes') return [0, 1];
  if (target === 'ring') return Array.from({ length: 8 }, (_, index) => index + 2);
  return Array.from({ length: DIRECT_LED_COUNT }, (_, index) => index);
}

function addDirectPatternOption(group, value, label, disabled = false) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  group.append(option);
}

function populateDirectPatternControls() {
  const patternSelect = $('#direct-pattern');
  patternSelect.textContent = '';
  addDirectPatternOption(patternSelect, 'custom', 'Custom / per-pixel');

  const groups = [
    ['Badge ready · exact', DIRECT_LED_PATTERNS.filter((pattern) => pattern.support === 'exact')],
    ['Badge ready · 10-pixel approximations', DIRECT_LED_PATTERNS.filter((pattern) => pattern.support === 'approx')],
    ['Badge extras', DIRECT_LED_PATTERNS.filter((pattern) => pattern.support === 'badge')],
  ];
  groups.forEach(([label, patterns]) => {
    const group = document.createElement('optgroup');
    group.label = label;
    patterns.forEach((pattern) => addDirectPatternOption(group, pattern.id, pattern.label));
    patternSelect.append(group);
  });

  const implementedWledIds = new Set(
    DIRECT_LED_PATTERNS.map((pattern) => pattern.wledId).filter(Number.isInteger),
  );
  [
    ['WLED 1D · future controller', 'one-d'],
    ['WLED audio · requires audio input', 'audio'],
    ['WLED matrix · requires 2D hardware', 'matrix'],
  ].forEach(([label, catalogGroup]) => {
    const group = document.createElement('optgroup');
    group.label = label;
    WLED_EFFECTS
      .filter((effect) => effect.group === catalogGroup && !implementedWledIds.has(effect.id))
      .forEach((effect) => addDirectPatternOption(group, `wled-${effect.id}`, `${effect.id} · ${effect.name}`, true));
    patternSelect.append(group);
  });
  patternSelect.value = state.directPatternSettings.id;

  const paletteSelect = $('#direct-palette');
  paletteSelect.textContent = '';
  DIRECT_LED_PALETTES.forEach((palette) => addDirectPatternOption(paletteSelect, palette.id, palette.label));
  paletteSelect.value = state.directPatternSettings.paletteId;
}

function updateDirectPatternControlState() {
  const settings = state.directPatternSettings;
  const pattern = DIRECT_LED_PATTERNS.find((candidate) => candidate.id === settings.id) || DIRECT_LED_PATTERNS[0];
  const unlocked = $('#direct-high-power').checked;
  const brightnessMax = unlocked ? 255 : 64;
  const actualLevel = Math.round(brightnessMax * settings.level / 100 / 255 * 100);
  $('#direct-speed').value = String(settings.speed);
  $('#direct-width').value = String(settings.width);
  $('#direct-level').value = String(settings.level);
  $('#direct-speed-output').value = String(settings.speed);
  $('#direct-width-output').value = `${settings.width}%`;
  $('#direct-level-output').value = `${actualLevel}% full`;

  const custom = pattern.id === 'custom';
  const animated = new Set(['blink', 'strobe', 'colorloop', 'rainbow', 'sweep', 'twinkle', 'sparkle', 'chase', 'running', 'dual-sweep', 'police', 'traffic', 'morse', 'nyan', 'hack-planet', 'holiday', 'halloween']);
  const pulseWidth = new Set(['blink', 'strobe', 'sweep', 'twinkle', 'sparkle', 'chase', 'running', 'dual-sweep']);
  const direction = new Set(['rainbow', 'sweep', 'chase', 'running', 'dual-sweep', 'morse', 'nyan', 'hack-planet']);
  const palette = !new Set(['off', 'colorloop', 'rainbow', 'police', 'traffic', 'nyan', 'hack-planet', 'holiday', 'halloween', 'identify']).has(pattern.id);
  const widthLabels = {
    blink: 'On time',
    strobe: 'Flash width',
    twinkle: 'Density',
    sparkle: 'Density',
    sweep: 'Beam width',
    chase: 'Tail width',
    running: 'Wave width',
    'dual-sweep': 'Beam width',
  };
  $('#direct-width-label').textContent = widthLabels[pattern.id] || 'Pulse width';
  $('#direct-width').max = pattern.id === 'strobe' ? '25' : '99';
  if (pattern.id === 'strobe' && settings.width > 25) {
    settings.width = 25;
    $('#direct-width').value = '25';
    $('#direct-width-output').value = '25%';
  }

  $('#direct-palette').disabled = custom || !palette;
  $('#direct-target').disabled = custom;
  $('#direct-direction').disabled = custom || !direction.has(pattern.id);
  $('#direct-speed').disabled = custom || !animated.has(pattern.id);
  $('#direct-width').disabled = custom || !pulseWidth.has(pattern.id);
  $('#direct-level').disabled = custom || pattern.id === 'off';

  const morse = pattern.id === 'morse';
  const morseField = $('#direct-morse-field');
  morseField.hidden = !morse;
  $('#direct-morse-text').disabled = !morse;
  if ($('#direct-morse-text').value !== settings.morseText) $('#direct-morse-text').value = settings.morseText;
  if (morse) {
    const encoded = encodeDirectMorse(settings.morseText, directPatternTargetIndices().length);
    const readableCode = encoded.code.replaceAll('.', '·').replaceAll('-', '—');
    $('#direct-morse-output').value = `${encoded.normalized}: ${readableCode}${encoded.truncated ? ' · first marks only' : ''}`;
  }

  const rapidPreview = $('#direct-rapid-preview');
  const reducedMotion = prefersReducedMotion();
  const rapid = directHasRapidFlash();
  if (!rapid || reducedMotion) rapidPreview.checked = false;
  rapidPreview.disabled = !rapid || reducedMotion;

  const baseNote = custom
    ? pattern.description
    : `${pattern.description} ${pattern.support === 'approx' ? 'This is a 10-pixel badge approximation.' : 'This runs entirely on the badge after Apply.'}`;
  $('#direct-pattern-note').textContent = rapid && !directRapidPreviewAllowed()
    ? `${baseNote} Rapid-flash preview is paused; applying it still requires a separate warning.`
    : baseNote;
}

function applySelectedDirectPattern({ announce = false, renderControls = true } = {}) {
  const settings = state.directPatternSettings;
  if (settings.id === 'custom') {
    updateDirectPatternControlState();
    return;
  }
  const targetIndices = directPatternTargetIndices();
  const scene = compileDirectLedPattern({
    id: settings.id,
    paletteId: settings.paletteId,
    direction: settings.direction,
    speed: settings.speed,
    width: settings.width,
    level: settings.level,
    morseText: settings.morseText,
    count: targetIndices.length,
    brightnessMax: $('#direct-high-power').checked ? 255 : 64,
  });
  targetIndices.forEach((ledIndex, sceneIndex) => {
    state.directLeds[ledIndex] = scene[sceneIndex];
    state.directLedDirty.add(ledIndex);
  });
  directLedAnimationStart = performance.now();
  if (renderControls) renderDirectLedControls();
  else updateDirectPowerEstimate();
  $('#direct-led-preview-state').textContent = directHasRapidFlash() && !directRapidPreviewAllowed()
    ? 'RAPID PREVIEW PAUSED · APPLY TO SEND'
    : 'PATTERN READY · APPLY TO SEND';
  updateDirectPatternControlState();
  if (announce) {
    const pattern = DIRECT_LED_PATTERNS.find((candidate) => candidate.id === settings.id);
    log(`Prepared ${pattern.label} for ${settings.target} locally. Choose Apply to send it to the badge.`, 'ok');
  }
}

function setDirectPatternCustom() {
  if (state.directPatternSettings.id === 'custom') return;
  state.directPatternSettings.id = 'custom';
  $('#direct-pattern').value = 'custom';
  updateDirectPatternControlState();
}

function initializeDirectPatternControls() {
  populateDirectPatternControls();
  updateDirectPatternControlState();

  $('#direct-pattern').addEventListener('change', (event) => {
    state.directPatternSettings.id = event.target.value;
    applySelectedDirectPattern({ announce: event.target.value !== 'custom' });
  });
  [
    ['#direct-palette', 'paletteId'],
    ['#direct-target', 'target'],
    ['#direct-direction', 'direction'],
  ].forEach(([selector, key]) => {
    $(selector).addEventListener('change', (event) => {
      state.directPatternSettings[key] = event.target.value;
      applySelectedDirectPattern({ announce: true });
    });
  });
  [
    ['#direct-speed', 'speed'],
    ['#direct-width', 'width'],
    ['#direct-level', 'level'],
  ].forEach(([selector, key]) => {
    const control = $(selector);
    control.addEventListener('input', (event) => {
      state.directPatternSettings[key] = Number(event.target.value);
      applySelectedDirectPattern({ renderControls: false });
    });
    control.addEventListener('change', () => applySelectedDirectPattern());
  });

  $('#direct-morse-text').addEventListener('input', (event) => {
    state.directPatternSettings.morseText = event.target.value;
    applySelectedDirectPattern();
  });
  $('#direct-morse-text').addEventListener('change', () => applySelectedDirectPattern());
}

function renderDirectLedControls() {
  const unlocked = $('#direct-high-power').checked;
  const brightnessMax = unlocked ? 255 : 64;
  const container = $('#direct-led-controls');
  container.textContent = '';
  let clampedAny = false;

  state.directLeds.forEach((led, index) => {
    if (!unlocked && led.brightness > brightnessMax) {
      led.brightness = brightnessMax;
      state.directLedDirty.add(index);
      clampedAny = true;
    }
    const row = document.createElement('div');
    row.className = 'direct-led-control';
    row.dataset.ledIndex = index;
    row.innerHTML = `
      <div class="direct-led-id"><span>${index}</span><strong>${DIRECT_LED_NAMES[index]}</strong></div>
      <label class="direct-color-field">Color<input type="color" value="${led.color}" data-direct-field="color" aria-label="${DIRECT_LED_NAMES[index]} color" ${led.effect === 'rgb' ? 'disabled' : ''} /></label>
      <label class="direct-brightness-field">Brightness <output>${Math.round(led.brightness / 255 * 100)}%</output><input type="range" min="0" max="${brightnessMax}" value="${led.brightness}" data-direct-field="brightness" aria-label="${DIRECT_LED_NAMES[index]} brightness" /></label>
      <label class="direct-effect-field">Effect<select data-direct-field="effect" aria-label="${DIRECT_LED_NAMES[index]} effect"><option value="steady" ${led.effect === 'steady' ? 'selected' : ''}>Steady</option><option value="flash" ${led.effect === 'flash' ? 'selected' : ''}>Flash</option><option value="rgb" ${led.effect === 'rgb' ? 'selected' : ''}>RGB fade</option></select></label>
      <label class="direct-timing-field">Period <input type="number" min="${led.effect === 'rgb' ? DIRECT_LED_RGB_MIN_PERIOD_MS : 40}" max="81900" step="20" value="${led.periodMs}" data-direct-field="periodMs" ${led.effect === 'steady' ? 'disabled' : ''} /><span>ms</span></label>
      <label class="direct-duty-field">On <output>${directDutyLabel(led)}</output><input type="range" min="1" max="99" value="${led.duty}" data-direct-field="duty" ${led.effect === 'flash' ? '' : 'disabled'} /></label>
      <label class="direct-delay-field">Delay <input type="number" min="0" max="81900" step="20" value="${led.delayMs}" data-direct-field="delayMs" ${led.effect === 'steady' ? 'disabled' : ''} /><span>ms</span></label>`;

    const refreshRow = () => {
      const periodControl = row.querySelector('[data-direct-field="periodMs"]');
      row.querySelector('.direct-brightness-field output').value = `${Math.round(led.brightness / 255 * 100)}%`;
      row.querySelector('.direct-duty-field output').value = directDutyLabel(led);
      row.querySelector('[data-direct-field="color"]').disabled = led.effect === 'rgb';
      periodControl.disabled = led.effect === 'steady';
      periodControl.min = led.effect === 'rgb' ? DIRECT_LED_RGB_MIN_PERIOD_MS : 40;
      periodControl.value = led.periodMs;
      row.querySelector('[data-direct-field="duty"]').disabled = led.effect !== 'flash';
      row.querySelector('[data-direct-field="delayMs"]').disabled = led.effect === 'steady';
      row.querySelector('[data-direct-field="delayMs"]').value = led.delayMs;
    };

    row.querySelectorAll('[data-direct-field]').forEach((control) => {
      const field = control.dataset.directField;
      const update = () => {
        if (field === 'color') led.color = control.value;
        else if (field === 'effect') {
          led.effect = control.value;
          if (led.effect === 'rgb') led.periodMs = quantizeDirectMs(led.periodMs, DIRECT_LED_RGB_PRESET_PERIOD_MS, DIRECT_LED_RGB_MIN_PERIOD_MS);
        }
        else if (field === 'brightness') led.brightness = clamp(Number(control.value), 0, brightnessMax);
        else if (field === 'periodMs') {
          const minimumPeriod = led.effect === 'rgb' ? DIRECT_LED_RGB_MIN_PERIOD_MS : 40;
          led.periodMs = quantizeDirectMs(control.value, led.periodMs, minimumPeriod);
        }
        else if (field === 'duty') led.duty = clamp(Number(control.value), 1, 99);
        else if (field === 'delayMs') led.delayMs = quantizeDirectMs(control.value, led.delayMs);

        setDirectPatternCustom();
        refreshRow();
        markDirectLedDirty(index);
      };
      const useChange = field === 'effect' || field === 'periodMs' || field === 'delayMs';
      control.addEventListener(useChange ? 'change' : 'input', update);
    });
    container.append(row);
  });
  if (clampedAny) {
    directLedAnimationStart = performance.now();
    $('#direct-led-preview-state').textContent = `${state.directLedDirty.size} UNSENT POWER-SAFE CHANGE${state.directLedDirty.size === 1 ? '' : 'S'}`;
  }
  updateDirectPowerEstimate();
  saveDirectLedScene();
}

$('#direct-high-power').addEventListener('change', (event) => {
  if (event.target.checked) {
    const approved = window.confirm(
      'Unlock full LED output?\n\n' +
      'Ten full-white WS2812-class pixels can approach 600 mA. Prefer USB power, avoid staring at rapid flashes, and raise brightness gradually.'
    );
    if (!approved) event.target.checked = false;
  }
  if (state.directPatternSettings.id === 'custom') {
    renderDirectLedControls();
    updateDirectPatternControlState();
  } else {
    applySelectedDirectPattern();
  }
});

$('#direct-rapid-preview').addEventListener('change', (event) => {
  if (event.target.checked) {
    const approved = window.confirm(
      'Preview rapid flashing now?\n\n' +
      'Flashes from 3–30 Hz can trigger photosensitive reactions. Stop if you feel discomfort, and do not enable this preview around anyone who has not agreed.'
    );
    if (!approved) event.target.checked = false;
  }
  directLedAnimationStart = performance.now();
  updateDirectPatternControlState();
  if ($('#direct-led-preview-state').textContent.includes('APPLY TO SEND')) {
    $('#direct-led-preview-state').textContent = directHasRapidFlash() && !directRapidPreviewAllowed()
      ? 'RAPID PREVIEW PAUSED · APPLY TO SEND'
      : 'PATTERN READY · APPLY TO SEND';
  }
});

function renderDirectLeds(elapsedMs) {
  const canvas = $('#direct-led-canvas');
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const background = context.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width / 1.5);
  background.addColorStop(0, '#1d271d');
  background.addColorStop(1, '#090c09');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#171d18';
  context.strokeStyle = '#3b473b';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(120, 25, 380, 380, 42);
  context.fill();
  context.stroke();
  context.fillStyle = '#242d25';
  context.beginPath();
  context.arc(width / 2, 235, 135, 0, Math.PI * 2);
  context.fill();

  const rapidPreviewAllowed = directRapidPreviewAllowed();
  const previewColor = (led) => {
    const delayMs = quantizeDirectMs(led.delayMs, 0);
    const effectElapsedMs = elapsedMs - delayMs;
    if (led.effect !== 'steady' && effectElapsedMs < 0) return [0, 0, 0];

    let channels = directColorChannels(led.color);
    let enabled = true;
    let previewScale = 1;
    if (led.effect === 'rgb') {
      const periodMs = quantizeDirectMs(led.periodMs, DIRECT_LED_RGB_PRESET_PERIOD_MS, DIRECT_LED_RGB_MIN_PERIOD_MS);
      const periodTicks = Math.round(periodMs / DIRECT_LED_TICK_MS);
      const elapsedTicks = Math.floor(effectElapsedMs / DIRECT_LED_TICK_MS);
      const hue = Math.floor(elapsedTicks * 768 / periodTicks) % 768;
      const fade = hue & 0xFF;
      if (hue < 256) channels = [255 - fade, fade, 0];
      else if (hue < 512) channels = [0, 255 - fade, fade];
      else channels = [fade, 0, 255 - fade];
    } else if (led.effect === 'flash') {
      const timing = packDirectLedTiming(led);
      const periodTicks = timing.periodTicks;
      const elapsedTicks = Math.floor(effectElapsedMs / DIRECT_LED_TICK_MS);
      const rapid = 1_000 / timing.periodMs >= 3;
      if (rapid && !rapidPreviewAllowed) {
        previewScale = Math.max(0.18, timing.effectiveDuty);
      } else {
        enabled = elapsedTicks % periodTicks < timing.onTimeTicks;
      }
    }
    const scale = enabled ? led.brightness / 255 * previewScale : 0;
    return channels.map((channel) => Math.round(channel * scale));
  };
  for (let ring = 0; ring < 8; ring += 1) {
    const index = ring + 2;
    const angle = -Math.PI / 2 + ring * Math.PI / 4;
    const x = width / 2 + Math.cos(angle) * 118;
    const y = 235 + Math.sin(angle) * 118;
    drawLed(context, x, y, 15, previewColor(state.directLeds[index]));
    context.fillStyle = '#d7dfd2';
    context.font = '10px ui-monospace, monospace';
    context.textAlign = 'center';
    context.fillText(String(index), x, y + 4);
  }
  [[270, 82], [350, 82]].forEach(([x, y], index) => {
    drawLed(context, x, y, 18, previewColor(state.directLeds[index]));
    context.fillStyle = '#d7dfd2';
    context.font = '10px ui-monospace, monospace';
    context.textAlign = 'center';
    context.fillText(String(index), x, y + 4);
  });
}

let directLedBinaryPromise = null;
async function loadDirectLedBinary() {
  if (!directLedBinaryPromise) {
    directLedBinaryPromise = fetch(DIRECT_LED_BINARY_URL, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load the bundled controller (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== DIRECT_LED_BINARY_SIZE || bytes.length > BIO_MAX_BYTES) {
        throw new Error('The bundled controller has an invalid size.');
      }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const digestHex = [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
      if (digestHex !== DIRECT_LED_BINARY_SHA256) throw new Error('The bundled controller failed its integrity check.');
      return bytes;
    }).catch((error) => {
      directLedBinaryPromise = null;
      throw error;
    });
  }
  return directLedBinaryPromise;
}

async function sendBridgeWord(word, repeat = 1) {
  const { responseDelayMs } = await exchange(`bio tx ${word} ${repeat}`, {
    retries: 0,
    silenceMs: 6_500,
    maxTotalMs: 7_500,
  });
  if (responseDelayMs > 2_500) throw new Error('The BIO controller did not consume FIFO data promptly.');
}

async function sendDirectRuns(words) {
  for (let start = 0; start < words.length;) {
    let end = start + 1;
    while (end < words.length && words[end] === words[start]) end += 1;
    await sendBridgeWord(directWordHex(words[start]), end - start);
    start = end;
  }
}

async function sendDirectScene(indices) {
  const changed = [...indices].sort((a, b) => a - b);
  const needsSharedAnimationEpoch = changed.length > 1
    && changed.some((index) => state.directLeds[index].effect !== 'steady');
  const fullFrame = !state.directLedSynced || changed.length > 5 || needsSharedAnimationEpoch;
  if (fullFrame) {
    await sendBridgeWord(DIRECT_LED_FRAME_MAGIC);
    await sendDirectRuns(state.directLeds.map(directColorWord));
    await sendDirectRuns(state.directLeds.map(directConfigWord));
    await sendDirectRuns(state.directLeds.map(directEffectWord));
  } else {
    for (const index of changed) {
      await sendBridgeWord(directWordHex(DIRECT_LED_PIXEL_MAGIC | index));
      await sendBridgeWord(directWordHex(directColorWord(state.directLeds[index])));
      await sendBridgeWord(directWordHex(directConfigWord(state.directLeds[index])));
      await sendBridgeWord(directWordHex(directEffectWord(state.directLeds[index])));
    }
  }
  directLedAnimationStart = performance.now();
  state.directLedDirty.clear();
  state.directLedSynced = true;
  $('#direct-led-preview-state').textContent = 'ON BADGE';
}

function setDirectActionsDisabled(disabled) {
  ['#apply-direct-leds', '#adopt-direct-leds', '#release-direct-leds', '#save-direct-startup'].forEach((selector) => {
    $(selector).disabled = disabled;
  });
  $$('#direct-pattern, #direct-palette, #direct-target, #direct-direction, #direct-speed, #direct-width, #direct-level, #direct-morse-text').forEach((control) => {
    control.disabled = disabled;
  });
  $('#direct-high-power').disabled = disabled;
  $('#direct-rapid-preview').disabled = disabled;
  $('#direct-autostart').disabled = disabled;
  if (disabled) {
    $$('#direct-led-controls input, #direct-led-controls select').forEach((control) => { control.disabled = true; });
  } else {
    renderDirectLedControls();
    updateDirectPatternControlState();
  }
}

$('#adopt-direct-leds').addEventListener('click', () => {
  const approved = window.confirm(
    'Use the BIO program already on this badge as the current direct LED controller?\n\n' +
    'Only continue if this workbench installed the current sleep-safe controller. Controllers installed before the sleep-timing repair can flash white when the badge sleeps and must be reinstalled. If you are unsure, cancel and use Install; saving a startup setting also installs the current controller. The next Apply sends a complete scene so the browser and badge are synchronized.'
  );
  if (!approved) return;
  state.bridgeMode = 'direct';
  state.directLedSynced = false;
  state.directStartupState = 'unknown';
  state.directStartupFingerprint = null;
  state.directLedDirty = new Set(Array.from({ length: DIRECT_LED_COUNT }, (_, index) => index));
  setLightBridgeStatus('PIXEL ENGINE · DECLARED', 'active');
  log('Using the already-installed direct LED controller for this browser session.', 'ok');
});

$('#apply-direct-leds').addEventListener('click', async () => {
  if (state.bridgeMode !== 'direct') {
    const approved = window.confirm(
      'Install the sealed-mode direct LED controller?\n\n' +
      'This replaces any BIO program and disables any previously saved startup scene. It does not flash firmware, enter developer mode, or access k0. The controller uses sleep-safe LED timing but remains experimental because it shares the stock LED data pin.'
    );
    if (!approved) return log('Direct LED controller installation cancelled.', 'info');
  }
  if (directHasRapidFlash()) {
    const approved = window.confirm(
      'Apply a rapid flashing scene to the badge?\n\n' +
      'This scene contains 3–30 Hz flashes that can trigger photosensitive reactions and will keep running after USB is disconnected.'
    );
    if (!approved) return log('Rapid flashing scene was not applied.', 'info');
  }
  if (!(await ensureConnected())) return;
  let binary = null;
  try {
    if (state.bridgeMode !== 'direct') binary = await loadDirectLedBinary();
    setDirectActionsDisabled(true);
    await runSerialOperation(async () => {
      if (state.bridgeMode !== 'direct') {
        setLightBridgeStatus('INSTALLING PIXEL ENGINE');
        await exchange('bio ready', { accepted: ['OK'], retries: 0 });
        await exchange('bio clear', { accepted: ['CLEAR'], retries: 0 });
        await uploadBioBytes(binary, {
          pins: [],
          hz: DIRECT_LED_BRIDGE_CLOCK,
          label: 'direct LED controller',
          chunkRetries: 2,
          chunkTiming: { unmatchedRetries: 4, silenceMs: 8_000, maxTotalMs: 12_000 },
        });
        state.bridgeMode = 'direct';
        state.directLedSynced = false;
        state.directStartupState = 'disabled';
        state.directStartupFingerprint = null;
        $('#direct-autostart').checked = false;
        state.directLedDirty = new Set(Array.from({ length: DIRECT_LED_COUNT }, (_, index) => index));
      }
      setLightBridgeStatus('APPLYING LED SCENE', 'active');
      await sendDirectScene(state.directLedDirty);
      setLightBridgeStatus(directRuntimeStatus(), 'active');
      log('Applied per-LED color, brightness, flash/RGB effect, period, and start delay with sleep-safe timing; k0 was not accessed.', 'ok');
    });
  } catch (error) {
    setLightBridgeStatus(state.bridgeMode === 'direct' ? 'CONTROLLER LOADED · RETRY' : 'CHECK BADGE', 'error');
    log(`Could not apply the direct LED scene: ${error.message}`, 'error');
  } finally {
    setDirectActionsDisabled(false);
  }
});

$('#save-direct-startup').addEventListener('click', async () => {
  const enabled = $('#direct-autostart').checked;
  const rapidWarning = enabled && directHasRapidFlash()
    ? '\n\nThis scene contains 3–30 Hz flashes that can trigger photosensitive reactions and will start again after reboot.'
    : '';
  const approved = window.confirm((enabled
    ? 'Save the current LED scene for startup?\n\nThis clears and rewrites the persistent BIO image, replaces any other BIO program, and takes about four minutes at badge-tested serial speed. The scene will start shortly after the badge reboots. If the upload is interrupted, the saved stock light pattern remains available while you retry.'
    : 'Disable LED auto-start?\n\nThis clears and rewrites the persistent BIO image, replaces any other BIO program, and takes about four minutes. The badge then returns to its saved stock light gene until Apply is used again.') + rapidWarning);
  if (!approved) return log('Startup-scene update cancelled.', 'info');
  if (!(await ensureConnected())) return;

  let uploadStarted = false;
  setDirectActionsDisabled(true);
  try {
    /* Lock the editor before taking the snapshot that is persisted. */
    const words = directSceneWords();
    const fingerprint = directSceneFingerprint(words);
    const template = await loadDirectLedBinary();
    const personalized = makeDirectStartupBinary(template, enabled, words);
    await runSerialOperation(async () => {
      uploadStarted = true;
      setLightBridgeStatus(enabled ? 'SAVING STARTUP SCENE' : 'DISABLING LED STARTUP');
      /* Clear both stale loader slots and the old persistent image first. */
      await exchange('bio clear', { accepted: ['CLEAR'], retries: 0 });
      await uploadBioBytes(personalized, {
        pins: [],
        hz: DIRECT_LED_BRIDGE_CLOCK,
        label: enabled ? 'personalized startup controller' : 'passive LED controller',
        chunkRetries: 2,
        chunkTiming: { unmatchedRetries: 4, silenceMs: 8_000, maxTotalMs: 12_000 },
      });

      state.bridgeMode = 'direct';
      directLedAnimationStart = performance.now();
      if (enabled) {
        state.directStartupState = 'enabled';
        state.directStartupFingerprint = fingerprint;
        state.directLedSynced = true;
        state.directLedDirty.clear();
        $('#direct-led-preview-state').textContent = 'ON BADGE · STARTUP SAVED';
        setLightBridgeStatus('STARTUP SCENE SAVED · ACTIVE', 'active');
        log('Saved the current LED scene in the persistent BIO controller; it will start after reboot and remain correctly timed during ordinary WFI sleep.', 'ok');
      } else {
        state.directStartupState = 'disabled';
        state.directStartupFingerprint = null;
        state.directLedSynced = false;
        state.directLedDirty = new Set(Array.from({ length: DIRECT_LED_COUNT }, (_, index) => index));
        $('#direct-led-preview-state').textContent = 'STARTUP OFF';
        setLightBridgeStatus('STARTUP OFF · SAVED GENE ACTIVE', 'active');
        log('Disabled LED auto-start; the passive controller now yields to the saved stock light gene after reboot.', 'ok');
      }
    });
  } catch (error) {
    if (uploadStarted) {
      state.bridgeMode = null;
      state.directLedSynced = false;
      state.directStartupState = 'unknown';
      state.directStartupFingerprint = null;
      state.directLedDirty = new Set(Array.from({ length: DIRECT_LED_COUNT }, (_, index) => index));
      setLightBridgeStatus('STARTUP UPDATE INCOMPLETE · RETRY', 'error');
    }
    log(`Could not update the startup LED scene: ${error.message}`, 'error');
  } finally {
    setDirectActionsDisabled(false);
  }
});

$('#release-direct-leds').addEventListener('click', async () => {
  if (state.bridgeMode !== 'direct') return log('Declare or install the direct LED controller before releasing it.', 'warn');
  if (!(await ensureConnected())) return;
  state.directLedSynced = false;
  state.directLedDirty = new Set(Array.from({ length: DIRECT_LED_COUNT }, (_, index) => index));
  try {
    setDirectActionsDisabled(true);
    await runSerialOperation(() => sendBridgeWord(DIRECT_LED_RELEASE_MAGIC));
    const startupStatus = state.directStartupState === 'enabled'
      ? 'RELEASED NOW · STARTUP RETURNS ON REBOOT'
      : state.directStartupState === 'disabled'
        ? 'CONTROLLER IDLE · STARTUP OFF'
        : 'CONTROLLER IDLE · STARTUP UNKNOWN';
    setLightBridgeStatus(startupStatus, 'active');
    $('#direct-led-preview-state').textContent = 'RELEASED';
    log(state.directStartupState === 'enabled'
      ? 'Released the LED chain for now; the saved startup scene remains enabled and returns after reboot.'
      : state.directStartupState === 'disabled'
        ? 'Released the LED chain; LED auto-start is disabled and the signed stock renderer resumed its saved gene.'
        : 'Released the LED chain; whether a scene is saved for the next reboot is unknown in this browser session.', 'ok');
  } catch (error) {
    setLightBridgeStatus('RELEASE STATUS UNKNOWN · RETRY', 'error');
    log(`The release response was not confirmed; the badge may already have released the LEDs: ${error.message}`, 'error');
  } finally {
    setDirectActionsDisabled(false);
  }
});

restoreDirectLedScene();
initializeDirectPatternControls();
renderDirectLedControls();

/* Light-gene phenotype simulator */
const GENE_PRESETS = Object.freeze({
  goon:      { hue: [0, 20],   base: 0,    sat: [160,255], chaser: [90,255], nonlin: [0,255], dir: [0,255], period: 4 },
  community: { hue: [32, 80],  sat: [32,160], chaser: [90,255], nonlin: [0,255], dir: [0,255], period: 2 },
  village:   { hue: [80, 128], sat: [32,160], chaser: [90,255], nonlin: [0,255], dir: [0,45],  period: 4 },
  human:     { hue: [128,160], sat: [32,255], chaser: [90,255], nonlin: [0,255], dir: [0,255], period: 5 },
  other:     { hue: [160,192], sat: [16,255], chaser: [0,255],  nonlin: [0,90],  dir: [0,255], period: 6 },
  ctf:       { hue: [192,220], sat: [16,255], chaser: [90,255], nonlin: [0,90],  dir: [0,255], period: 6 },
  uber:      { hue: [220,255], bound: 255, sat: [130,255],chaser: [0,45],   nonlin: [0,44],  dir: [0,45],  period: 3 },
});

const MUTATION_LEVELS = Object.freeze({
  baseline: { rate: 64, mask: 1 },
  elevated: { rate: 100, mask: 3 },
  radioactive: { rate: 140, mask: 7 },
  apocalyptic: { rate: 240, mask: 31 },
});

function randomByte() {
  const value = new Uint8Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

function randomInt(min, max) {
  return min + Math.floor(randomByte() / 256 * (max - min + 1));
}

function saturatingAdd(a, b) {
  return Math.min(255, a + b);
}

function randomHaploid(spec) {
  const base = spec.base ?? randomInt(spec.hue[0], spec.hue[1]);
  const bound = spec.bound ?? randomInt(base, spec.hue[1]);
  return new Uint8Array([
    randomInt(0, spec.period),
    randomByte(),
    randomInt(spec.dir[0], spec.dir[1]),
    randomInt(spec.sat[0], spec.sat[1]),
    randomByte(),
    base,
    bound,
    randomInt(spec.chaser[0], spec.chaser[1]),
    randomInt(spec.nonlin[0], spec.nonlin[1]),
  ]);
}

function derivePhenotype(parentA, parentB) {
  const phenotype = new Uint8Array(9);
  phenotype[0] = Math.min(6, Math.floor((parentA[0] + parentB[0]) / 2));
  phenotype[1] = Math.floor((parentA[1] + parentB[1]) / 2);
  phenotype[2] = saturatingAdd(parentA[2], parentB[2]);
  phenotype[3] = saturatingAdd(parentA[3], parentB[3]);
  phenotype[4] = (2 + (14 - Math.min(14, saturatingAdd(parentA[4], parentB[4])))) % 14;
  phenotype[5] = Math.min(parentA[5], parentB[5]);
  phenotype[6] = Math.max(parentA[6], parentB[6], phenotype[5]);
  phenotype[7] = saturatingAdd(parentA[7], parentB[7]);
  // This intentionally mirrors the stock dominance expression, including its chaser/nonlinear cross-trait behavior.
  phenotype[8] = saturatingAdd(parentA[7], parentB[8]);
  return phenotype;
}

function geneHex(bytes = state.gene) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join(' ');
}

function setGene(bytes) {
  state.gene = new Uint8Array(bytes);
  $$('[data-gene-index]').forEach((slider) => {
    const index = Number(slider.dataset.geneIndex);
    slider.value = state.gene[index];
    $(`[data-gene-output="${index}"]`).value = state.gene[index];
  });
  $('#gene-hex').value = geneHex();
}

function grayEncode(value) {
  return (value ^ (value >> 1)) & 0xFF;
}

function grayDecode(value) {
  let decoded = 0;
  for (let gray = value & 0xFF; gray; gray >>= 1) decoded ^= gray;
  return decoded & 0xFF;
}

function mutateGene(bytes, level) {
  const { rate, mask } = MUTATION_LEVELS[level];
  const mutated = new Uint8Array(bytes);
  for (let index = 0; index < mutated.length; index += 1) {
    if (randomByte() < rate) {
      const shiftedMask = (mask << randomInt(0, 7)) & 0xFF;
      mutated[index] = grayDecode(grayEncode(mutated[index]) ^ shiftedMask);
    }
  }
  mutated[0] %= 7;
  return mutated;
}

function hsvToRgb(hue, saturation, value) {
  const h = ((hue % 256) + 256) % 256 / 256 * 6;
  const s = saturation / 255;
  const v = value / 255;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(h % 2 - 1));
  const match = v - chroma;
  let rgb;
  if (h < 1) rgb = [chroma, x, 0];
  else if (h < 2) rgb = [x, chroma, 0];
  else if (h < 3) rgb = [0, chroma, x];
  else if (h < 4) rgb = [0, x, chroma];
  else if (h < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map((channel) => Math.round((channel + match) * 255));
}

function geneColors(elapsedMs) {
  const gene = state.gene;
  const loop = Math.floor(elapsedMs / 35) & 0x1FF;
  const tau = 60 + gene[1] / 255 * 640;
  const wavePhase = (elapsedMs % (tau * 10)) / (tau * 10) * Math.PI * 2;
  const hueRate = gene[4] & 0x0F;
  const reverseHue = ((gene[4] >> 4) & 0x0F) > 10;
  const ring = [];
  const chaser = gene[7] < 88 ? Math.floor(loop / 2) % 8 : -1;

  for (let index = 0; index < 8; index += 1) {
    let huePosition = 32 * index + (reverseHue ? -1 : 1) * loop * hueRate;
    huePosition = ((huePosition % 512) + 512) % 512;
    if (huePosition > 255) huePosition = 511 - huePosition;
    const hue = gene[5] + (gene[6] - gene[5]) * huePosition / 255;
    const space = Math.PI * 2 * gene[0] * index / 7;
    const directionPhase = gene[2] > 128 ? wavePhase : -wavePhase;
    let brightness = 127 * (1 + Math.cos(space + directionPhase));
    if (gene[8] > 127) brightness = brightness * brightness / 256;
    ring.push(index === chaser ? [208,208,208] : hsvToRgb(hue, gene[3], brightness));
  }

  const eyes = chaser >= 0
    ? (chaser < 4 ? [[192,192,192],[0,0,0]] : [[0,0,0],[192,192,192]])
    : [ring[0], ring[4]];
  return { ring, eyes };
}

function drawLed(geneContext, x, y, radius, rgb) {
  const [red, green, blue] = rgb;
  const color = `rgb(${red},${green},${blue})`;
  geneContext.save();
  geneContext.shadowColor = color;
  geneContext.shadowBlur = 8 + Math.max(red, green, blue) / 10;
  geneContext.fillStyle = color;
  geneContext.beginPath();
  geneContext.arc(x, y, radius, 0, Math.PI * 2);
  geneContext.fill();
  geneContext.restore();
  geneContext.strokeStyle = '#596357';
  geneContext.lineWidth = 2;
  geneContext.beginPath();
  geneContext.arc(x, y, radius + 4, 0, Math.PI * 2);
  geneContext.stroke();
}

function renderGene(elapsedMs) {
  const geneCanvas = $('#gene-canvas');
  const geneContext = geneCanvas.getContext('2d');
  const { ring, eyes } = geneColors(elapsedMs);
  const faceDown = $('#gene-face-down').checked;
  const width = geneCanvas.width;
  const height = geneCanvas.height;
  geneContext.clearRect(0, 0, width, height);
  const background = geneContext.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width / 1.5);
  background.addColorStop(0, '#1d271d');
  background.addColorStop(1, '#090c09');
  geneContext.fillStyle = background;
  geneContext.fillRect(0, 0, width, height);

  geneContext.fillStyle = '#171d18';
  geneContext.strokeStyle = '#3b473b';
  geneContext.lineWidth = 3;
  geneContext.beginPath();
  geneContext.roundRect(120, 25, 380, 380, 42);
  geneContext.fill();
  geneContext.stroke();
  geneContext.fillStyle = '#242d25';
  geneContext.beginPath();
  geneContext.arc(width / 2, 235, 135, 0, Math.PI * 2);
  geneContext.fill();

  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 4;
    drawLed(geneContext, width / 2 + Math.cos(angle) * 118, 235 + Math.sin(angle) * 118, 15, ring[index]);
  }
  const visibleEyes = faceDown ? eyes : [[0,0,0],[0,0,0]];
  drawLed(geneContext, 270, 82, 18, visibleEyes[0]);
  drawLed(geneContext, 350, 82, 18, visibleEyes[1]);

  geneContext.fillStyle = '#7e8b7d';
  geneContext.font = '12px ui-monospace, monospace';
  geneContext.textAlign = 'center';
  geneContext.fillText(faceDown ? 'EYES ENABLED' : 'RING MODE', width / 2, 394);
}

let geneAnimationStart = performance.now();
function renderStaticLightPreview() {
  if ($('#lights').hidden || document.hidden || state.serialBusy) return;
  renderDirectLeds(0);
  renderGene(0);
}

function updateLightAnimation() {
  const previewVisible = !$('#lights').hidden && !document.hidden && !state.serialBusy;
  const shouldAnimate = previewVisible && !prefersReducedMotion();
  if (shouldAnimate && lightAnimationFrame === null) {
    lightAnimationFrame = requestAnimationFrame(animateGene);
  } else if (!shouldAnimate && lightAnimationFrame !== null) {
    cancelAnimationFrame(lightAnimationFrame);
    lightAnimationFrame = null;
  }
  if (previewVisible && prefersReducedMotion()) renderStaticLightPreview();
}

function animateGene(now) {
  lightAnimationFrame = null;
  if ($('#lights').hidden || document.hidden || state.serialBusy || prefersReducedMotion()) return;
  if (now - lastLightPreviewRender >= LIGHT_PREVIEW_FRAME_MS) {
    renderDirectLeds(now - directLedAnimationStart);
    renderGene(now - geneAnimationStart);
    lastLightPreviewRender = now;
  }
  lightAnimationFrame = requestAnimationFrame(animateGene);
}

['input', 'change', 'click'].forEach((eventName) => {
  $('#lights').addEventListener(eventName, () => {
    if (prefersReducedMotion()) renderStaticLightPreview();
  });
});

reducedMotionQuery?.addEventListener?.('change', () => {
  lastLightPreviewRender = Number.NEGATIVE_INFINITY;
  updateDirectPatternControlState();
  updateLightAnimation();
});

$$('[data-gene-index]').forEach((slider) => {
  slider.addEventListener('input', () => {
    const index = Number(slider.dataset.geneIndex);
    state.gene[index] = Number(slider.value);
    $(`[data-gene-output="${index}"]`).value = state.gene[index];
    $('#gene-hex').value = geneHex();
  });
});

$('#random-gene').addEventListener('click', () => {
  const type = $('#gene-preset').value;
  const spec = GENE_PRESETS[type];
  setGene(derivePhenotype(randomHaploid(spec), randomHaploid(spec)));
  geneAnimationStart = performance.now();
  log(`Generated a ${type} light phenotype from two randomized haploids.`, 'ok');
});

$('#mutate-gene').addEventListener('click', () => {
  const level = $('#gene-mutation').value;
  setGene(mutateGene(state.gene, level));
  geneAnimationStart = performance.now();
  log(`Applied the stock ${level} mutation model to the light phenotype.`, 'ok');
});

$('#import-gene').addEventListener('click', () => {
  let raw = $('#gene-hex').value.trim().replace(/0x/gi, '');
  let tokens = raw.split(/[\s,;:-]+/).filter(Boolean);
  if (tokens.length === 1 && /^[0-9a-f]{18}$/i.test(tokens[0])) tokens = tokens[0].match(/../g);
  if (tokens.length !== 9 || tokens.some((token) => !/^[0-9a-f]{1,2}$/i.test(token))) {
    return log('A light phenotype must contain exactly nine hexadecimal bytes.', 'error');
  }
  setGene(tokens.map((token) => Number.parseInt(token, 16)));
  geneAnimationStart = performance.now();
  log('Imported nine light phenotype bytes.', 'ok');
});

$('#copy-gene').addEventListener('click', async () => {
  const bytes = geneHex();
  try {
    await navigator.clipboard.writeText(bytes);
  } catch (_) {
    const field = $('#gene-hex');
    field.select();
    document.execCommand('copy');
    window.getSelection()?.removeAllRanges();
  }
  log('Light phenotype bytes copied.', 'ok');
});

function lightBridgeWord(index, value) {
  return (0x40000000 | ((index & 0xFF) << 8) | (value & 0xFF)) >>> 0;
}

async function sendLightBridgeWord(hexWord) {
  await sendBridgeWord(hexWord);
}

async function sendLightPhenotype({ gene = state.gene.slice(), eyeOn = $('#gene-face-down').checked } = {}) {
  const geneBytes = new Uint8Array(gene);
  await sendLightBridgeWord(LIGHT_BRIDGE_FRAME_MAGIC);
  for (let index = 0; index < geneBytes.length; index += 1) {
    const word = lightBridgeWord(index, geneBytes[index]);
    const hexWord = `0x${word.toString(16).padStart(8, '0')}`;
    await sendLightBridgeWord(hexWord);
    await sleep(15);
  }
  await sendLightBridgeWord(eyeOn ? '0x20000000' : '0x10000000');
}

function setGeneEditorDisabled(disabled) {
  [
    '#apply-gene', '#adopt-light-bridge', '#restore-gene', '#random-gene', '#mutate-gene',
    '#import-gene', '#copy-gene', '#gene-preset', '#gene-mutation', '#gene-hex', '#gene-face-down',
  ].forEach((selector) => { $(selector).disabled = disabled; });
  $$('[data-gene-index]').forEach((control) => { control.disabled = disabled; });
}

async function releaseInstalledBridge(mode) {
  if (mode === 'direct') {
    await sendBridgeWord(DIRECT_LED_RELEASE_MAGIC);
  } else if (mode === 'gene') {
    await sendLightPhenotype({ eyeOn: false });
  }
}

$('#adopt-light-bridge').addEventListener('click', () => {
  const approved = window.confirm(
    'Use the BIO program already installed on this badge as the sealed LED bridge?\n\n' +
    'Only continue if this workbench or the direct repair session installed it. This skips replacement and sends the framed LED words to the current BIO program.'
  );
  if (!approved) return;
  state.bridgeMode = 'gene';
  state.directLedSynced = false;
  setLightBridgeStatus('GENE BRIDGE · DECLARED', 'active');
  log('Using the already-installed sealed LED bridge for this browser session.', 'ok');
});

$('#apply-gene').addEventListener('click', async () => {
  if (!(await ensureConnected())) return;
  if (state.bridgeMode !== 'gene') {
    const approved = window.confirm(
      'Install the sealed-mode LED bridge?\n\n' +
      'This replaces any BIO program currently stored on the badge. It does not flash firmware, enter developer mode, or read/write k0. “Restore saved badge gene” removes the bridge afterward.'
    );
    if (!approved) return log('Light bridge installation cancelled.', 'info');
  }

  const gene = state.gene.slice();
  const eyeOn = $('#gene-face-down').checked;
  setGeneEditorDisabled(true);
  try {
    await runSerialOperation(async () => {
      if (state.bridgeMode !== 'gene') {
        if (state.bridgeMode === 'direct') {
          await sendBridgeWord(DIRECT_LED_RELEASE_MAGIC);
          await sleep(120);
        }
        setLightBridgeStatus('INSTALLING');
        // Clear the loader's partial-chunk staging buffer before installing a
        // known program. The confirmation above already covers replacement.
        await exchange('bio ready', { accepted: ['OK'], retries: 0 });
        await exchange('bio clear', { accepted: ['CLEAR'], retries: 0 });
        await uploadBioBytes(LIGHT_BRIDGE_BINARY, {
          pins: [],
          hz: LIGHT_BRIDGE_CLOCK,
          label: 'sealed light bridge',
          chunkRetries: 2,
          // Re-sending one of these two indexed chunks only overwrites the same
          // staging slot. Keep every later commit/FIFO command non-retrying.
          chunkTiming: { unmatchedRetries: 4, silenceMs: 8_000, maxTotalMs: 12_000 },
        });
        state.bridgeMode = 'gene';
        state.directLedSynced = false;
        state.directStartupState = 'disabled';
        state.directStartupFingerprint = null;
        setLightBridgeStatus('GENE BRIDGE ACTIVE', 'active');
        await sleep(150);
      }
      setLightBridgeStatus('APPLYING', 'active');
      await sendLightPhenotype({ gene, eyeOn });
      setLightBridgeStatus('GENE BRIDGE ACTIVE', 'active');
      log(`Applied built-in LED phenotype ${geneHex(gene)}; k0 was not accessed.`, 'ok');
    });
  } catch (error) {
    if (state.bridgeMode === 'gene') {
      setLightBridgeStatus('BRIDGE LOADED · RETRY', 'error');
    } else {
      setLightBridgeStatus('CHECK BADGE', 'error');
    }
    log(`Could not apply light phenotype: ${error.message}`, 'error');
  } finally {
    setGeneEditorDisabled(false);
  }
});

$('#restore-gene').addEventListener('click', async () => {
  if (!(await ensureConnected())) return;
  const knownBridge = state.bridgeMode;
  if (!knownBridge) {
    const approved = window.confirm(
      'Clear the badge BIO program and restore its saved light gene?\n\n' +
      'The browser cannot identify an existing BIO program after reconnecting. Continuing removes whatever BIO program is currently stored; k0 is not affected.'
    );
    if (!approved) return log('BIO clear cancelled.', 'info');
  }
  setGeneEditorDisabled(true);
  try {
    setLightBridgeStatus('RESTORING');
    state.bridgeMode = null;
    state.directLedSynced = false;
    await runSerialOperation(async () => {
      if (knownBridge) {
        try {
          await releaseInstalledBridge(knownBridge);
          await sleep(100);
        } catch (error) {
          log(`Bridge release warning: ${error.message} Continuing with BIO clear.`, 'warn');
        }
      }
      await exchange('bio clear', { accepted: ['CLEAR'], retries: 0 });
    });
    setLightBridgeStatus('SAVED GENE ACTIVE');
    state.directStartupState = 'disabled';
    state.directStartupFingerprint = null;
    log('BIO bridge cleared; stock Vault restored the saved badge light gene.', 'ok');
  } catch (error) {
    setLightBridgeStatus('RESTORE FAILED', 'error');
    log(`Could not restore saved light gene: ${error.message}`, 'error');
  } finally {
    setGeneEditorDisabled(false);
  }
});

$('#gene-face-down').addEventListener('change', () => renderGene(performance.now() - geneAnimationStart));
document.addEventListener('visibilitychange', updateLightAnimation);
setGene(state.gene);
updateLightAnimation();
