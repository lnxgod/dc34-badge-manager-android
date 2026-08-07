# DC34 Badge Manager

An offline-first Android app and local-first browser workbench for the official DEF CON 34 human badge. Both surfaces preserve the badge-tested protocol rules, previews, safety gates, and local-only data handling.

> **Status:** beta. The app builds and can be exercised without a badge, but Android USB port selection and full transfers still require validation on physical DC34 hardware and more than one phone model.

## Web version

The standalone GameChangers AI landing page and browser workbench live in [`website/`](website/README.md). The website reuses the Android app’s badge runtime during its build, so screen art, BIO + SAO, console, QR, and light controls do not drift between platforms.

```sh
cd website
npm test
npm run serve
```

The website CI publishes a downloadable static-site artifact on every relevant change. Production deployment to `gamechangersai.org/dc34badge` is enabled when the repository has a prefix-scoped `DC34BADGE_DEPLOY_ROLE_ARN` variable for GitHub OIDC and the intended `DC34BADGE_CLOUDFRONT_DISTRIBUTION_ID`.

## Install the beta

[Download DC34 Badge Manager 0.1.1 beta 2 APK](https://github.com/lnxgod/dc34-badge-manager-android/releases/download/v0.1.1-beta.2/dc34-badge-manager-0.1.1-beta.2.apk), then open it on an Android 8.0 or newer phone. Android may ask you to allow **Install unknown apps** for your browser or file manager.

This beta APK is test/debug-signed for hardware testing. It uses the same test certificate as the earlier betas, so it installs as an in-place update. A later production-signed build may require uninstalling this beta first. SHA-256: `6f44d52f8a4ae368c646a968e13e08b19ba8f86919de92e5ea2294aaba79ecd6`.

See [all releases](https://github.com/lnxgod/dc34-badge-manager-android/releases) for notes and future builds.

## What it manages

- **Screen art:** crop/scale any supported image to the 128 × 128 one-bit display, tune threshold, use Floyd–Steinberg dithering, invert, upload, or clear.
- **BIO + SAO:** load up to 3,840 bytes, route external lines to pins 21/22/30/31, set a 25 kHz–350 MHz clock, clear BIO, and use FIFO 3 TX/RX.
- **Serial console:** run stock and custom commands with bounded history and long-payload redaction.
- **QR Vault tools:** generate time sync, hostname password lookup, TOTP enrollment, and custom QR payloads entirely on-device.
- **Direct lights:** choose from 20 practical badge-safe patterns—including traffic signal, text-to-Morse, Nyan rainbow, and Hack the planet—plus 14 palettes; browse WLED's complete 216-effect reference catalog, tune the sliders, target eyes or ring pixels, then apply at runtime or save for startup.
- **Light genes:** generate, mutate, import, preview, and temporarily apply nine-byte phenotypes through the reversible BIO bridge.
- **Badge guide:** SAO limits, token workflow, light exchange, official source links, and signed-firmware recovery guidance.

## Android additions

- Native USB host serial at **1,000,000 baud**, including Android permission and attach/detach handling.
- USB device filter for the observed Baochip Baosec-lite ID `1d50:6198`.
- Native file picker for screen art and BIO binaries.
- Android document picker for QR exports.
- Screen-awake protection during long, serialized badge operations.
- Bundled HTTPS-style asset origin, blocked remote navigation, disabled cookies/backups, and **no Internet permission**.
- External documentation links open in the user's browser instead of inside the privileged workbench.

## Requirements

- Android 8.0 (API 26) or later with USB host/OTG support.
- A USB-C OTG **data** cable or adapter.
- The official DEF CON 34 human badge.

The badge console is unusually sensitive to bursts. The manager deliberately sends each command byte 30 ms apart, verifies exact command echoes and final results, and waits between commands. Direct-light periods and start delays retain the original workbench's 20 ms controller quantum. The first operation performs a 128-backspace synchronization that takes about 6 seconds. Do not background, unplug, or power-cycle the badge during a BIO commit or startup-scene save.

## Build

The repository pins AGP 8.9.2, Gradle 8.11.1, Java 17, compile/target SDK 35, and `usb-serial-for-android` 3.11.0.

```sh
./gradlew testDebugUnitTest lintDebug assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

To install on a connected emulator or phone:

```sh
./gradlew installDebug
```

## Safety

- SAO power is **3.0 V**, not 3.3 V, with **100 mA shared** across both ports.
- Badge I²C addresses `0x19` and `0x3C` are already occupied.
- Installing either light bridge replaces the current BIO program.
- Direct LED brightness is capped at 25% until explicitly unlocked; a full-white ten-pixel scene can approach 600 mA.
- Startup-scene saving rewrites persistent BIO and can take about four minutes.
- Custom/developer firmware is a one-way trust transition that erases provisioned secrets; this app does not flash Xous firmware.

See [hardware safety](docs/hardware-safety.md) and [firmware recovery](docs/firmware-recovery.md) before using those features.

## Privacy and security

The APK does not request Internet, broad storage, camera, microphone, location, or account permissions. Runtime assets are bundled. TOTP secrets remain in the page's transient form state and are not written to app storage or logs. Android cloud backup is disabled.

The JavaScript bridge is reachable only from the bundled `appassets.androidplatform.net` origin. Remote navigations are refused and passed to an external browser. See [SECURITY.md](SECURITY.md) for reporting guidance.

## Provenance and licensing

The web workbench source was supplied by a project collaborator on August 6, 2026. Its archive hash and exclusions are recorded in [docs/provenance.md](docs/provenance.md). The bundled official firmware backup was intentionally excluded; recovery instructions link to the official distribution.

Project-authored files do not yet have an owner-approved open-source license. Until the owners add one, normal copyright rules apply. Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This is an unofficial community tool. It is not endorsed by or affiliated with DEF CON, Baochip, or the upstream badge-project authors.
