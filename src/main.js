import * as THREE from 'three';
import { Stage } from './stage.js';
import { loadData } from './data.js';
import { SpriteField } from './sprites.js';
import { Picker } from './picker.js';
import { Overlay } from './ui.js';
import { LAYOUTS } from './layouts.js';
import { Guides } from './guides.js';
import { Filters } from './filters.js';
import { VoxelViewer } from './voxel.js';

const stage = new Stage(document.getElementById('scene'));
const status = document.getElementById('status');

let data;
try {
  data = await loadData(stage.renderer);
} catch (err) {
  status.textContent = 'Could not load the Pokémon data. Please refresh to try again.';
  throw err;
}
const { pokemon, meta, games, atlas } = data;
const isPortrait = () => innerWidth / innerHeight < 0.85;
const ctx = { games, portrait: isPortrait() };
status.textContent = `${pokemon.length.toLocaleString()} Pokémon · 9 generations · 1996–2024`;
document.body.classList.add('ready');

// ---------- Backdrop: faint starfield far outside the data
{
  const n = 1500, pos = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) pos.set(v.randomDirection().multiplyScalar(160 + Math.random() * 120).toArray(), i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stage.scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x8890b0, size: 0.6, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.6,
  })));
}

// ---------- Sprites + guides
const field = new SpriteField(pokemon, meta, atlas);
stage.scene.add(field.mesh);
const guides = new Guides(stage.scene, pokemon);
stage.onFrame((dt, t) => { field.update(dt, t); guides.update(dt); });

// Generations sweep in, in order, whenever the layout changes
const genDelays = Float32Array.from(pokemon, (p) => ((p.generation - 1) / 8) * 0.85 + Math.random() * 0.15);

// ---------- Camera views
// Every view is a flat chart seen straight on. Each layout gets a "home" view that fits
// it to the screen; selecting a Pokémon flies in, deselecting flies back.
const view = { target: new THREE.Vector3(), position: new THREE.Vector3() };

// The box to fit: the layout's own frame, or the bounds of the visible sprites
function frameOf(layout) {
  if (layout.frame) return layout.frame;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const p = layout.positions;
  for (let i = 0; i < pokemon.length; i++) {
    if (ctx.visible && !ctx.visible[i]) continue;
    x0 = Math.min(x0, p[i * 3]); x1 = Math.max(x1, p[i * 3]);
    y0 = Math.min(y0, p[i * 3 + 1]); y1 = Math.max(y1, p[i * 3 + 1]);
  }
  if (x0 === Infinity) return { center: [0, 0, 0], size: [20, 20, 0] };
  return { center: [(x0 + x1) / 2, (y0 + y1) / 2, 0], size: [x1 - x0, y1 - y0, 0] };
}

function computeView(layout) {
  const halfTan = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
  const aspect = stage.camera.aspect;
  const { center, size: [w, h] } = frameOf(layout);
  // margins leave room for the BST axis labels (left) and group labels (below);
  // only ~72% of the screen height is free: the title sits on top, the layout bar below
  const fitW = (w / 2 + 5.5) / (halfTan * aspect), fitH = (h / 2 + 3) / (halfTan * 0.72);
  const dist = Math.max(fitW, fitH, 8);
  view.target.set(...center);
  view.position.set(center[0], center[1], dist);
  stage.controls.maxDistance = Math.max(60, dist * 2);
  return dist;
}

function goHome(animate = true) {
  computeView(currentLayout);
  if (animate) stage.flyTo(view.target, view.position, 1.2);
  else { stage.controls.target.copy(view.target); stage.camera.position.copy(view.position); }
}

// ---------- Filters: hide everything that doesn't match and rebuild the layout around
// what is left. Debounced so typing in the search box doesn't re-layout every keystroke.
let layoutKey = 'role';
let currentLayout = null; // set by the first setLayout() call at the bottom
let filterTimer = null;
const filters = new Filters(pokemon, ctx, (mask, active) => {
  ctx.visible = active ? mask : null;
  const shown = active ? mask.reduce((a, b) => a + b, 0) : pokemon.length;
  status.textContent = active
    ? `Showing ${shown.toLocaleString()} of ${pokemon.length.toLocaleString()} Pokémon`
    : `${pokemon.length.toLocaleString()} Pokémon · 9 generations · 1996–2024`;
  clearTimeout(filterTimer);
  if (currentLayout) filterTimer = setTimeout(applyFilters, 200);
});
function applyFilters() {
  clearTimeout(filterTimer);
  filterTimer = null;
  setLayout(layoutKey, { fromFilter: true });
}
// Enter in the search box flies to the first match
filters.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (filterTimer) applyFilters(); // lay out the matches now so we fly to the right place
    const i = filters.firstMatch();
    if (i >= 0) { select(i); if (matchMedia('(max-width: 640px)').matches) filters.setOpen(false); }
  }
  if (e.key === 'Escape') { filters.search.blur(); filters.setOpen(false); }
});

// ---------- Hover, select, focus
const voxels = new VoxelViewer(document.getElementById('voxel'), atlas.image, meta);
const picker = new Picker(stage, field);
let selected = -1;

function select(i) {
  selected = i;
  field.uniforms.uSelected.value = i;
  overlay.showFocus(i >= 0 ? pokemon[i] : null);
  if (i < 0) { voxels.hide(); goHome(); return; }
  voxels.show(pokemon[i]);
  // aim at where the sprite is heading (it may still be animating into place)
  const target = new THREE.Vector3().fromArray(currentLayout.positions, i * 3);
  // keep the current viewing direction, move in close
  const dir = stage.camera.position.clone().sub(stage.controls.target).normalize();
  // On narrow screens the card sits at the bottom, so aim below the sprite to
  // frame it in the upper half of the screen
  if (innerWidth <= 640) target.y -= 2.4;
  stage.flyTo(target, target.clone().addScaledVector(dir, 16));
}

// ---------- Layouts
const overlay = new Overlay({ games, layouts: LAYOUTS, onLayout: (k) => setLayout(k) });

function setLayout(key, { intro = false, fromFilter = false } = {}) {
  layoutKey = key;
  currentLayout = LAYOUTS[key].build(pokemon, ctx);
  // a filter change keeps the selection if it is still visible
  const keepSelection = fromFilter && selected >= 0 && (!ctx.visible || ctx.visible[selected]);
  if (selected >= 0 && !keepSelection) { selected = -1; field.uniforms.uSelected.value = -1; overlay.showFocus(null); voxels.hide(); }
  if (intro) field.setLayout(new Float32Array(pokemon.length * 3));
  field.morphTo(currentLayout.positions, {
    visible: ctx.visible,
    delays: genDelays,
    ...(intro ? { duration: 2.4, stagger: 0.6 } : fromFilter ? { duration: 1.1, stagger: 0.2 } : { duration: 1.6 }),
  });
  guides.set(currentLayout, intro ? 1.8 : fromFilter ? 0.5 : 1.0);
  // sideways (portrait) pillars: BST runs left to right instead of up
  const empty = ctx.visible && !ctx.visible.some((v) => v);
  overlay.setLayout(key, empty ? 'No Pokémon match these filters.'
    : currentLayout.horizontal ? LAYOUTS[key].hint.replace('Height =', 'Left → right =') : null);
  if (keepSelection) return;
  // galaxies keep the camera where the user left it on a filter change;
  // grouped views re-frame to fit the groups that are left
  if (!fromFilter || currentLayout.frame) goHome(!intro);
}

stage.onFrame(() => {
  const i = picker.hovered();
  field.uniforms.uHover.value = i;
  const p = picker.pointer;
  overlay.showTooltip(i >= 0 && i !== selected ? pokemon[i] : null, p?.x, p?.y);
  stage.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : '';
});

// Click (not drag) selects; clicking empty space goes back
const canvas = stage.renderer.domElement;
let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY };
  // on phones the filter sheet covers the scene: touching the scene closes it
  if (matchMedia('(max-width: 640px)').matches) filters.setOpen(false);
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const coarse = e.pointerType === 'touch' || matchMedia('(pointer: coarse)').matches;
  const i = picker.pick(e.clientX, e.clientY, coarse ? 18 : 0);
  if (i >= 0) select(i);
  else if (selected >= 0) select(-1);
});

const keys = Object.keys(LAYOUTS);
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'Escape') {
    if (!filters.panel.hidden) { filters.setOpen(false); return; }
    if (selected >= 0) select(-1);
  }
  if (e.key === '/' || e.key === 'f') { e.preventDefault(); filters.setOpen(true); filters.search.focus(); return; }
  const n = Number(e.key);
  if (n >= 1 && n <= keys.length) setLayout(keys[n - 1]);
});

addEventListener('resize', () => {
  // switching between portrait and landscape rebuilds grouped layouts on their side
  if (isPortrait() !== ctx.portrait) {
    ctx.portrait = isPortrait();
    setLayout(layoutKey);
    return;
  }
  // otherwise re-fit the current view if the user isn't zoomed in on something
  if (selected < 0) goHome(false);
});

setLayout(layoutKey, { intro: true });
