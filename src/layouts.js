// Layout functions: each returns a Float32Array of xyz positions (one per Pokémon)
// plus an optional per-instance scale. Task 5 adds the Tower and Type Landscape here.
const SPREAD = 12;

export const LAYOUTS = {
  role: {
    label: 'Role map',
    hint: 'Clustered by the shape of each stat spread (UMAP). Size = base stat total.',
    build: (pokemon) => fromField(pokemon, 'umap'),
  },
  power: {
    label: 'Power map',
    hint: 'PCA of the six stats. Left → right: overall power. Up: fast & special, down: bulky.',
    build: (pokemon) => fromField(pokemon, 'pca'),
  },
};

function fromField(pokemon, field) {
  const out = new Float32Array(pokemon.length * 3);
  pokemon.forEach((p, i) => out.set(p[field].map((v) => v * SPREAD), i * 3));
  return out;
}
