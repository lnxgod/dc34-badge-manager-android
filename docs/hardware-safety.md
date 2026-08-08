# Hardware safety

## USB

Use a USB-C OTG adapter/cable that carries data. Android becomes the USB host and may supply VBUS. Avoid improvised power wiring, and do not connect two independent power sources through an unverified adapter.

The app opens the observed Baochip Baosec-lite USB CDC device at 1,000,000 baud, 8 data bits, one stop bit, no parity, and no flow control. It intentionally does not toggle DTR or RTS.

## SAO ports

- VDD is **3.0 V**.
- The tested budget is **100 mA total across both SAO ports**.
- Existing badge I²C devices use `0x19` and `0x3C`.
- External BIO-routable signals map to pins 21, 22, 30, and 31.
- GPIO4 is used as an open-drain wake interrupt in the official SAO guidance.
- Verify connector orientation before applying power.

## BIO and lights

BIO uploads are reversible, but bridge/controller installation replaces any other BIO program. A disconnect after an ambiguous command invalidates synchronization; reconnect and restart the complete operation.

Direct LED control is an experimental shared-pin takeover. It does not access the saved light-exchange key (`k0`) or flash Xous. Keep the 25% brightness guard enabled unless the power consequences are understood. Ten full-white WS2812C pixels can approach 600 mA, and rapid flashing can trigger photosensitive reactions.

Image upload uses the official full-line transfer method with a 200 ms pause after each acknowledged chunk. A physical DC34 badge completed 32/32 Triforce chunks without a retry in about 35 seconds, including synchronization. Keep the badge still and on the same screen; motion or button presses can change the display and interrupt the console.

Startup save clears and rewrites persistent BIO at the physically verified 60 ms serial pace. That pace completed a 48/48 controller upload plus commit/reload and 13/13 LED pattern commands with no retries or input overflow. Budget about six minutes and keep both devices powered and awake.
