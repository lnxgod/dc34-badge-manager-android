/* Small, dependency-free helpers for gating DC34 console command responses. */
((root, factory) => {
  'use strict';
  const protocol = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = protocol;
  if (root) root.DC34SerialProtocol = protocol;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  'use strict';

  const CONSOLE_PREFIX = '[console]';
  // Physical-badge validation at 60 ms completed a Triforce image (32/32),
  // BIO controller upload (48/48 plus commit/reload), and LED pattern (13/13)
  // with no retries or input overflow. Keep this independent from the 20 ms
  // LED quantum and 30 FPS preview throttle.
  const SERIAL_CHAR_DELAY_MS = 60;

  async function writeBytesBurst(bytes, { write, assertReady = () => undefined } = {}) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError('Serial bytes must be a Uint8Array.');
    if (typeof write !== 'function' || typeof assertReady !== 'function') {
      throw new TypeError('Burst serial writes require write and optional assertReady functions.');
    }

    assertReady();
    await write(bytes);
    assertReady();
  }

  async function writeBytesPaced(bytes, { write, wait, assertReady = () => undefined } = {}) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError('Serial bytes must be a Uint8Array.');
    if (typeof write !== 'function' || typeof wait !== 'function' || typeof assertReady !== 'function') {
      throw new TypeError('Serial pacing requires write, wait, and optional assertReady functions.');
    }

    for (let index = 0; index < bytes.length; index += 1) {
      assertReady();
      await write(Uint8Array.of(bytes[index]));
      assertReady();
      // The badge needs a gap between characters, but no extra delay is needed
      // after the final byte because response handling supplies the boundary.
      if (index + 1 < bytes.length) await wait(SERIAL_CHAR_DELAY_MS);
    }
  }

  function classifyWholeLineResponse(response, accepted) {
    if (typeof response !== 'string' || !Array.isArray(accepted)) {
      throw new TypeError('Whole-line response checks require a string and an accepted-response array.');
    }
    if (accepted.includes(response)) return 'accepted';
    // Match the protocol's bare ERR only. Firmware log lines use `ERR :...`
    // and must remain harmless chatter.
    if (response === 'ERR') return 'error';
    return 'chatter';
  }

  function createCommandEchoGate(line) {
    const expectedEcho = `${CONSOLE_PREFIX} ${line}`;
    let sawExpectedEcho = false;

    return Object.freeze({
      expectedEcho,
      consume(response) {
        if (!response.startsWith(CONSOLE_PREFIX)) {
          return { kind: 'response', authorized: sawExpectedEcho };
        }
        if (response === expectedEcho) {
          sawExpectedEcho = true;
          return { kind: 'expected-echo', authorized: true };
        }
        // A late line from an earlier command can still be in the USB or
        // firmware output queue. Before our own echo it is harmless chatter;
        // afterward, another command echo makes the result ambiguous.
        if (response === CONSOLE_PREFIX || !sawExpectedEcho) {
          return { kind: 'chatter', authorized: false };
        }
        return { kind: 'conflicting-echo', authorized: false };
      },
      hasExpectedEcho() {
        return sawExpectedEcho;
      },
    });
  }

  return {
    SERIAL_CHAR_DELAY_MS,
    classifyWholeLineResponse,
    createCommandEchoGate,
    writeBytesBurst,
    writeBytesPaced,
  };
});
