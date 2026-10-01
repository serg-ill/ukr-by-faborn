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

## Studio and service logos

Original PNG network logos, retrieved from TMDB on 2026-10-01 and bundled without pixel edits. Display-only CSS preserves proportions and uses monochrome white versions where needed for contrast. The text name is retained as a fallback.

- `assets/studios/netflix.png`: [TMDB network 213 logo](https://image.tmdb.org/t/p/w300/wwemzKWzjKYJFfCeiB57q3r4Bcm.png).
- `assets/studios/apple.png`: [TMDB network 2552 logo](https://image.tmdb.org/t/p/w300/bngHRFi794mnMq34gfVcm9nDxN1.png).
- `assets/studios/prime.png`: [TMDB network 1024 logo](https://image.tmdb.org/t/p/w300/w7HfLNm9CWwRmAMU58udl2L7We7.png).
- `assets/studios/disney.png`: [TMDB network 2739 logo](https://image.tmdb.org/t/p/w300/1edZOYAfoyZyZ3rklNSiUpXX30Q.png).
- `assets/studios/hbo.png`: [TMDB network 3186 logo](https://image.tmdb.org/t/p/w300/nmU0UMDJB3dRRQSTUqawzF2Od1a.png).
- `assets/studios/paramount.png`: [TMDB network 4330 logo](https://image.tmdb.org/t/p/w300/fi83B1oztoS47xxcemFdPMhIzK.png).
- `assets/studios/hulu.png`: [TMDB network 453 logo](https://image.tmdb.org/t/p/w300/pqUTCleNUiTLAVlelGxUgWn1ELh.png).

Netflix, Apple TV, Prime Video, Disney+, HBO Max, Paramount+ and Hulu are trademarks of their respective owners. They identify catalog collections; their appearance does not imply affiliation or endorsement. Movie provider data is supplied by TMDB / JustWatch, credited in the collection menu. This product uses the TMDB API but is not endorsed or certified by TMDB.
