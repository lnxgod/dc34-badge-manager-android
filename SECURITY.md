# Security policy

## Supported version

The current `main` branch is the only supported development line while the app is in beta.

## Reporting

Please use a private GitHub security advisory for vulnerabilities that could:

- expose a TOTP or password payload;
- let remote content call the Android JavaScript bridge;
- send an unintended or duplicate badge command;
- bypass a BIO/light destructive-action warning;
- write outside a user-selected Android document;
- make the app request unexpected permissions.

Do not include live TOTP secrets, badge identifiers, console dumps containing personal data, or private firmware in a public issue. Ordinary UI bugs and feature requests can use public GitHub issues.

If GitHub's private reporting form is unavailable, open a public issue titled
`Private security contact requested` without vulnerability details; a
maintainer will arrange a private channel.

## Security properties

- No `INTERNET` permission.
- No analytics, telemetry, advertising, or remote runtime assets.
- No cloud backup.
- Remote navigation is blocked inside the privileged WebView.
- Badge writes are serialized and ambiguous operations are not replayed.
- TOTP values are not intentionally persisted or logged.
