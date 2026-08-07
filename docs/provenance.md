# Source provenance

The Android port began from a collaborator-supplied archive received through the project owner's connected Google account on 2026-08-06.

| Field | Value |
| --- | --- |
| Supplied filename | `dc34badge (2).tar.gz` |
| Size | 9,700,009 bytes |
| SHA-256 | `499603b419092dd477b3a2746da36aa78f62fc3deabd94e16f550f570b1d8983` |
| Web entry point | `dc34badge/index.html` |

## Imported

- `index.html`, `styles.css`, and `app.js`
- Project Nayuki QR generator with its MIT notice
- BIO bridge sources
- One canonical `direct-led-bridge.bin`, size 3,052 bytes, SHA-256 `3e3d18f928c3091a22c8a036ad0701f3e60fbbc1e71f35fec2d496b52f17dfe9`

## Excluded

- The complete `firmware-backup` tree, including signed ZIP/UF2 files and decoded binaries
- A firmware manifest containing a unique badge serial number and workstation device path
- Python `__pycache__` bytecode
- `tools/direct_led_smoke.py`, which is a desktop hardware-validation utility rather than an Android runtime component
- The duplicate `directled.bin`, byte-identical to `direct-led-bridge.bin`
- Earlier PCB/manufacturing archives sent in a separate email; they are unrelated to the Android manager

The source handoff did not include Git history, a root project license, a reproducible BIO build recipe, or the exact QR-generator revision. Those facts are documented rather than guessed.
