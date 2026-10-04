# HLS.js 1.7.3

Upstream: https://github.com/video-dev/hls.js/releases/tag/v1.7.3

Source package: official npm registry, `hls.js@1.7.3`, `dist/hls.min.js`.
The npm tarball integrity was checked before vendoring.

License: Apache-2.0; the original license is included in `LICENSE`.

Faborn modification: the original distribution is wrapped in a local CommonJS
export container and exported as `window.FabornHls`. The distribution inside the
wrapper is unchanged. This prevents replacing `window.Hls` used by Lampa or other
extensions. No upstream site player code is included.

Loaded only when the user selects Faborn Player with the browser HLS engine.
