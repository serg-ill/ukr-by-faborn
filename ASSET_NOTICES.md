# Asset sources

## Dolby wordmark

The inline vector in `lib/faborn-ui.js` uses the original geometry and proportions of Dolby’s white wordmark:
https://professional.dolby.com/globalassets/logo/dolby_logo_white.svg

Source page: https://professional.dolby.com/technologies/dolby-audio/
Retrieved 2026-10-01. SVG editor metadata and global CSS classes were removed; the original vector paths and viewBox are preserved. The wordmark is displayed in white. The adjacent Audio / Atmos / Vision labels are interface text.

Dolby and the double-D symbol, Dolby Atmos and Dolby Vision are trademarks of Dolby Laboratories. These marks identify declared media formats; they do not imply certification, affiliation or endorsement of this plugin. A format badge describes the release metadata, not a guarantee of hardware playback support.

## Starfield motion

The radial star motion in `lib/faborn-screensaver.js` is adapted from [AnnikaV9/starfield.js](https://github.com/AnnikaV9/starfield.js), commit `103c2c2c6c6b354efa2f871bfcca3e9a6d969848` (source header 1.5.0). Retrieved 2026-10-01.

Copyright (c) 2024 carrot. MIT license: [lib/STARFIELD-LICENSE](lib/STARFIELD-LICENSE). The adaptation uses ES5, bounded Canvas resolution and star count, reduced frame rate, a cancellable lifecycle, and Lampa's native idle layer. Aurora, clock, settings and playback/input guards are implemented in this project. No third-party script is fetched while a screensaver is running.
