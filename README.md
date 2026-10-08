# WorldTap development web player

React/Vite hosts the Unity player at https://worldtapio-dev.web.app. The game
downloads versioned runtime files from https://d2agetn4u2winj.cloudfront.net.
Firebase authentication and backend access use `worldtapio-dev`.

## Infrastructure

- AWS account: `376129878558`, S3 region: `us-east-1`.
- CloudFormation stack: `worldtap-webgl-dev`; template: `deploy/aws-dev.json`.
- Private bucket: `worldtap-webgl-dev-376129878558-us-east-1`.
- CloudFront distribution: `E1THZHWTXH6VH2`, global edge locations, HTTPS.
- S3 public access is blocked. Only the distribution can read objects through OAC.
- CORS permits the dev Firebase domains and local Vite ports 5173/4173.
- Versioned objects use one-year immutable caching. The frontend build pointer
  is served without caching. No production domain or DNS is configured here.

## Prepare and publish a build

Run from this project directory with Node.js, AWS CLI and Firebase CLI available.
The AWS profile must access the account above; Firebase login must access dev.
No credentials belong in this repository.

```powershell
# Infrastructure setup/update (review template changes first).
aws cloudformation deploy --template-file deploy/aws-dev.json --stack-name worldtap-webgl-dev --region us-east-1 --no-fail-on-empty-changeset

# Use a NEW timestamp directory for every changed Unity build.
node tools/prepare-build.mjs ../G.lba_unity/Builds/WebGL-dev/20260928-021501
node tools/publish-build.mjs 20260928-021501 https://d2agetn4u2winj.cloudfront.net
npm run lint
npm run build
firebase deploy --only hosting --project worldtapio-dev --non-interactive
```

Preparation copies the existing Unity Firebase bootstrap/config into `public/runtime`
and Brotli-compresses loader/framework/data/wasm files (quality 9). Publication sets MIME, Content-Encoding
and Cache-Control metadata explicitly, including for files too large for automatic
CloudFront compression. StreamingAssets retain their complete relative directory
layout. Compressed artifacts live under ignored `artifacts/`; raw Unity builds
remain in the Unity project's ignored Builds directory.

`public/build-config.json` selects the immutable CDN release. `deploy/dev-release.json`
records file sizes and SHA-256 checksums. Never overwrite a released timestamp with
different bytes: publish a new prefix, then update the frontend pointer. To roll
back, restore a previous build-config.json and redeploy the frontend; old CDN
objects stay available. Deleting the stack retains its S3 bucket.

## Player startup

The frontend awaits Firebase initialization before mounting Unity. It queues early
Unity callbacks until React Unity WebGL exposes the created instance, then forwards
them to that instance. The Unity component is mounted once (outside StrictMode's
development remount cycle). Loading/error UI and display pixel ratio are handled
by React. The installed react-unity-webgl package is retained.

For local development, run `npm run dev` on localhost:5173 after preparing and
publishing the build. The browser still downloads game files from the dev CDN.

## Verification and limits

The source Unity artifact is development build `20260928-021501`. It includes the
verified action-end crash fix, audible defaults for new profiles, and asynchronous
WebGL localization startup. Its existing catalog invalid-handle, Firestore-listener
permissions, desktop orientation and external Google Drive CORS errors remain
separate game issues. Ads, web payments, production rollout and mobile-device
coverage are not established by this hosting deployment.

Check browser network responses for CDN URLs, br/MIME/CORS headers, CloudFront
cache hits, and successful Firebase calls. A successful frontend build alone does
not prove Unity has reached gameplay.

### Hosted verification ? 2026-09-28 UTC

Deployed to https://worldtapio-dev.web.app with CloudFront distribution
E1THZHWTXH6VH2. Chrome reached the globe as an anonymous guest. Verified a
Firestore actionData read, Realtime Database globe/MX read, and getServerData
callable response against worldtapio-dev. CDN gzip/MIME/CORS/cache headers and
repeated cache hits passed; frontend lint and production build passed.

The country confirmation retains a 10-second startup timeout while waiting for
input. Confirming promptly after reload reached the globe. New guest startup
also logged USER_NOT_FOUND and a denied Firestore listener; those game issues
remain unresolved. RTDB live updates, purchases, ads, Google sign-in and physical
devices were not verified by this deployment. Production and DNS were unchanged.

### Non-development player deployment ? 2026-09-28 UTC

Uploaded non-development release: `20260928-030449`, built through Unity menu
`Glba/Validation/Build Release WebGL` with `BuildOptions.None`.
Build report: Succeeded, development=False, errors=0. Build inputs also confirm
Development=false and managed/IL2CPP debugging disabled. The backend remains dev.

All 39 files were uploaded to `dev/20260928-030449/` in the existing private S3
bucket. Total compressed upload: 98,361,605 bytes; gzip WebAssembly: 16,616,573 bytes.
CloudFront returned 200 with application/wasm, gzip, immutable caching and the dev
origin CORS header. Frontend lint/build and Firebase Hosting deployment passed.
The earlier `20260928-021501` version remains available for rollback.


Runtime validation found that EnvironmentSettings.ValidateEnvironmentAccess rejects
Development for non-debug players and falls back to Testing. The web bootstrap
still selects worldtapio-dev, creating inconsistent environment selection. Browser
startup reached legal screens without the development overlay, but gameplay was
not accepted as verified. The frontend pointer was restored to 20260928-021501
pending a user decision on allowing release WebGL with dev or using testing.
That release remains on S3 but is superseded by the corrected release below.


### Corrected release ? 20260928-032539

Approved change: release WebGL players may use Development when the Firebase
project selects it. The UNITY_WEBGL && !UNITY_EDITOR branch in EnvironmentSettings
allows this without altering native/Editor rules or Testing/Production checks.
Native/Editor source after excluding that branch matches the original exactly.
No Android/iOS build was run for this isolated change.

Unity build succeeded with development=False and zero errors; build inputs have
Development=false and AllowDebugging=false. All 39 files uploaded under
`dev/20260928-032539/` (98,361,660 compressed bytes). CloudFront gzip WebAssembly
is 16,616,619 bytes with correct MIME, immutable caching and dev-origin CORS.
Frontend build and Hosting deployment passed. The live build-config selects this
version and the Firebase project remains worldtapio-dev.


Hosted verification confirms `[EnvironmentManager] Initialized with environment:
Development` and Firebase project worldtapio-dev, with no development overlay.
Anonymous auth, Firestore actionData read, RTDB globe/MX read and getServerData
callable succeeded. One initial load hit LanguageManager's timeout; reload passed
localization. Existing USER_NOT_FOUND, catalog invalid-handle and denied listener
errors remain and were not addressed by this environment change.

Final hosted Chrome check reached the globe with localized text and no Development Build overlay (20260928-032539). Physical Android/iOS testing remains unperformed for this release.

### Prize completion fix — 20260928-134222

Release WebGL build succeeded with development=False and zero errors. All 39
files were published to the existing `dev/20260928-134222/` S3 prefix behind
CloudFront (98,369,831 compressed bytes). The gzip WebAssembly object is
16,617,252 bytes; HTTP 200, MIME, compression, immutable caching and dev-origin
CORS headers passed. Frontend production build and Firebase Hosting deployment
passed; the live dev app selects this version.

Hosted Chrome validated the WebGL button-listener workaround with a FakeStore
100-token purchase and a 10-token daily reward: both animations finished, balances
updated, and no main-loop/signature-mismatch crash occurred. This is dev fake-store
validation, not Xsolla payment validation. Reloading the same tab across deployment
preserved the anonymous identity and byte-identical saved preferences and skipped
onboarding. The user's earlier session reset was not reproduced or declared fixed.
Existing unrelated catalog, permission, external CORS and SoundData errors remain.
Native builds and physical mobile browsers were not retested for this release.

### Lossless web download optimization

The same `20260928-134222` player now has Brotli objects alongside its original
gzip objects. All four compressed files were decompressed and compared byte for
byte with the Unity build before publication. Total files referenced by the new
manifest: 90,274,763 bytes, down from 98,369,831 bytes (8.23%). The player data is
45,923,787 bytes and WebAssembly 13,175,727 bytes. StreamingAssets and the loading
flow are unchanged. Historical gzip files remain available; the publisher accepts
either compression format when using an older manifest for rollback.
