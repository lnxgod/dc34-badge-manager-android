# Contributing

Contributions are welcome after the maintainers select a project license. Until then, open an issue before submitting substantial code.

For a change:

1. Keep the application offline-first and do not add the Android `INTERNET` permission.
2. Preserve exact serial pacing, echo validation, and one-shot command rules.
3. Add tests for protocol, path, export, or queue behavior that changes.
4. Run `./gradlew testDebugUnitTest lintDebug assembleDebug`.
5. Never commit badge serial numbers, TOTP secrets, private console logs, signing keys, firmware readbacks, or decoded firmware payloads.

Hardware-facing changes should state the phone model, Android version, cable/adapter, badge firmware, and whether the test used the official human or Uber badge.
