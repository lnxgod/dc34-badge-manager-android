# DC34 badge website

This folder builds the public GameChangers AI landing page and browser workbench for the DEF CON 34 badge.

The site has two surfaces:

- `/dc34badge` is the landing page, quick start, official talk listing, Android download path, attendee thank-you, and project credit.
- `/dc34badge/workbench/index.html` is the complete browser workbench for screen art, BIO + SAO, the serial console, QR payloads, lights, and the badge guide.

The workbench runtime is copied from `app/src/main/assets/www` during the build. That keeps Android and the website on the same serial protocol and badge tooling. The web-only visual layer lives in `src/workbench-theme.css`.

## Build and test

Node.js 20 or newer is required.

```sh
cd website
npm test
```

The build output is written to `website/dist` and is intentionally ignored by Git.

To inspect it locally:

```sh
cd website
npm run build
npm run serve
```

Then open `http://127.0.0.1:4173/dc34badge`. The local server mirrors the production subpath and exact-file routing. USB access requires a secure origin in production; localhost is accepted by Chromium for development.

The build defaults to the GameChangers AI path. Set `SITE_BASE_PATH` to build and serve the same static files under another absolute path:

```sh
SITE_BASE_PATH=/dc34-badge-manager-android npm test
SITE_BASE_PATH=/dc34-badge-manager-android npm run serve
```

`SITE_BASE_PATH` must be empty (site root) or an absolute path without a trailing slash, query, fragment, backslash, or dot segment.

## Browser support

- Desktop Chrome or Edge: full Web Serial workbench over HTTPS.
- Other browsers: image and QR previews work, but USB serial access may not.
- Android 14: use the native app from the repository’s latest GitHub release.

## Production target

Deploy only the contents of `website/dist` to the `dc34badge` prefix of the GameChangers AI static-site bucket. Upload the landing HTML both as `dc34badge` and `dc34badge/index.html`, because the current CloudFront distribution does not rewrite directory paths.

Do not use a bucket-wide delete or sync. The deploy identity should be limited to:

- `s3://gamechangersai-static-web-content/dc34badge`
- `s3://gamechangersai-static-web-content/dc34badge/*`

Use temporary AWS credentials or GitHub Actions OIDC. Never commit or paste permanent AWS access keys.

For GitHub OIDC, trust only the repository’s `main` branch (`repo:lnxgod/dc34-badge-manager-android:ref:refs/heads/main`) with audience `sts.amazonaws.com`. The workflow rejects AWS accounts other than `345594592214` and applies a second, inline session policy limited to this S3 prefix and the configured CloudFront distribution. The underlying role should enforce the same limits.

## GitHub Pages mirror

The website workflow also tests a project-Pages build at `/dc34-badge-manager-android`. Pull requests and feature branches build and test that variant but cannot deploy it. Only `main` may publish the `github-pages` artifact to the protected `github-pages` environment.

The `main`-only deploy job enables Pages with GitHub Actions as its source. Keep the Pages environment restricted to `main`. The artifact is uploaded with `index.html` at its root, producing `https://lnxgod.github.io/dc34-badge-manager-android/`; do not nest it inside another repository-name folder or add a `CNAME`. The canonical URL remains the GameChangers AI deployment.
