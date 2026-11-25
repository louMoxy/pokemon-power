// Loads everything the site needs from public/data in parallel.
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;
const json = (f) => fetch(`${BASE}data/${f}`).then((r) => {
  if (!r.ok) throw new Error(`Failed to load ${f}: ${r.status}`);
  return r.json();
});

export async function loadData(renderer) {
  const [pokemon, meta, games, findings, atlas] = await Promise.all([
    json('pokemon.json'),
    json('meta.json'),
    json('games.json'),
    json('findings.json'),
    new THREE.TextureLoader().loadAsync(`${BASE}data/atlas.png`),
  ]);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.NearestFilter; // crisp pixel art up close
  atlas.minFilter = THREE.LinearMipmapLinearFilter; // no shimmer when far away
  atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { pokemon, meta, games, findings, atlas };
}

export const TYPE_COLORS = {
  normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c',
  ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3',
  psychic: '#f95587', bug: '#a6b91a', rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc',
  dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
};
