/* Small, dependency-free helpers for gating DC34 console command responses. */
((root, factory) => {
  'use strict';
  const protocol = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = protocol;
  if (root) root.DC34SerialProtocol = protocol;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  'use strict';

  const CONSOLE_PREFIX = '[console]';

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

  return { createCommandEchoGate };
});
