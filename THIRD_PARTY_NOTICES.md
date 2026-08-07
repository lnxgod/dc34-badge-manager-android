# Third-party notices

## QR Code generator library

- Project Nayuki QR Code generator
- Copyright © Project Nayuki
- License: MIT
- Bundled file: `app/src/main/assets/www/vendor/qrcodegen.js`
- Bundled SHA-256: `2511bc17f40a3c41d4a0578995db956b38997334d3d20113a5d4dc5c49c69480`

The full MIT permission notice is preserved at the top of the bundled file. The exact upstream revision of the supplied compiled file was not recorded in the source handoff and remains a provenance follow-up.

## WLED effect-name catalog

- Project: WLED
- Version: 16.0.1
- Copyright © 2016–present Christian Schwinne and WLED contributors
- License: EUPL-1.2-or-later
- Source: <https://github.com/wled/WLED/tree/v16.0.1>
- Derived catalog: `app/src/main/assets/www/wled-catalog.js`

The workbench uses WLED's registered effect IDs and names, plus a compact menu grouping derived from upstream metadata, so its pattern menu can describe the complete upstream catalog. No WLED effect algorithms or palette implementations are copied. Badge-ready patterns are independently compiled to the DC34 controller's native steady, flash-to-black, and RGB-wheel modes.

## usb-serial-for-android

- Project: `mik3y/usb-serial-for-android`
- Version: 3.11.0
- License: MIT
- Source: <https://github.com/mik3y/usb-serial-for-android/tree/3.11.0>
- Packaged license: `app/src/main/assets/licenses/usb-serial-for-android-LICENSE.txt`

The library is resolved as a build dependency and is included in APK outputs.

```text
MIT License

Copyright (c) 2011-2013 Google Inc.
Copyright (c) 2013 Mike Wakerly

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Apache-2.0 runtime components

The APK includes these transitive runtime components:

- [`org.jetbrains.kotlin:kotlin-stdlib:2.2.10`](https://github.com/JetBrains/kotlin/tree/v2.2.10/libraries/stdlib)
- [`org.jetbrains:annotations:13.0`](https://repo.maven.apache.org/maven2/org/jetbrains/annotations/13.0/)
- [`androidx.annotation:annotation-jvm:1.10.0`](https://developer.android.com/jetpack/androidx/releases/annotation#1.10.0)

All three are distributed under the Apache License 2.0. The complete license
is packaged at `app/src/main/assets/licenses/APACHE-2.0.txt`. AndroidX also
retains its upstream copy at `META-INF/androidx/annotation/annotation/LICENSE.txt`
inside the APK.

## DC34 interface references

The workbench implements documented public formats and behavior from `dc34-image`, `dc34-bio`, `dc34-console`, `dc34-vault`, and `dc34-api`. The first two repositories are Apache-2.0; the source handoff did not establish licenses for the latter three. This repository references their interfaces and documentation and does not claim that those projects license this implementation.
