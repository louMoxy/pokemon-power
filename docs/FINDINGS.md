# Findings: Pokémon power creep

Data: 1,025 species, default forms only, from PokeAPI. Reproduce with
`npm run data:all`.
The site reads the numbers from `public/data/findings.json`.

**Comparison group ("core"):** fully evolved and not legendary or mythical (479 species).
Raw per-generation averages mislead, because each generation adds a different mix of
babies, first stages and legendaries. **"Strict core"** also removes the 11 Ultra Beasts
(Gen 7) and 20 Paradox Pokémon (Gen 9). PokeAPI does not flag these as legendary, but
their stats sit on the legendary curve.

Trends are least-squares slopes of BST on generation. The 95% intervals come from
2,000 bootstrap resamples.

---

## 1. Newer Pokémon are stronger, but by a step, not a slope

| Gen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Core mean BST | 485 | 467 | 465 | **496** | 493 | 498 | 497 | 497 | **522** |
| Strict core | 485 | 467 | 465 | **496** | 493 | 498 | 476 | 497 | 499 |

- Over all generations, the core group gains **+5.2 BST per generation** (95% CI 3.5–6.9).
- Two jumps drive most of that:
  - **Gen 4 (+31).** Sinnoh added late evolutions to older lines, such as Magmortar,
    Electivire, Rhyperior and Togekiss.
  - **Gen 9 (+25).** This jump is **entirely the Paradox Pokémon.** Their average is 578.
    Without them, Gen 9 averages 499, the same as Gens 4–8.
- Strict core shows creep of only **+2.8 BST per generation**. The honest headline:
  *one step up in Gen 4, then a plateau around 495 for five generations.*
- Gens 2–3 are the low point, partly because single-stage Pokémon from that era were
  weak (Gen 2: 411, Gen 3: 428).

## 2. Legendaries go the other way, so the gap is closing

- Fully evolved legendaries and mythicals **lose 4.9 BST per generation**
  (95% CI −9.1 to −0.6). They peak at about 627 in Gens 4 and 6 and fall to 574 in Gen 9.
- Gen 9's legendaries include several around 550: Okidogi, Munkidori, Fezandipiti and
  Ogerpon. Terapagos's default form has 450.
- In Gen 1, the gap between legendaries and the core group was **119 BST**. In Gen 9 it
  is **52**. The tiers are converging from both sides, and Ultra Beasts and Paradox
  Pokémon now fill the space between them.

## 3. The creep is in Attack

Per-stat trend in the core group, in points per generation:

| Stat | HP | Attack | Defense | Sp. Atk | Sp. Def | Speed |
|---|---|---|---|---|---|---|
| Trend | +1.0 | **+1.5** | +1.1 | +0.9 | +0.1 | +0.6 |

- Attack is the clearest grower. Sp. Def is flat, and Speed is statistically flat.
- Attack is now the most common highest stat: **30% of species in Gen 1, 37–39% in Gens 7–8**.
- Sp. Def as a highest stat has almost disappeared: **17% in Gen 2, 3% in Gen 9**.
- Stat lines are not more specialised over time. The max−min spread stays at 12–16% of BST.

## 4. Types: Dragon stays on top, while Ghost, Fairy and Bug catch up

- **Dragon** has the highest mean (546), and it doesn't change over time (−0.7 per gen).
  It has been the strongest type from the start.
- **Fastest risers:** Ghost (+13.8 per gen), Fairy (+10.1) and Bug (+9.9).
  - Bug starts as the weakest type in Gen 1 (429) and reaches about 500 in Gens 7–8.
  - Ghost jumps from 357 in Gen 3, where Shedinja drags it down, to about 520 from Gen 7.
- **Water** is the only common type with no growth (−0.4 per gen).
- **Strongest type per era** (core, groups of 3 or more): Fire (G1), Dark (G2),
  Dragon (G3, G5, G6, G9), Ground (G4), Steel (G7), Ghost (G8).
- **Most common type per era:** Poison (G1), Flying (G2), Water (G3), Normal (G4),
  Grass (G5), Fairy (G6, its debut), Grass and Water (G7), Dragon (G8), Grass (G9).
- Caveat: Gen 9's high Ice and Fighting means owe a lot to Paradox Pokémon
  (Iron Bundle, Iron Hands, Iron Valiant).

## 5. Outliers worth calling out

- **The 600 club:** one pseudo-legendary per generation, each 3-stage and BST 600:
  Dragonite, Tyranitar, Salamence, Metagross, Garchomp, Hydreigon, Goodra, Kommo-o,
  Dragapult and Baxcalibur. Archaludon (Gen 9) also has 600 but is a 2-stage line.
- **Slaking (670)** is the only non-legendary above 600. Its ability, Truant, is the
  balancing cost.
- **Far below their generation's mean:** Wishiwashi (175, its Solo form), Shedinja (236),
  Smeargle, Ditto and Delibird. Their mechanics, not their stats, are the point.

## 6. On a real timeline: post-launch additions are the new power tier

Each species is linked to the game it debuted in (`scripts/games.mjs`). Usually that's
its generation's launch titles. The exceptions are species added later by follow-up
games, DLC or events, which were cross-checked against PokeAPI's regional Pokédex lists.

- **Measured against release date**, the core group gains **+15.5 BST per decade**
  (95% CI 10.3–20.6). Strict core gains +8.7 per decade (3.7–13.9).
- **Release pace has become regular.** Gens 1–5 came 3–4 years apart. Since Black &
  White, a new generation has arrived **every 3.0–3.1 years**, like clockwork.
- **Post-launch Pokémon are a new thing, and they're strong.** Until 2017, every species
  debuted in its generation's launch games. Since Ultra Sun & Ultra Moon, **39 species**
  have arrived after launch:

  | | Species | Mean BST | Legendary / mythical | UB / Paradox |
  |---|---|---|---|---|
  | Launch games | 986 | 423 | 8% | 2% |
  | **Post-launch** | **39** | **536** | **46%** | **26%** |

  Almost three-quarters of the post-launch species are legendary, mythical, Ultra Beast
  or Paradox. The Crown Tundra (mean 564), The Indigo Disk (564) and the 2023 raid event
  (Walking Wake and Iron Leaves, both 590) added the strongest batches.
- **By console:** core mean BST is 465–485 on Game Boy, GBC and GBA, about 495 on DS and
  3DS, and **512 on Switch**. The share of legendaries in each new batch also rose: 3% of
  Gen 1's species, but 12–13% on 3DS and Switch.

**So creep is tied to how the games are released, not just to generation numbers.**
DLC and live-service updates need headline Pokémon, and headline Pokémon have high stats.

## Data caveats

- Only default forms are used. This makes Wishiwashi (Solo) and Terapagos (Normal) look weak.
- Megas, Gigantamax and regional forms are excluded for now.
- "Fully evolved" means the last stage of the species' evolution chain. Branches such as
  Eevee's are handled.
- BST measures raw power, not how competitively viable a Pokémon is. Abilities, movepools
  and typing matter at least as much.
- Release dates are hand-curated from Bulbapedia, since PokeAPI has none. "Debut date"
  is the first worldwide release, usually Japan's, and the North American date is also
  stored. Event distributions (for example Zeraora and Marshadow) count from the game
  whose data first included them.

## Story chapters this suggests

1. **"Are newer Pokémon stronger?"** Galaxy coloured by generation, then the Tower
   view: the Gen 4 step and the plateau.
2. **"Wait, what about Gen 9?"** Highlight the Paradox Pokémon. Remove them and the
   jump disappears.
3. **"Legendaries are coming down."** Legendary and core rings converging in the Tower.
4. **"Attack won."** Galaxy in UMAP role-space, shifting toward attackers by generation.
5. **"Types that got buffed."** The Type × Gen landscape: Bug and Ghost rising,
   Dragon on top throughout.
6. **"The DLC era."** Swap the generation axis for real dates (1996 → 2025), with game
   release markers along it. Post-launch species light up as a cluster high on the curve.
7. **"The 600 club and the misfits."** Pseudo-legendaries, Slaking and the outliers.
