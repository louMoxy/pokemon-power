// Fetches every Pokémon species (default form only) from PokeAPI and writes
// public/data/pokemon.json. Responses are cached in data-cache/ so reruns are fast
// and polite to the API.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const API = 'https://pokeapi.co/api/v2';
const CACHE_DIR = 'data-cache';
const OUT = 'public/data/pokemon.json';
const CONCURRENCY = 8;

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };
const STAT_KEYS = {
  hp: 'hp', attack: 'atk', defense: 'def',
  'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe',
};

await fs.mkdir(CACHE_DIR, { recursive: true });

async function get(url) {
  const file = path.join(CACHE_DIR, crypto.createHash('md5').update(url).digest('hex') + '.json');
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {}
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      await fs.writeFile(file, JSON.stringify(json));
      return json;
    }
    if (attempt >= 4) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if (++done % 100 === 0) console.log(`  ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

// Walk an evolution chain: record each species' stage (1-based) and whether it is final.
function walkChain(node, stage, info) {
  info.set(node.species.name, {
    stage,
    fullyEvolved: node.evolves_to.length === 0,
    chainLength: 0,
  });
  for (const child of node.evolves_to) walkChain(child, stage + 1, info);
}
function chainDepth(node) {
  return 1 + Math.max(0, ...node.evolves_to.map(chainDepth));
}

console.log('Listing species…');
const list = await get(`${API}/pokemon-species?limit=2000`);
console.log(`${list.results.length} species`);

console.log('Fetching species details…');
const species = await mapLimit(list.results, CONCURRENCY, (s) => get(s.url));

console.log('Fetching evolution chains…');
const chainUrls = [...new Set(species.map((s) => s.evolution_chain?.url).filter(Boolean))];
const chains = await mapLimit(chainUrls, CONCURRENCY, get);
const evo = new Map();
for (const c of chains) {
  const depth = chainDepth(c.chain);
  const info = new Map();
  walkChain(c.chain, 1, info);
  for (const [name, v] of info) evo.set(name, { ...v, chainLength: depth });
}

console.log('Fetching default-form Pokémon…');
const rows = await mapLimit(species, CONCURRENCY, async (s) => {
  const variety = s.varieties.find((v) => v.is_default);
  const p = await get(variety.pokemon.url);
  const stats = {};
  for (const st of p.stats) stats[STAT_KEYS[st.stat.name]] = st.base_stat;
  const bst = Object.values(stats).reduce((a, b) => a + b, 0);
  const e = evo.get(s.name) ?? { stage: 1, fullyEvolved: true, chainLength: 1 };
  const englishName = s.names.find((n) => n.language.name === 'en')?.name ?? s.name;
  return {
    id: s.id,
    name: englishName,
    slug: s.name,
    generation: ROMAN[s.generation.name.split('-')[1]],
    types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    stats,
    bst,
    isLegendary: s.is_legendary,
    isMythical: s.is_mythical,
    isBaby: s.is_baby,
    evoStage: e.stage,
    chainLength: e.chainLength,
    fullyEvolved: e.fullyEvolved,
    speciesColor: s.color?.name ?? null,
    heightDm: p.height,
    weightHg: p.weight,
    sprite: p.sprites.front_default,
    artwork: p.sprites.other?.['official-artwork']?.front_default ?? null,
  };
});

rows.sort((a, b) => a.id - b.id);
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(rows));
console.log(`Wrote ${rows.length} Pokémon to ${OUT}`);
