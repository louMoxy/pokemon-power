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
import { Story } from './story.js';
import { Backdrop } from './backdrop.js';

const status = document.getElementById('status');
const loader = document.getElementById('loader');
const loaderBar = loader.querySelector('.bar i');
const loaderText = loader.querySelector('.loader-text');
function loaderError(message) {
  loader.classList.add('error');
  loaderText.textContent = message;
}

// WebGL can be missing or disabled (old devices, some locked-down browsers)
let stage;
try {
  stage = new Stage(document.getElementById('scene'));
} catch (err) {
  loaderError('This page needs WebGL, which your browser or device doesn’t support. Try a recent Chrome, Firefox, Safari or Edge.');
  throw err;
}

// The backdrop starts drawing straight away, so the loading screen sits on the nebula
const backdrop = new Backdrop();
stage.backdrop = backdrop;

let data;
try {
  data = await loadData(stage.renderer, (p) => {
    loaderBar.style.width = `${Math.round(p * 100)}%`;
  });
} catch (err) {
  loaderError('Could not load the Pokémon data. Check your connection and refresh to try again.');
  throw err;
}
loader.classList.add('done');
setTimeout(() => loader.remove(), 700);
const { pokemon, meta, games, atlas } = data;
const isPortrait = () => innerWidth / innerHeight < 0.85;
const ctx = {
  games,
  portrait: isPortrait(),
  launchIds: new Set(games.filter((g) => g.kind === 'base').map((g) => g.id)),
};
status.textContent = `${pokemon.length.toLocaleString()} Pokémon · 9 generations · 1996–2024`;
document.body.classList.add('ready');

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

// Screen space (CSS px) covered by overlays, which the chart must fit around: the title
// and layout bar in explore mode; the chapter cards in story mode (left column on
// desktop, bottom sheet on phones).
function insets() {
  if (mode !== 'story') return { left: 0, top: 110, bottom: 130 };
  if (innerWidth > 760) return { left: Math.min(460, innerWidth * 0.42), top: 40, bottom: 40 };
  return { left: 0, top: 50, bottom: innerHeight * 0.46 };
}

function computeView(layout) {
  const halfTan = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
  const { center, size: [w, h] } = frameOf(layout);
  const ins = insets();
  const freeW = Math.max(200, innerWidth - ins.left), freeH = Math.max(200, innerHeight - ins.top - ins.bottom);
  // distance at which the box (plus room for axis labels left and group labels below)
  // fits the free area; world units per CSS px at distance d is 2·d·tan(fov/2) / height
  const fitW = ((w + 11) * innerHeight) / (2 * halfTan * freeW);
  const fitH = ((h + 6) * innerHeight) / (2 * halfTan * freeH);
  const dist = Math.max(fitW, fitH, 8);
  const unit = (2 * dist * halfTan) / innerHeight;
  // shift the camera so the chart is centred in the free area, not the whole screen
  const tx = center[0] - (ins.left / 2) * unit;
  const ty = center[1] - ((ins.bottom - ins.top) / 2) * unit;
  view.target.set(tx, ty, 0);
  view.position.set(tx, ty, dist);
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
let mode = 'story'; // 'story' | 'explore'
let layoutKey = 'role';
let currentLayout = null; // set by the first setLayout() call at the bottom
let filterTimer = null;
let exploreVisible = null; // the filter panel's mask; story chapters set their own
const filters = new Filters(pokemon, ctx, (mask, active) => {
  exploreVisible = active ? mask : null;
  if (mode !== 'explore') return;
  ctx.visible = exploreVisible;
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
  if (i < 0) { voxels.hide(); if (mode === 'explore') goHome(); return; }
  voxels.show(pokemon[i]);
  // in the story the camera belongs to the chapter: just open the card
  if (mode === 'story') return;
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

// Where Pokémon appearing in a story chapter fly in from, relative to their new spot
const ENTRANCES = {
  scatter: (x, y, z) => { const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 25; return [x + Math.cos(a) * r, y + Math.sin(a) * r, z]; },
  right: (x, y, z) => [x + 45 + Math.random() * 12, y, z],
  left: (x, y, z) => [x - 45 - Math.random() * 12, y, z],
  top: (x, y, z) => [x + (Math.random() - 0.5) * 4, y + 32 + Math.random() * 10, z],
};

// story: a chapter from story.js (its own visibility, entrance and trend line)
function setLayout(key, { fromFilter = false, story = null } = {}) {
  layoutKey = key;
  currentLayout = LAYOUTS[key].build(pokemon, ctx);
  if (story?.trend) currentLayout.trend = true;
  // a filter change keeps the selection if it is still visible
  const keepSelection = fromFilter && selected >= 0 && (!ctx.visible || ctx.visible[selected]);
  if (selected >= 0 && !keepSelection) { selected = -1; field.uniforms.uSelected.value = -1; overlay.showFocus(null); voxels.hide(); }
  const pos = currentLayout.positions;
  const enter = story?.enter && ENTRANCES[story.enter];
  field.morphTo(pos, {
    visible: ctx.visible,
    delays: genDelays,
    enterFrom: enter ? (i) => enter(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) : null,
    ...(story?.enter === 'scatter' ? { duration: 2.6, stagger: 0.6 }
      : enter ? { duration: 2.0, stagger: 0.45 }
      : fromFilter ? { duration: 1.1, stagger: 0.2 } : { duration: 1.6 }),
  });
  guides.set(currentLayout, story?.enter === 'scatter' ? 1.8 : fromFilter ? 0.5 : 1.0);
  // sideways (portrait) pillars: BST runs left to right instead of up
  const empty = ctx.visible && !ctx.visible.some((v) => v);
  overlay.setLayout(key, empty ? 'No Pokémon match these filters.'
    : currentLayout.horizontal ? LAYOUTS[key].hint.replace('Height =', 'Left → right =') : null);
  if (keepSelection) return;
  // galaxies keep the camera where the user left it on a filter change;
  // grouped views re-frame to fit the groups that are left
  if (!fromFilter || currentLayout.frame) goHome(true);
}

// ---------- Story mode
const story = new Story({
  games,
  onChapter: (ch) => {
    backdrop.setMood(ch.mood ?? 'default');
    ctx.visible = ch.show ? ch.show(pokemon) : null;
    setLayout(ch.layout, { story: ch });
  },
  onProgress: (p) => guides.setTrendProgress(p),
  onExplore: () => enterExplore(),
});

// Story mode with a mouse: the scroll layer lets pointer events through to the chart
// (see CSS), so hover tooltips work. The chart's own pan/zoom is off, and the wheel and
// paging keys scroll the story instead.
function syncControls() { stage.controls.enabled = mode === 'explore'; }
stage.renderer.domElement.addEventListener('wheel', (e) => {
  if (mode !== 'story') return;
  e.preventDefault();
  // 'instant': the story layer's smooth scrolling would restart on every wheel tick,
  // so a trackpad's stream of small ticks barely moved it
  const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * story.el.clientHeight : e.deltaY;
  story.el.scrollBy({ top: dy, behavior: 'instant' });
}, { passive: false });
addEventListener('keydown', (e) => {
  if (mode !== 'story' || e.target.closest?.('input, textarea, button')) return;
  const page = story.el.clientHeight * 0.8;
  const by = { PageDown: page, ' ': page, ArrowDown: 80, PageUp: -page, ArrowUp: -80 }[e.key];
  if (by) { e.preventDefault(); story.el.scrollBy({ top: e.shiftKey && e.key === ' ' ? -page : by }); }
  if (e.key === 'Escape' && selected >= 0) select(-1);
});

function enterStory() {
  mode = 'story';
  syncControls();
  if (selected >= 0) select(-1);
  filters.setOpen(false);
  story.show();
}

function enterExplore() {
  mode = 'explore';
  backdrop.setMood('default');
  syncControls();
  if (selected >= 0) select(-1);
  story.hide();
  ctx.visible = exploreVisible;
  setLayout('generation');
}
document.getElementById('story-btn').addEventListener('click', enterStory);

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

const keys = Object.keys(LAYOUTS).filter((k) => !LAYOUTS[k].hidden);
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (mode !== 'explore') return; // story mode is driven by scrolling
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
    setLayout(layoutKey, { story: mode === 'story' ? story.chapters[story.active] : null });
    return;
  }
  // otherwise re-fit the current view if the user isn't zoomed in on something
  if (selected < 0) goHome(false);
});

// Start with the story: every sprite begins hidden and flies in for the intro chapter
field.hideAll();
enterStory();
