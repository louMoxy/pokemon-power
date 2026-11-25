// Loads everything the site needs from public/data, reporting download progress
// (onProgress(0..1)) so the loading screen can show a real progress bar.
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;

// fetch() that reports bytes received; falls back to "unknown size" gracefully
async function fetchWithProgress(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) { const b = await res.blob(); onBytes(1, 1); return b; }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onBytes(got, total);
  }
  return new Blob(chunks, { type: res.headers.get('content-type') ?? '' });
}

export async function loadData(renderer, onProgress = () => {}) {
  // weights: the atlas is most of the download
  const parts = { data: 0, atlas: 0 };
  const report = () => onProgress(parts.data * 0.3 + parts.atlas * 0.7);
  const part = (key) => (got, total) => { parts[key] = total ? got / total : 0.5; report(); };

  const json = async (f, key) => JSON.parse(await (await fetchWithProgress(`${BASE}data/${f}`, key ? part(key) : () => {})).text());
  const meta = await json('meta.json');
  const [pokemon, games, atlasBlob] = await Promise.all([
    json('pokemon.web.json', 'data'),
    json('games.json'),
    fetchWithProgress(`${BASE}data/${meta.atlas.file}`, part('atlas')),
  ]);

  const url = URL.createObjectURL(atlasBlob);
  const atlas = await new THREE.TextureLoader().loadAsync(url);
  URL.revokeObjectURL(url);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.NearestFilter; // crisp pixel art up close
  atlas.minFilter = THREE.LinearMipmapLinearFilter; // no shimmer when far away
  atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
  onProgress(1);
  return { pokemon, meta, games, atlas };
}

export const TYPE_COLORS = {
  normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c',
  ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3',
  psychic: '#f95587', bug: '#a6b91a', rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc',
  dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
};
