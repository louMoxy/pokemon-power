# Power Creep: are Pokémon getting stronger?

An interactive data story about **1,025 Pokémon**, nine generations and 28 years of base
stats, built with three.js. Scroll through the story, then explore the data yourself:
group it, filter it, and click any Pokémon to spin it up as a 3D voxel model.

**Live site:** _add your GitHub Pages link here after the first deploy_

## What the data shows

Comparing like with like (fully evolved, non-legendary Pokémon), the answer is
**"a little, once"**:

- **One real step, then a plateau.** Average base stat total (BST) jumps in Gen 4 (465 → 496)
  and then sits around 495 for five generations.
- **Gen 9's jump is the Paradox Pokémon.** Its average of 522 falls to 499 without the 20
  Paradox Pokémon, which the games count as regular but which average 578.
- **Legendaries are getting weaker.** Fully evolved legendaries fell from about 627 (Gens 4
  and 6) to 574 (Gen 9). The gap to regular Pokémon shrank from 119 BST to 52.
- **The strongest new Pokémon arrive after launch.** The 39 species added through DLC,
  follow-ups and events since 2017 average 536 BST, against 423 for launch-game species.
- **Some things never creep.** Every generation has a pseudo-legendary at exactly 600.

The full write-up, with methods and caveats, is in [docs/FINDINGS.md](docs/FINDINGS.md).

## Features

- **Story mode:** ten scroll-driven chapters. Sprites fly in, trend lines draw themselves
  and the background shifts colour with each chapter.
- **Explore mode:** a 2D chart you can pan and zoom, in nine layouts:
  - two "galaxy" maps, by stat role (UMAP) and by overall power (PCA)
  - six groupings: generation, type, evolution stage, rarity, console and debut game
  - a type × generation heatmap
- **Filters:** by type, generation, evolution, rarity and console, plus search. The chart
  rebuilds around the Pokémon that match, and group averages recalculate.
- **3D voxel models:** click a Pokémon to turn its sprite into a rotating voxel figure.
- Works on phones: layouts turn sideways in portrait, and story cards pin to the bottom.

## How it's built

| Part | What it does |
|---|---|
| `scripts/fetch-data.mjs` | Pulls every species from [PokeAPI](https://pokeapi.co) (cached locally) |
| `scripts/games.mjs` | Hand-curated release dates for 28 main-series games, cross-checked against PokeAPI's regional Pokédexes |
| `scripts/build-derived.mjs` | PCA and UMAP layouts, dominant sprite colours, and the sprite atlas (lossless WebP) |
| `scripts/analyze.mjs` | The statistics behind the story (bootstrap confidence intervals) → `findings.json` |
| `src/sprites.js` | All 1,025 sprites as instanced billboards in **one draw call**; layout morphs run on the GPU |
| `src/layouts.js`, `src/guides.js` | Strip plots, heatmap, labels, average lines and trend lines |
| `src/story.js` | Scroll-driven chapters |
| `src/voxel.js` | Sprite → voxel model (one box per pixel, thicker towards the middle) |
| `src/backdrop.js` | Full-screen shader: nebula, dot grid, stars |

Stack: [Vite](https://vite.dev) and [three.js](https://threejs.org), with no UI framework.

## Running it locally

Requires Node.js 20 or later.

```bash
npm install
npm run dev            # http://localhost:5173
```

The data in `public/data` is committed. To rebuild it from PokeAPI:

```bash
npm run data:all       # fetch → derive → analyze (first run takes a few minutes)
```

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes
it to GitHub Pages. One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Credits

- Data: [PokeAPI](https://pokeapi.co). Release dates: [Bulbapedia](https://bulbapedia.bulbagarden.net).
- Pokémon, their names and sprites are © Nintendo, Creatures Inc. and GAME FREAK. This is a
  non-commercial fan project and isn't affiliated with or endorsed by them.
