# License status and third-party notices

## Project source

No project-wide license for RNGdle Infinite's original source code is currently
declared. Public repository access is not a general reuse or redistribution
license. Contact [jaimegamingpro@gmail.com](mailto:jaimegamingpro@gmail.com) about
permissions. This document does not select a license or change existing rights.

A maintainer decision is needed before adding a root `LICENSE` file. Do not infer
MIT licensing from a dependency, the emoji package or another repository.

## Bundled assets

- **Twemoji graphics:** artwork is attributed to Twitter, Inc. and other
  contributors via [Twemoji](https://github.com/jdecked/twemoji). The graphics
  license is [CC BY 4.0](public/emoji/LICENSE-GRAPHICS), including its attribution
  requirements. The optimized SVG dependency is
  [`@twemoji/svg`](https://github.com/boywithkeyboard/twemoji_svg); its MIT package
  notice is retained in [`public/emoji/LICENSE`](public/emoji/LICENSE). That
  package notice must not be mistaken for the artwork's separate graphics
  license. Local assets are selected by the vendoring tool; preserve attribution
  when changing or redistributing them.
- **Fonts:** Inter, Plus Jakarta Sans and Space Mono are distributed under the
  SIL Open Font License 1.1. Their notices are included in each installed
  `@fontsource-variable/inter`, `@fontsource-variable/plus-jakarta-sans` and
  `@fontsource/space-mono` package's `LICENSE` file.
- **Lucide icons:** the `lucide-react` package carries the ISC license and
  notices for Feather-derived portions. Preserve the package's `LICENSE`.

The lockfile identifies dependency versions. Each dependency's license remains
its own; this is not an exhaustive legal audit of all transitive dependencies.
Any redistribution should review and retain the relevant notices for its build.

## Inspiration and references

The original RNGdle and RNGdle Tools are credited in the README. Their inclusion
as references does not imply affiliation or transfer their trademarks, code or
content licenses to this project.
