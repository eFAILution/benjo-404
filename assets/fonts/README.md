# Fonts

The 404 page uses the same two typefaces as the live site, Inter and Geist Mono. The page cannot load anything from the network (ADR-0008), so we ship small subsets here and the build inlines them as `data:` URLs.

| File | Family inside the font | Built from | Raw | gzip -9 |
|------|------------------------|------------|-----|---------|
| `b404-sans-400.woff2` | B404 Sans | Inter 4.1, `Inter-Regular.ttf` | 7,696 B | 7,739 B |
| `b404-mono-400.woff2` | B404 Mono | Geist Mono 1.802 (release v1.8.2), `GeistMono-Regular.ttf` | 4,592 B | 4,635 B |

Budget: each file under 14 KB, both together under 28 KB gzipped. WOFF2 is already Brotli compressed, so gzip adds a few bytes.

## Sources

Only the official GitHub releases were used.

| Font | Release | Archive | Archive SHA-256 |
|------|---------|---------|-----------------|
| Inter | [rsms/inter v4.1](https://github.com/rsms/inter/releases/tag/v4.1), published 2024-11-16 | [`Inter-4.1.zip`](https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip) (33,707,794 B) | `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e` |
| Geist Mono | [vercel/geist-font v1.8.2](https://github.com/vercel/geist-font/releases/tag/v1.8.2), published 2026-10-21 | [`geist-font-v1.8.2.zip`](https://github.com/vercel/geist-font/releases/download/v1.8.2/geist-font-v1.8.2.zip) (8,208,251 B) | `43ffb66912b1c49e40c371d96e86b3b3dab42db83eb2d0c8a17321210394c4c7` |

The Geist hash matches the digest GitHub publishes for that asset. The Inter release has no published digest; the size matches the release listing.

Files used from the archives:

| Path in archive | SHA-256 |
|-----------------|---------|
| `extras/ttf/Inter-Regular.ttf` | `40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82` |
| `LICENSE.txt` (shipped here as `OFL-Inter.txt`) | `262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a` |
| `geist-font/GeistMono/ttf/GeistMono-Regular.ttf` | `2c01278ad859e862b39d1f618c2272dfd0df7c23d5aab37ff7062cdd615abf83` |
| `geist-font/OFL.txt` (shipped here as `OFL-Geist.txt`) | `c683bfbcc7e087f5d37a54ef628f10387c451a83ddc459b151403a164ac46c90` |

The license files are copied byte for byte. Do not let a whitespace fixer rewrite them.

## What the subsets contain

- Characters: printable ASCII (U+0020 to U+007E), U+00B7 middle dot (HUD strip), U+2019 right single quote, U+2026 ellipsis.
- Weight 400 only, static instances. No italics.
- OpenType features: `kern` and `tnum`. `tnum` lets the HUD score use `font-variant-numeric: tabular-nums` so digits do not jitter. Geist Mono has neither feature and needs neither, since every glyph is the same width.
- No hinting. Inter's own web fonts ship unhinted, and keeping the hints grows the subsets to 12,040 B (sans) and 9,164 B (mono).
- Name records kept: copyright (0), license (13, 14), and the renamed family records below. Everything else is dropped.

## The rename

The family inside each subset is renamed: Inter becomes `B404 Sans` and Geist Mono becomes `B404 Mono`. The SIL Open Font License 1.1 says a modified version may not use a Reserved Font Name, and a subset is a modified version. Neither license file declares a Reserved Font Name today, so the rename is a precaution: it stays correct if a future release adds one, it keeps our cut-down files from posing as the full fonts, and it stops the page from matching a locally installed Inter or Geist Mono by name. See assumption A-8.2.

Name table after the rename (Windows, English):

| ID | B404 Sans | B404 Mono |
|----|-----------|-----------|
| 0 | Copyright 2016 The Inter Project Authors | Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git) |
| 1 | B404 Sans | B404 Mono |
| 2 | Regular | Regular |
| 3 | 4.001;B404Sans-Regular | 1.802;B404Mono-Regular |
| 4 | B404 Sans Regular | B404 Mono Regular |
| 5 | Version 4.001; subset for benjo-404 | Version 1.802; subset for benjo-404 |
| 6 | B404Sans-Regular | B404Mono-Regular |
| 13, 14 | OFL 1.1 notice and URL from the source | OFL 1.1 notice and URL from the source |
| 16 | B404 Sans | B404 Mono |
| 17 | Regular | Regular |

## Rebuilding

`build/subset-fonts.sh` reproduces both files byte for byte. It needs [uv](https://docs.astral.sh/uv/); fonttools is not a repo dependency, so `uvx` runs a pinned copy (`fonttools[woff]==4.67.0`, `brotli==1.2.1`, `zopfli==0.4.3`).

```sh
mkdir -p /tmp/fonts-src/dl && cd /tmp/fonts-src/dl
curl -fsSLO https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
curl -fsSLO https://github.com/vercel/geist-font/releases/download/v1.8.2/geist-font-v1.8.2.zip
shasum -a 256 *.zip   # compare with the table above
unzip -q Inter-4.1.zip -d ../inter
unzip -q geist-font-v1.8.2.zip -d ../geist
cd - && build/subset-fonts.sh /tmp/fonts-src
```

For each font the script runs:

```sh
uvx --from 'fonttools[woff]==4.67.0' --with 'brotli==1.2.1' --with 'zopfli==0.4.3' \
  pyftsubset <source>.ttf \
  --unicodes='U+0020-007E,U+00B7,U+2019,U+2026' \
  --layout-features='kern,tnum' \
  --name-IDs='0,1,2,3,4,5,6,13,14' \
  --no-hinting --flavor=woff2 \
  --output-file=assets/fonts/b404-<sans|mono>-400.woff2
```

Then it rewrites name IDs 1 to 6, 16, and 17 with fonttools (keeping `head.modified` so reruns give identical bytes), and checks that name IDs 1, 4, 6, and 16 carry the new family, that no family record still says Inter or Geist, that every requested character is mapped, and that the file is under 14 KB. Geist Mono prints `WARNING: meta NOT subset; don't know how to subset; dropped`, which is expected.

Expected output SHA-256:

```text
2dc22be9e5df481273a2138e3c58331b952d87eaf6645dca7b467ffa87c893b2  b404-sans-400.woff2
99d43aced05335aec687121a1b70dd4701906cd6507bee0ea7ac2eb24d488147  b404-mono-400.woff2
```
