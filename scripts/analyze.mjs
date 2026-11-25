// Power-creep analysis. Reads public/data/pokemon.json, prints a report and writes
// public/data/findings.json for the site's story chapters.
//
// Main comparison group ("core"): fully evolved, not legendary or mythical. Comparing
// raw averages is misleading because generations differ in how many babies / first
// stages / legendaries they add.
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('public/data/pokemon.json', 'utf8'));
const GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_NAMES = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
const MIN_N = 3; // minimum sample for a type x gen cell to be reported

const isSpecial = (p) => p.isLegendary || p.isMythical;
// Main group keeps Ultra Beasts / Paradox Pokémon (the games treat them as regular species),
// but "strict" drops them to show how much of the creep they account for.
const core = data.filter((p) => p.fullyEvolved && !isSpecial(p));
const strictCore = core.filter((p) => !p.specialClass);
// Legendary curve: fully evolved only, so Cosmog/Kubfu/Type: Null don't drag it down
const special = data.filter((p) => isSpecial(p) && p.fullyEvolved);

// ---------- helpers
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
function quantile(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const round = (x, d = 1) => (x == null ? null : +x.toFixed(d));
function olsSlope(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return num / den;
}
function rank(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
  return a / Math.sqrt(b * c);
}
const spearman = (xs, ys) => pearson(rank(xs), rank(ys));
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Bootstrap 95% CI for the OLS slope of y on generation
function slopeCI(rows, y, iters = 2000) {
  const rand = mulberry32(42);
  const xs = rows.map((p) => p.generation), ys = rows.map(y);
  const est = olsSlope(xs, ys);
  const boots = [];
  for (let k = 0; k < iters; k++) {
    const bx = [], by = [];
    for (let i = 0; i < xs.length; i++) { const j = Math.floor(rand() * xs.length); bx.push(xs[j]); by.push(ys[j]); }
    boots.push(olsSlope(bx, by));
  }
  return { slope: round(est, 2), ci95: [round(quantile(boots, 0.025), 2), round(quantile(boots, 0.975), 2)] };
}
const byGen = (rows) => Object.fromEntries(GENS.map((g) => [g, rows.filter((p) => p.generation === g)]));
const topStat = (p) => STATS.reduce((best, s) => (p.stats[s] > p.stats[best] ? s : best), STATS[0]);
const brief = (p) => ({ id: p.id, name: p.name, generation: p.generation, types: p.types, bst: p.bst });

// ---------- 1. Power creep by generation
const coreByGen = byGen(core);
const allByGen = byGen(data);
const specialByGen = byGen(special);
const genSummary = GENS.map((g) => {
  const c = coreByGen[g].map((p) => p.bst);
  return {
    generation: g,
    speciesAdded: allByGen[g].length,
    core: {
      n: c.length, mean: round(mean(c)), median: quantile(c, 0.5),
      p10: quantile(c, 0.1), p25: quantile(c, 0.25), p75: quantile(c, 0.75), p90: quantile(c, 0.9),
      max: Math.max(...c),
      stats: Object.fromEntries(STATS.map((s) => [s, round(mean(coreByGen[g].map((p) => p.stats[s])))])),
    },
    allSpecies: { mean: round(mean(allByGen[g].map((p) => p.bst))) },
    strictCore: (() => { const r = strictCore.filter((p) => p.generation === g); return { n: r.length, mean: round(mean(r.map((p) => p.bst))) }; })(),
    specialClass: (() => { const r = coreByGen[g].filter((p) => p.specialClass); return { n: r.length, mean: round(mean(r.map((p) => p.bst))) }; })(),
    legendary: { n: specialByGen[g].length, mean: round(mean(specialByGen[g].map((p) => p.bst))) },
  };
});
const creep = {
  coreTrend: { ...slopeCI(core, (p) => p.bst), spearman: round(spearman(core.map((p) => p.generation), core.map((p) => p.bst)), 3) },
  allTrend: slopeCI(data, (p) => p.bst),
  legendaryTrend: slopeCI(special, (p) => p.bst),
  gen1to8Trend: slopeCI(core.filter((p) => p.generation <= 8), (p) => p.bst),
  strictCoreTrend: slopeCI(strictCore, (p) => p.bst),
  strictGen1to8Trend: slopeCI(strictCore.filter((p) => p.generation <= 8), (p) => p.bst),
};

// ---------- 2. Which stats crept? (per-stat slope, core group)
const statCreep = Object.fromEntries(STATS.map((s) => [s, slopeCI(core, (p) => p.stats[s])]));

// ---------- 3. Where does the creep come from? Single-stage vs evolution lines
const lineGroups = {
  singleStage: (p) => p.chainLength === 1,
  twoStage: (p) => p.chainLength === 2,
  threeStage: (p) => p.chainLength === 3,
};
const byLine = Object.fromEntries(Object.entries(lineGroups).map(([k, f]) => [
  k, GENS.map((g) => { const r = coreByGen[g].filter(f); return { generation: g, n: r.length, mean: round(mean(r.map((p) => p.bst))) }; }),
]));

// ---------- 4. Types
const TYPES = [...new Set(data.flatMap((p) => p.types))].sort();
const typeGen = TYPES.map((t) => {
  const pool = core.filter((p) => p.types.includes(t));
  return {
    type: t,
    n: pool.length,
    mean: round(mean(pool.map((p) => p.bst))),
    trend: slopeCI(pool, (p) => p.bst),
    byGen: GENS.map((g) => {
      const r = pool.filter((p) => p.generation === g);
      return { generation: g, n: r.length, mean: r.length >= MIN_N ? round(mean(r.map((p) => p.bst))) : null };
    }),
    // share of each generation's new species that have this type (any slot) -> "dominance"
    share: GENS.map((g) => round(allByGen[g].filter((p) => p.types.includes(t)).length / allByGen[g].length, 3)),
  };
});
const typeLeaders = GENS.map((g) => {
  const strongest = typeGen
    .map((t) => ({ type: t.type, ...t.byGen[g - 1] }))
    .filter((c) => c.mean != null)
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 3);
  const mostCommon = typeGen
    .map((t) => ({ type: t.type, share: t.share[g - 1] }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);
  return { generation: g, strongest, mostCommon };
});

// ---------- 5. Roles: which stat is each Pokémon's highest?
const roleShare = GENS.map((g) => {
  const rows = coreByGen[g];
  return { generation: g, ...Object.fromEntries(STATS.map((s) => [s, round(rows.filter((p) => topStat(p) === s).length / rows.length, 3)])) };
});
// Min-max stat spread (how specialised the stat line is), as a share of BST
const specialisation = GENS.map((g) => ({
  generation: g,
  spread: round(mean(coreByGen[g].map((p) => {
    const v = STATS.map((s) => p.stats[s]); return (Math.max(...v) - Math.min(...v)) / p.bst;
  })), 3),
}));

// ---------- 6. Outliers & the stat curve
const strongestCore = [...core].sort((a, b) => b.bst - a.bst).slice(0, 12).map(brief);
const weakestCore = [...core].sort((a, b) => a.bst - b.bst).slice(0, 8).map(brief);
// Pseudo-legendaries: three-stage, non-legendary, final BST of exactly 600
const pseudos = core.filter((p) => p.chainLength === 3 && p.bst === 600).map(brief);
// Non-legendaries that out-stat the weakest legendaries
const weakestLegendaries = [...special].sort((a, b) => a.bst - b.bst).slice(0, 8).map(brief);
const coreAbove600 = core.filter((p) => p.bst > 600).map(brief);
// Biggest jump: residual vs. its generation's core mean
const residuals = core
  .map((p) => ({ ...brief(p), vsGen: round(p.bst - genSummary[p.generation - 1].core.mean) }))
  .sort((a, b) => b.vsGen - a.vsGen);

// ---------- 7. Release timeline: real dates, platforms, launch vs post-launch additions
const games = JSON.parse(fs.readFileSync('public/data/games.json', 'utf8'));
const gameById = Object.fromEntries(games.map((g) => [g.id, g]));
function slopeVsYear(rows) {
  const xs = rows.map((p) => p.debutYear), ys = rows.map((p) => p.bst);
  const rand = mulberry32(7), boots = [];
  for (let k = 0; k < 2000; k++) {
    const bx = [], by = [];
    for (let i = 0; i < xs.length; i++) { const j = Math.floor(rand() * xs.length); bx.push(xs[j]); by.push(ys[j]); }
    boots.push(olsSlope(bx, by));
  }
  const s = olsSlope(xs, ys);
  return { perYear: round(s, 2), perDecade: round(s * 10, 1), ci95PerDecade: [round(quantile(boots, 0.025) * 10, 1), round(quantile(boots, 0.975) * 10, 1)] };
}
const isLaunch = (p) => gameById[p.debutGame].kind === 'base';
const cohort = (rows) => ({
  n: rows.length,
  meanAll: round(mean(rows.map((p) => p.bst))),
  core: (() => { const r = rows.filter((p) => p.fullyEvolved && !isSpecial(p)); return { n: r.length, mean: round(mean(r.map((p) => p.bst))) }; })(),
  legendaryShare: round(rows.filter(isSpecial).length / rows.length, 3),
  ubOrParadoxShare: round(rows.filter((p) => p.specialClass).length / rows.length, 3),
});
const baseGames = games.filter((g) => g.kind === 'base');
const timeline = {
  coreTrendByYear: slopeVsYear(core),
  strictCoreTrendByYear: slopeVsYear(strictCore),
  generationGaps: baseGames.slice(1).map((g, i) => ({
    from: baseGames[i].name, to: g.name, years: round(g.year - baseGames[i].year, 2),
  })),
  newSpeciesPerYear: GENS.map((gen) => {
    const start = baseGames[gen - 1].year;
    const end = gen < 9 ? baseGames[gen].year : games.filter((g) => g.gen === 9).at(-1).year;
    return { generation: gen, species: allByGen[gen].length, years: round(end - start, 2), perYear: round(allByGen[gen].length / (end - start), 1) };
  }),
  byPlatform: [...new Set(data.map((p) => p.platform))].map((platform) => {
    const rows = data.filter((p) => p.platform === platform);
    return { platform, years: `${Math.floor(Math.min(...rows.map((p) => p.debutYear)))}–${Math.floor(Math.max(...rows.map((p) => p.debutYear)))}`, ...cohort(rows) };
  }),
  launchVsPostLaunch: { launch: cohort(data.filter(isLaunch)), postLaunch: cohort(data.filter((p) => !isLaunch(p))) },
  postLaunchGames: games.filter((g) => g.kind !== 'base' && g.speciesDebuted > 0).map((g) => {
    const rows = data.filter((p) => p.debutGame === g.id);
    return { game: g.name, kind: g.kind, date: g.jp, ...cohort(rows), species: rows.map((p) => `${p.name} (${p.bst})`) };
  }),
};

const findings = {
  generatedFrom: { species: data.length, core: core.length, legendaryOrMythical: special.length },
  definitions: {
    core: 'Fully evolved, not legendary or mythical, default form only',
    bst: 'Base stat total: HP + Atk + Def + SpA + SpD + Spe',
  },
  genSummary,
  creep,
  statCreep,
  byLine,
  typeGen,
  typeLeaders,
  roleShare,
  specialisation,
  timeline,
  outliers: {
    strongestCore, weakestCore, pseudos, weakestLegendaries, coreAbove600,
    aboveGenMean: residuals.slice(0, 10), belowGenMean: residuals.slice(-6).reverse(),
  },
};
fs.writeFileSync('public/data/findings.json', JSON.stringify(findings, null, 1));

// ---------- Report
const pad = (x, n = 5) => String(x ?? '-').padStart(n);
console.log(`Core group: ${core.length} of ${data.length} species  |  legendary/mythical: ${special.length}\n`);
console.log('GEN  added  core n   mean  median   p10   p90   max |  all-mean  leg n  leg mean');
for (const s of genSummary)
  console.log(`${pad(s.generation, 3)} ${pad(s.speciesAdded, 6)} ${pad(s.core.n, 7)} ${pad(s.core.mean, 6)} ${pad(s.core.median, 7)} ${pad(s.core.p10)} ${pad(s.core.p90)} ${pad(s.core.max)} | ${pad(s.allSpecies.mean, 9)} ${pad(s.legendary.n, 6)} ${pad(s.legendary.mean, 9)}`);
const fmt = (t) => `${t.slope > 0 ? '+' : ''}${t.slope} BST/gen  (95% CI ${t.ci95[0]} to ${t.ci95[1]})`;
console.log(`\nTrend, core:          ${fmt(creep.coreTrend)}   Spearman ${creep.coreTrend.spearman}`);
console.log(`Trend, core gens 1-8: ${fmt(creep.gen1to8Trend)}`);
console.log(`Trend, strict core:   ${fmt(creep.strictCoreTrend)}   (no Ultra Beasts / Paradox)`);
console.log(`Trend, strict 1-8:    ${fmt(creep.strictGen1to8Trend)}`);
console.log(`Trend, all species:   ${fmt(creep.allTrend)}`);
console.log('\nGEN  strict-core mean (n)  |  UB/Paradox mean (n)');
for (const s of genSummary) console.log(`${pad(s.generation, 3)}  ${pad(s.strictCore.mean, 8)} (${pad(s.strictCore.n, 2)})        |  ${pad(s.specialClass.mean, 8)} (${pad(s.specialClass.n, 2)})`);
console.log(`Trend, legendary:     ${fmt(creep.legendaryTrend)}`);

console.log('\nPer-stat trend (core):');
for (const s of STATS) console.log(`  ${STAT_NAMES[s].padEnd(8)} ${fmt(statCreep[s])}`);

console.log('\nCore mean BST by evolution-line length:');
console.log('GEN ' + Object.keys(byLine).map((k) => k.padStart(18)).join(''));
for (const g of GENS) console.log(pad(g, 3) + ' ' + Object.values(byLine).map((rows) => `${pad(rows[g - 1].mean, 8)} (n=${pad(rows[g - 1].n, 2)})`.padStart(18)).join(''));

console.log('\nType trends (core, any slot), sorted by slope:');
for (const t of [...typeGen].sort((a, b) => b.trend.slope - a.trend.slope))
  console.log(`  ${t.type.padEnd(9)} n=${pad(t.n, 3)} mean ${pad(t.mean, 5)}  ${fmt(t.trend)}`);

console.log('\nPer generation: strongest types (core, n>=3) | most common new types');
for (const l of typeLeaders)
  console.log(`  Gen ${l.generation}: ${l.strongest.map((s) => `${s.type} ${s.mean}`).join(', ').padEnd(42)} | ${l.mostCommon.map((s) => `${s.type} ${(s.share * 100).toFixed(0)}%`).join(', ')}`);

console.log('\nHighest stat share (core) and stat spread:');
console.log('GEN ' + STATS.map((s) => s.padStart(6)).join('') + '  spread');
for (let i = 0; i < 9; i++)
  console.log(pad(GENS[i], 3) + ' ' + STATS.map((s) => pad((roleShare[i][s] * 100).toFixed(0) + '%', 6)).join('') + pad(specialisation[i].spread, 8));

console.log('\nStrongest core:', strongestCore.map((p) => `${p.name} (G${p.generation}, ${p.bst})`).join(', '));
console.log('Core above 600:', coreAbove600.map((p) => `${p.name} (${p.bst})`).join(', ') || 'none');
console.log('Pseudo-legendaries:', pseudos.map((p) => `${p.name} G${p.generation}`).join(', '));
console.log('Weakest legendaries:', weakestLegendaries.map((p) => `${p.name} (G${p.generation}, ${p.bst})`).join(', '));
console.log('Most above their gen mean:', residuals.slice(0, 6).map((p) => `${p.name} (+${p.vsGen})`).join(', '));
console.log('Most below their gen mean:', residuals.slice(-5).map((p) => `${p.name} (${p.vsGen})`).join(', '));

// ---------- Timeline report
const tl = timeline;
const dec = (t) => `${t.perDecade > 0 ? '+' : ''}${t.perDecade} BST/decade (95% CI ${t.ci95PerDecade[0]} to ${t.ci95PerDecade[1]})`;
console.log(`\nTrend vs release date, core:        ${dec(tl.coreTrendByYear)}`);
console.log(`Trend vs release date, strict core: ${dec(tl.strictCoreTrendByYear)}`);
console.log('\nYears between generations:', tl.generationGaps.map((g) => g.years).join(', '));
console.log('New species per year of each gen:', tl.newSpeciesPerYear.map((g) => `G${g.generation} ${g.perYear}`).join(', '));
console.log('\nPlatform           years       n   all-mean  core-mean (n)  legendary%  UB/Paradox%');
for (const p of tl.byPlatform)
  console.log(`${p.platform.padEnd(18)} ${p.years.padEnd(10)} ${pad(p.n, 4)} ${pad(p.meanAll, 9)} ${pad(p.core.mean, 9)} (${pad(p.core.n, 3)}) ${pad((p.legendaryShare * 100).toFixed(0) + '%', 10)} ${pad((p.ubOrParadoxShare * 100).toFixed(0) + '%', 10)}`);
const lp = tl.launchVsPostLaunch;
console.log(`\nLaunch-game species:  n=${lp.launch.n}  mean ${lp.launch.meanAll}  legendary ${(lp.launch.legendaryShare * 100).toFixed(0)}%  UB/Paradox ${(lp.launch.ubOrParadoxShare * 100).toFixed(0)}%`);
console.log(`Post-launch species:  n=${lp.postLaunch.n}  mean ${lp.postLaunch.meanAll}  legendary ${(lp.postLaunch.legendaryShare * 100).toFixed(0)}%  UB/Paradox ${(lp.postLaunch.ubOrParadoxShare * 100).toFixed(0)}%`);
for (const g of tl.postLaunchGames) console.log(`  ${g.date} ${g.game.padEnd(44)} mean ${pad(g.meanAll, 5)}  ${g.species.join(', ')}`);
