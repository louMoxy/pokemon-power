// Sanity checks and first-pass power-creep numbers from public/data/pokemon.json.
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('public/data/pokemon.json', 'utf8'));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const r = (x) => (Number.isNaN(x) ? '  -' : x.toFixed(0).padStart(3));

// --- Sanity checks
const problems = data.filter(
  (p) => !p.generation || p.types.length < 1 || Object.keys(p.stats).length !== 6 || !p.sprite,
);
console.log(`Rows: ${data.length}   rows with missing fields: ${problems.length}`);
problems.slice(0, 10).forEach((p) => console.log('  ', p.id, p.name, p.generation, p.types, !!p.sprite));
for (const n of ['Bulbasaur', 'Charizard', 'Mewtwo', 'Pikachu', 'Garchomp', 'Koraidon', 'Pecharunt'])
  console.log('  ', JSON.stringify(data.find((p) => p.name === n), ['name', 'generation', 'types', 'bst', 'evoStage', 'fullyEvolved', 'isLegendary']));

// --- Power creep by generation
const isSpecial = (p) => p.isLegendary || p.isMythical;
console.log('\nGen | count | mean BST all | median BST all | mean BST fully-evolved non-legendary (n) | legendary/mythical (n)');
for (let g = 1; g <= 9; g++) {
  const all = data.filter((p) => p.generation === g);
  const fe = all.filter((p) => p.fullyEvolved && !isSpecial(p));
  const leg = all.filter(isSpecial);
  console.log(
    ` ${g}  |  ${String(all.length).padStart(3)}  |     ${r(mean(all.map((p) => p.bst)))}      |      ${r(median(all.map((p) => p.bst)))}       |              ${r(mean(fe.map((p) => p.bst)))} (${fe.length})                    |   ${r(mean(leg.map((p) => p.bst)))} (${leg.length})`,
  );
}

// --- Type by generation: mean BST of fully-evolved non-legendaries, by primary or secondary type
const types = [...new Set(data.flatMap((p) => p.types))].sort();
console.log('\nMean BST, fully-evolved non-legendary, by type (any slot) x gen');
console.log('type      ' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => `  g${g}`).join('') + '   all');
for (const t of types) {
  const pool = data.filter((p) => p.fullyEvolved && !isSpecial(p) && p.types.includes(t));
  const cells = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => ' ' + r(mean(pool.filter((p) => p.generation === g).map((p) => p.bst))));
  console.log(t.padEnd(10) + cells.join('') + '   ' + r(mean(pool.map((p) => p.bst))));
}
