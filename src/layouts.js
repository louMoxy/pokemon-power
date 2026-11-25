// Layouts. Each build(pokemon, ctx) returns the layout for the Pokémon that pass the
// filters (ctx.visible: 0/1 mask, or null for all). Hidden Pokémon get no slot, so
// groups re-pack around what is left and empty groups disappear. Returns:
//   positions: Float32Array xyz per Pokémon (a flat chart: z only orders overlaps)
//   groups?:   [{ label, sub, color, x, y, members, radius }] for labels / average lines
//   frame?:    { center: [x,y,z], size: [w,h,d] } for the camera (galaxies fit to bounds)
//   axis?:     true to draw BST reference lines
// "Galaxy" layouts are 2D scatter plots; "Group by" layouts give every category a
// column where height = BST, laid out as a strip plot: each BST band is a row of
// sprites, so a column is wide wherever many Pokémon share that power level.
import { TYPE_COLORS } from './data.js';

const SPREAD = 12;
export const bstToY = (bst) => (bst - 450) / 22;
const BIN = 12; // BST per strip row
const STEP = 0.55; // horizontal spacing of sprites in a row
const MAX_HALF = 4.2; // rows wider than this wrap onto a slightly raised second row
const GAP = 1.6; // space between columns
const MIN_SLOT = 5.2; // narrowest pillar slot, so labels don't collide
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// Draw order for overlapping sprites: stronger Pokémon sit in front. The tiny per-slot
// step stops sprites at the same BST from z-fighting.
const zOf = (p, k = 0) => ((p.bst - 175) / 545) * 0.6 + (k % 97) * 0.0005;

const TYPE_ORDER = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Category definitions: key(p) -> category id, plus ordered categories with labels
export const CATEGORIES = {
  generation: {
    label: 'Generation',
    hint: 'One pillar per generation. Height = base stat total; gold line = average.',
    key: (p) => p.generation,
    order: (ctx) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => {
      const game = ctx.games.find((x) => x.gen === g && x.kind === 'base');
      return { id: g, label: `Gen ${g}`, short: `G${g}`, sub: `${game.region} · ${game.year | 0}` };
    }),
  },
  type: {
    label: 'Type',
    hint: 'Grouped by primary type. Height = base stat total; gold line = average.',
    key: (p) => p.types[0],
    order: () => TYPE_ORDER.map((t) => ({ id: t, label: cap(t), color: TYPE_COLORS[t] })),
  },
  evolution: {
    label: 'Evolution',
    hint: 'Where each Pokémon sits in its evolution line. Height = base stat total.',
    key: (p) => (p.isBaby ? 'baby'
      : p.chainLength === 1 ? 'single'
      : !p.fullyEvolved ? (p.evoStage === 1 ? 'first' : 'middle')
      : 'final'),
    order: () => [
      { id: 'baby', label: 'Baby' },
      { id: 'first', label: 'First stage' },
      { id: 'middle', label: 'Middle stage' },
      { id: 'final', label: 'Final stage' },
      { id: 'single', label: 'Doesn’t evolve' },
    ],
  },
  status: {
    label: 'Rarity',
    hint: 'Regular Pokémon versus the special classes. Height = base stat total.',
    key: (p) => (p.isMythical ? 'mythical' : p.isLegendary ? 'legendary'
      : p.specialClass === 'paradox' ? 'paradox' : p.specialClass === 'ultra-beast' ? 'ultra-beast'
      : p.chainLength === 3 && p.fullyEvolved && p.bst === 600 ? 'pseudo' : 'regular'),
    order: () => [
      { id: 'regular', label: 'Regular' },
      { id: 'pseudo', label: 'Pseudo-legendary' },
      { id: 'ultra-beast', label: 'Ultra Beast' },
      { id: 'paradox', label: 'Paradox' },
      { id: 'legendary', label: 'Legendary' },
      { id: 'mythical', label: 'Mythical' },
    ],
  },
  console: {
    label: 'Console',
    hint: 'Grouped by the console each Pokémon debuted on. Height = base stat total.',
    key: (p) => p.platform,
    order: (ctx) => [
      ['Game Boy', 'Game Boy'], ['Game Boy Color', 'GB Color'], ['Game Boy Advance', 'GB Advance'],
      ['Nintendo DS', 'DS'], ['Nintendo 3DS', '3DS'], ['Nintendo Switch', 'Switch'],
    ].map(([id, label]) => {
      const years = ctx.games.filter((g) => g.platform === id && g.speciesDebuted).map((g) => g.year | 0);
      const span = Math.min(...years) === Math.max(...years) ? `${Math.min(...years)}` : `${Math.min(...years)}–${Math.max(...years)}`;
      return { id, label, sub: span };
    }),
  },
};

export const LAYOUTS = {
  role: {
    section: 'Galaxy',
    label: 'Role map',
    hint: 'Clustered by the shape of each stat spread (UMAP). Size = base stat total.',
    build: (pokemon) => ({ positions: fromField(pokemon, (p) => p.umap2) }),
  },
  power: {
    section: 'Galaxy',
    label: 'Power map',
    hint: 'PCA of the six stats. Left → right: overall power. Up: fast & special, down: bulky.',
    build: (pokemon) => ({ positions: fromField(pokemon, (p) => [p.pca[0], p.pca[1]]) }),
  },
  ...Object.fromEntries(Object.entries(CATEGORIES).map(([id, cat]) => [id, {
    section: 'Group by',
    label: cat.label,
    hint: cat.hint,
    build: (pokemon, ctx) => (ctx.portrait ? sideways(pillars(pokemon, cat, ctx)) : pillars(pokemon, cat, ctx)),
  }])),
  typeGen: {
    section: 'Group by',
    label: 'Type × Gen',
    hint: 'Each cell is one type in one generation. Tile colour = average BST (dark → gold).',
    // portrait screens get the transposed matrix (types down the side)
    build: (pokemon, ctx) => (ctx.portrait
      ? grid(pokemon, CATEGORIES.generation, CATEGORIES.type, ctx)
      : grid(pokemon, CATEGORIES.type, CATEGORIES.generation, ctx)),
  },
};

function fromField(pokemon, xy) {
  const out = new Float32Array(pokemon.length * 3);
  pokemon.forEach((p, i) => { const [x, y] = xy(p); out.set([x * SPREAD, y * SPREAD, zOf(p, i)], i * 3); });
  return out;
}

// Lay out one column's members around x = 0 as a strip plot: one row per BST band,
// centred; very full rows wrap onto a slightly raised, half-step-shifted second row.
// Returns local offsets per member index plus the column's half width.
function pillar(members, pokemon) {
  const bins = new Map();
  for (const i of members) {
    const b = Math.round(pokemon[i].bst / BIN);
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(i);
  }
  const perRow = Math.floor((2 * MAX_HALF) / STEP) + 1;
  const local = new Map();
  let radius = 0.6;
  for (const list of bins.values()) {
    list.sort((a, c) => pokemon[a].id - pokemon[c].id);
    list.forEach((i, k) => {
      const row = Math.floor(k / perRow), slot = k % perRow;
      const inRow = Math.min(perRow, list.length - row * perRow);
      const x = (slot - (inRow - 1) / 2) * STEP + (row % 2) * STEP * 0.5;
      local.set(i, [x, bstToY(pokemon[i].bst) + row * 0.22, zOf(pokemon[i], k)]);
      radius = Math.max(radius, Math.abs(x) + 0.5);
    });
  }
  return { local, radius };
}

function groupMembers(pokemon, cat, ctx) {
  const cats = cat.order(ctx);
  const byId = new Map(cats.map((c) => [c.id, []]));
  pokemon.forEach((p, i) => { if (isVisible(ctx, i)) byId.get(cat.key(p))?.push(i); });
  return cats.map((c) => ({ ...c, members: byId.get(c.id) })).filter((c) => c.members.length);
}

const isVisible = (ctx, i) => !ctx.visible || ctx.visible[i] > 0;
const meanBst = (members, pokemon) => members.reduce((s, i) => s + pokemon[i].bst, 0) / members.length;

function pillars(pokemon, cat, ctx) {
  const positions = new Float32Array(pokemon.length * 3);
  const groups = groupMembers(pokemon, cat, ctx).map((g) => ({ ...g, ...pillar(g.members, pokemon) }));
  if (!groups.length) {
    return { positions, groups: [], frame: { center: [0, bstToY(450), 0], size: [20, 20, 0] } };
  }
  // place pillars left to right, each as wide as it needs but never narrower than its
  // label; with many groups the labels alternate between two rows instead
  const many = groups.length > 10;
  const minHalf = many ? 0 : MIN_SLOT / 2;
  let x = 0;
  for (const g of groups) {
    const half = Math.max(g.radius, minHalf);
    g.x = x + half; x += half * 2 + GAP;
  }
  const width = x - GAP;
  groups.forEach((g, k) => { g.stagger = many && k % 2 === 1; g.compact = many; });
  for (const g of groups) {
    g.x -= width / 2;
    g.z = 0;
    for (const [i, [lx, ly, lz]] of g.local) positions.set([g.x + lx, ly, lz], i * 3);
    g.count = g.members.length;
    g.mean = meanBst(g.members, pokemon);
  }
  const maxR = Math.max(...groups.map((g) => g.radius));
  return {
    positions, groups, axis: true,
    frame: { center: [0, bstToY(450), 0], size: [width, bstToY(720) - bstToY(175), maxR * 2] },
  };
}

// Portrait screens: turn a pillar layout on its side, so groups stack top to bottom and
// BST runs left to right (a ridgeline plot). (x, y, z) -> (y, -x, z).
function sideways(layout) {
  const p = layout.positions;
  for (let k = 0; k < p.length; k += 3) { const x = p[k]; p[k] = p[k + 1]; p[k + 1] = -x; }
  for (const g of layout.groups) {
    g.y = -g.x;
    g.x = bstToY(175) - 1.2;
    g.side = true;
    g.stagger = false;
    g.compact = true;
    g.sub = null; // keep sideways labels to one short line
  }
  const [w, h, d] = layout.frame.size;
  const c = layout.frame.center;
  return {
    ...layout,
    horizontal: true,
    frame: { center: [c[1] - 4, c[0], c[2]], size: [h + 12, w + 8, d] },
  };
}

// Matrix: one cell per (column, row) category pair. Sprites pack into a disc inside
// their cell, strongest in the middle. Each cell gets a heat tile coloured by its
// average BST.
function grid(pokemon, colCat, rowCat, ctx) {
  const positions = new Float32Array(pokemon.length * 3);
  const cols = colCat.order(ctx), rows = rowCat.order(ctx);
  const cells = new Map();
  pokemon.forEach((p, i) => {
    if (!isVisible(ctx, i)) return;
    const k = `${colCat.key(p)}|${rowCat.key(p)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  });
  const CELL_DISC = 0.42;
  const maxN = Math.max(1, ...[...cells.values()].map((m) => m.length));
  const step = 2 * (CELL_DISC * Math.sqrt(maxN) + 0.45) + 0.35;
  const groups = [];
  cols.forEach((c, ci) => rows.forEach((r, ri) => {
    const members = cells.get(`${c.id}|${r.id}`);
    const x = (ci - (cols.length - 1) / 2) * step;
    const y = ((rows.length - 1) / 2 - ri) * step;
    if (!members) { groups.push({ x, y, z: 0, tile: step, members: [] }); return; }
    // strongest at the centre of the disc
    [...members].sort((a, b) => pokemon[b].bst - pokemon[a].bst).forEach((i, k) => {
      const rad = CELL_DISC * Math.sqrt(k);
      const a = k * GOLDEN;
      positions.set([x + Math.cos(a) * rad, y + Math.sin(a) * rad, zOf(pokemon[i], k)], i * 3);
    });
    groups.push({ x, y, z: 0, tile: step, members });
  }));
  const w = cols.length * step, h = rows.length * step;
  const top = h / 2 + step * 0.35, left = -w / 2 - step * 0.3;
  cols.forEach((c, ci) => groups.push({
    label: c.short ?? c.label, color: c.color, x: (ci - (cols.length - 1) / 2) * step, y: top, z: 0, labelOnly: true, above: true,
    raise: cols.length > 10 && ci % 2 === 1, // alternate heights so wide chips don't collide
  }));
  rows.forEach((r, ri) => groups.push({
    label: r.label, x: left, // (no sub-line: row labels sit in a narrow margin)
    y: ((rows.length - 1) / 2 - ri) * step, z: 0, labelOnly: true, side: true,
  }));
  return {
    positions, groups, heat: true,
    frame: { center: [0, step * 0.4, 0], size: [w + step * 3, h + step * 2.2, 0] },
  };
}
