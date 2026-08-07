/* Native Android USB serial adapter for the bundled DC34 workbench. */
(() => {
  'use strict';
  if (!window.DC34Android) return;

  const pending = new Map();
  const serialEvents = new EventTarget();
  const ACTIVE_READ_POLL_MS = 20;
  const IDLE_READ_POLL_MAX_MS = 250;
  let sequence = 0;
  let sessionSequence = 0;
  let activePort = null;

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function request(method, ...args) {
    const requestId = `android-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try {
        window.DC34Android[method](requestId, ...args);
      } catch (error) {
        pending.delete(requestId);
        reject(error);
      }
    });
  }

  function fromBase64(encoded) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function toBase64(value) {
    const bytes = value instanceof Uint8Array
      ? value
      : new Uint8Array(value.buffer || value, value.byteOffset || 0, value.byteLength || value.length);
    let binary = '';
    for (let start = 0; start < bytes.length; start += 0x4000) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 0x4000));
    }
    return btoa(binary);
  }

  class NativeReader {
    constructor(port) {
      this.port = port;
      this.cancelled = false;
      this.released = false;
    }

    async read() {
      let pollMs = ACTIVE_READ_POLL_MS;
      while (!this.cancelled && this.port.opened) {
        const encoded = window.DC34Android.readBase64(this.port.sessionId);
        if (encoded.startsWith('error:')) {
          throw new DOMException(encoded.replace(/^error:/, '') || 'USB read failed.', 'NetworkError');
        }
        if (encoded) return { value: fromBase64(encoded), done: false };
        // Keep command responses responsive, but avoid 50 native bridge calls
        // per second while a connected badge and app are both idle.
        pollMs = document.body?.dataset.serialBusy === 'true'
          ? ACTIVE_READ_POLL_MS
          : Math.min(IDLE_READ_POLL_MAX_MS, pollMs * 2);
        await delay(pollMs);
      }
      return { value: undefined, done: true };
    }

    async cancel() { this.cancelled = true; }
    releaseLock() { this.released = true; }
  }

  class NativeWriter {
    constructor(port) {
      this.port = port;
      this.released = false;
    }

    async write(value) {
      if (!this.port.opened) throw new DOMException('No serial device is connected.', 'NetworkError');
      const result = window.DC34Android.writeBase64(this.port.sessionId, toBase64(value));
      if (result !== 'ok') throw new DOMException(result.replace(/^error:/, '') || 'USB write failed.', 'NetworkError');
    }

    releaseLock() { this.released = true; }
  }

  class NativePort {
    constructor(sessionId) {
      this.sessionId = sessionId;
      this.opened = false;
      this.reader = null;
      this.writer = null;
      this.readable = { getReader: () => (this.reader = new NativeReader(this)) };
      this.writable = { getWriter: () => (this.writer = new NativeWriter(this)) };
    }

    async open(options = {}) {
      await request('open', this.sessionId, Number(options.baudRate || 0));
      this.opened = true;
    }

    async close() {
      if (this.reader) await this.reader.cancel();
      window.DC34Android.close(this.sessionId);
      this.opened = false;
    }

    disconnect() {
      this.opened = false;
      if (this.reader) this.reader.cancelled = true;
    }
  }

  const serial = {
    async requestPort() {
      const sessionId = `usb-${Date.now().toString(36)}-${(sessionSequence += 1).toString(36)}`;
      const candidate = new NativePort(sessionId);
      await request('requestPort', sessionId);
      activePort = candidate;
      return candidate;
    },
    async getPorts() { return activePort && activePort.opened ? [activePort] : []; },
    addEventListener: (...args) => serialEvents.addEventListener(...args),
    removeEventListener: (...args) => serialEvents.removeEventListener(...args),
  };

  Object.defineProperty(navigator, 'serial', { configurable: true, enumerable: true, value: serial });

  window.__dc34Serial = {
    resolve(requestId) {
      const callback = pending.get(requestId);
      if (!callback) return;
      pending.delete(requestId);
      callback.resolve();
    },
    reject(requestId, name, message) {
      const callback = pending.get(requestId);
      if (!callback) return;
      pending.delete(requestId);
      callback.reject(new DOMException(message || 'Android USB operation failed.', name || 'NetworkError'));
    },
    notifyDisconnected(sessionId) {
      if (!activePort || activePort.sessionId !== sessionId) return;
      activePort.disconnect();
      const event = new Event('disconnect');
      Object.defineProperty(event, 'port', { value: activePort });
      serialEvents.dispatchEvent(event);
    },
    notifyAttached() {
      const runtime = document.querySelector('#android-runtime span');
      if (runtime) runtime.textContent = 'USB device attached. Tap Connect badge to grant access and open the DC34 console.';
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('android-app');
    const runtime = document.querySelector('#android-runtime');
    if (runtime) runtime.hidden = false;

    if (!navigator.clipboard?.writeText) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => window.DC34Android.copyText(String(text)) },
      });
    }

    const busyObserver = new MutationObserver(() => {
      window.DC34Android.setBusy(document.body.dataset.serialBusy === 'true');
    });
    busyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-serial-busy'] });

    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link || link.download || !/^https?:/i.test(link.href)) return;
      event.preventDefault();
      window.DC34Android.openExternal(link.href);
    });
  });

  window.addEventListener('pagehide', () => window.DC34Android.setBusy(false));
})();
