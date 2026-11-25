// Adds derived fields to public/data/pokemon.json and builds the sprite atlas.
//   pca:   [x,y,z]  PCA of z-scored base stats (PC1 ~ overall power)
//   umap:  [x,y,z]  UMAP of stat proportions (stat / BST) -> clusters by role, not power
//   umap2: [x,y]    the same in 2D, for the flat chart views
//   atlas: index of the sprite cell in public/data/atlas.png
//   color: dominant sprite colour as "#rrggbb"
// Also writes public/data/meta.json (atlas layout, PCA loadings, explained variance).
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { UMAP } from 'umap-js';
import { GAMES, DEBUT_OVERRIDES } from './games.mjs';

const DATA = 'public/data/pokemon.json';
// The site loads a lossless WebP (~4x smaller than PNG, identical pixels, which the
// voxel models read back). The PNG is kept locally for reference only.
const ATLAS_PNG = 'data-cache/atlas.png';
const ATLAS = 'public/data/atlas.webp';
const WEB_DATA = 'public/data/pokemon.web.json';
const META = 'public/data/meta.json';
const SPRITE_CACHE = 'data-cache/sprites';
const CELL = 96; // PokeAPI front_default sprites are 96x96
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const data = JSON.parse(await fs.readFile(DATA, 'utf8'));

// ---------- Seeded PRNG so layouts are reproducible between runs
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- PCA (covariance of z-scores + Jacobi eigen-decomposition)
function jacobiEigen(A) {
  const n = A.length;
  const a = A.map((r) => [...r]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return Array.from({ length: n }, (_, i) => ({ value: a[i][i], vector: v.map((r) => r[i]) }))
    .sort((x, y) => y.value - x.value);
}

const X = data.map((p) => STATS.map((s) => p.stats[s]));
const mu = STATS.map((_, j) => X.reduce((a, r) => a + r[j], 0) / X.length);
const sd = STATS.map((_, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - mu[j]) ** 2, 0) / (X.length - 1)));
const Z = X.map((r) => r.map((x, j) => (x - mu[j]) / sd[j]));
const cov = STATS.map((_, i) => STATS.map((_, j) => Z.reduce((a, r) => a + r[i] * r[j], 0) / (Z.length - 1)));
const eig = jacobiEigen(cov);
const totalVar = eig.reduce((a, e) => a + e.value, 0);
const components = eig.slice(0, 3).map((e) => {
  // Flip sign so the largest-magnitude loading is positive (stable, readable axes)
  const big = e.vector.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
  return big < 0 ? e.vector.map((x) => -x) : e.vector;
});
const pca = Z.map((r) => components.map((c) => r.reduce((a, x, j) => a + x * c[j], 0)));

// ---------- UMAP on stat proportions (shape of the stat spread, independent of BST)
const P = X.map((r) => { const t = r.reduce((a, b) => a + b, 0); return r.map((x) => x / t); });
console.log('Running UMAP…');
const umap = new UMAP({ nComponents: 3, nNeighbors: 20, minDist: 0.15, random: mulberry32(151) });
const U = umap.fit(P);
// 2D version for the flat chart views (a 3D layout squashed flat loses its structure)
const umap2 = new UMAP({ nComponents: 2, nNeighbors: 20, minDist: 0.2, random: mulberry32(152) });
const U2 = umap2.fit(P);

// Centre each layout on the origin and scale it so its largest extent is +-1
function normalise(points) {
  const dims = points[0].length;
  const mid = Array.from({ length: dims }, (_, d) => {
    const v = points.map((p) => p[d]);
    return (Math.min(...v) + Math.max(...v)) / 2;
  });
  const ext = Math.max(...points.flatMap((p) => p.map((x, d) => Math.abs(x - mid[d]))));
  return points.map((p) => p.map((x, d) => +((x - mid[d]) / ext).toFixed(4)));
}
const pcaN = normalise(pca);
const umapN = normalise(U);
const umap2N = normalise(U2);

// ---------- Sprites: download, trim, centre into atlas cells, dominant colour
await fs.mkdir(SPRITE_CACHE, { recursive: true });
async function loadSprite(p) {
  const file = path.join(SPRITE_CACHE, `${p.id}.png`);
  let buf;
  try { buf = await fs.readFile(file); } catch {
    const res = await fetch(p.sprite);
    if (!res.ok) throw new Error(`${res.status} ${p.sprite}`);
    buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(file, buf);
  }
  return PNG.sync.read(buf);
}

function dominantColour(png) {
  // Bucket opaque pixels at 4 bits/channel, skipping outlines (very dark) and highlights
  // (very light); return the average colour of the most common bucket.
  const buckets = new Map();
  const { data: d } = png;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 50 || min > 235) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  let best = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best) return '#888888';
  const hex = (x) => Math.round(x / best.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

const COLS = 42; // 42 x 25 cells of 96px = 4032 x 2400, under the common 4096 texture limit
const ROWS = Math.ceil(data.length / COLS);
const atlas = new PNG({ width: COLS * CELL, height: ROWS * CELL });
atlas.data.fill(0);

console.log('Building sprite atlas…');
const colours = [];
const bounds = [];
for (let i = 0; i < data.length; i++) {
  const png = await loadSprite(data[i]);
  // Some sprites store transparent pixels as white; zero them so texture filtering
  // never bleeds a white fringe around the edges.
  for (let k = 0; k < png.data.length; k += 4) if (png.data[k + 3] === 0) png.data.fill(0, k, k + 3);
  colours.push(dominantColour(png));
  // Trim to the opaque bounding box
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 0) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  // Centre horizontally, sit on the cell's bottom edge (feet on the ground)
  const ox = (i % COLS) * CELL + Math.floor((CELL - w) / 2);
  const oy = Math.floor(i / COLS) * CELL + (CELL - h);
  PNG.bitblt(png, atlas, x0, y0, w, h, ox, oy);
  bounds.push([w, h]);
  if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${data.length}`);
}
const atlasPng = PNG.sync.write(atlas);
await fs.writeFile(ATLAS_PNG, atlasPng);
// exact: keep the zeroed RGB under transparent pixels (no white fringes when filtered)
await sharp(atlasPng).webp({ lossless: true, effort: 6, exact: true }).toFile(ATLAS);

// ---------- Debut game and release date
const gameById = Object.fromEntries(GAMES.map((g) => [g.id, g]));
const baseGame = Object.fromEntries(GAMES.filter((g) => g.kind === 'base').map((g) => [g.gen, g]));
const decimalYear = (iso) => {
  const d = new Date(iso + 'T00:00:00Z'), y = d.getUTCFullYear();
  return +(y + (d - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1))).toFixed(3);
};
const releases = data.map((p) => {
  const g = DEBUT_OVERRIDES[p.id] ? gameById[DEBUT_OVERRIDES[p.id]] : baseGame[p.generation];
  if (!g || g.gen !== p.generation) throw new Error(`Bad debut game for #${p.id} ${p.name}`);
  return { debutGame: g.id, debutDate: g.jp, debutDateNA: g.na, debutYear: decimalYear(g.jp), platform: g.platform };
});
await fs.writeFile('public/data/games.json', JSON.stringify(GAMES.map((g) => ({
  ...g, year: decimalYear(g.jp), speciesDebuted: releases.filter((r) => r.debutGame === g.id).length,
})), null, 1));

data.forEach((p, i) => {
  Object.assign(p, releases[i]);
  p.pca = pcaN[i];
  p.umap = umapN[i];
  p.umap2 = umap2N[i];
  p.atlas = i;
  p.spriteSize = bounds[i]; // trimmed sprite size in px, for scaling quads to real size
  p.color = colours[i];
});
await fs.writeFile(DATA, JSON.stringify(data));

// Slim copy with only the fields the site reads (pokemon.json stays as the full,
// downloadable dataset)
const WEB_FIELDS = ['id', 'name', 'generation', 'types', 'stats', 'bst', 'isLegendary', 'isMythical', 'isBaby',
  'specialClass', 'evoStage', 'chainLength', 'fullyEvolved', 'debutGame', 'debutDate', 'platform',
  'umap2', 'atlas', 'spriteSize'];
await fs.writeFile(WEB_DATA, JSON.stringify(data.map((p) => ({
  ...Object.fromEntries(WEB_FIELDS.map((k) => [k, p[k]])),
  pca: p.pca.slice(0, 2), // the Power map only uses PC1 and PC2
}))));

const meta = {
  atlas: { file: 'atlas.webp', cell: CELL, cols: COLS, rows: ROWS, width: COLS * CELL, height: ROWS * CELL },
  stats: STATS,
  pca: {
    explainedVariance: eig.slice(0, 3).map((e) => +(e.value / totalVar).toFixed(4)),
    loadings: components.map((c) => Object.fromEntries(STATS.map((s, j) => [s, +c[j].toFixed(3)]))),
  },
};
await fs.writeFile(META, JSON.stringify(meta, null, 2));

console.log('\nPCA explained variance:', meta.pca.explainedVariance.map((v) => (v * 100).toFixed(1) + '%').join(', '));
meta.pca.loadings.forEach((l, i) => console.log(`PC${i + 1}`, STATS.map((s) => `${s} ${l[s].toFixed(2).padStart(5)}`).join('  ')));
console.log(`Atlas ${meta.atlas.width}x${meta.atlas.height}, ${(await fs.stat(ATLAS)).size >> 10} KB`);
for (const n of ['Charizard', 'Pikachu', 'Blissey', 'Shuckle', 'Bulbasaur', 'Gengar'])
  { const p = data.find((x) => x.name === n); console.log(`  ${n.padEnd(10)} colour ${p.color}  pca ${p.pca}  umap ${p.umap}`); }
