import * as THREE from 'three';
import { Stage } from './stage.js';
import { loadData } from './data.js';
import { SpriteField } from './sprites.js';
import { Picker } from './picker.js';
import { Overlay } from './ui.js';
import { LAYOUTS } from './layouts.js';

const stage = new Stage(document.getElementById('scene'));

// Home view: far enough back that the whole galaxy fits the narrower screen axis
const HOME = { target: new THREE.Vector3(0, 0, 0), position: new THREE.Vector3() };
function updateHome() {
  const halfTan = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
  const dist = Math.max(30, 12 / (halfTan * Math.min(1, stage.camera.aspect)));
  HOME.position.set(0, dist * 0.13, dist);
  stage.scene.fog.density = 0.55 / dist; // same depth fade however far back we start
}
updateHome();
stage.camera.position.copy(HOME.position);
addEventListener('resize', () => {
  const idle = stage.controls.autoRotate;
  updateHome();
  if (idle) stage.camera.position.setLength(HOME.position.length());
});
const status = document.getElementById('status');

let data;
try {
  data = await loadData(stage.renderer);
} catch (err) {
  status.textContent = 'Could not load the Pokémon data. Please refresh to try again.';
  throw err;
}
const { pokemon, meta, games, atlas } = data;
status.textContent = `${pokemon.length.toLocaleString()} Pokémon · 9 generations · 1996–2024`;
document.body.classList.add('ready');

// ---------- Backdrop: faint starfield far outside the data
{
  const n = 1500, pos = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) pos.set(v.randomDirection().multiplyScalar(120 + Math.random() * 120).toArray(), i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stage.scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x8890b0, size: 0.6, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.6,
  })));
}

// ---------- Sprites
const field = new SpriteField(pokemon, meta, atlas);
stage.scene.add(field.mesh);
stage.onFrame((dt, t) => field.update(dt, t));

// Generations sweep in, in order, whenever the layout changes
const genDelays = Float32Array.from(pokemon, (p) => ((p.generation - 1) / 8) * 0.85 + Math.random() * 0.15);

// ---------- Hover, select, focus
const picker = new Picker(stage, field);
let selected = -1;

function select(i) {
  selected = i;
  field.uniforms.uSelected.value = i;
  overlay.showFocus(i >= 0 ? pokemon[i] : null);
  if (i < 0) { stage.flyTo(HOME.target, HOME.position); return; }
  const target = field.positionOf(i);
  // keep the current viewing direction, move in close
  const dir = stage.camera.position.clone().sub(stage.controls.target).normalize();
  // On narrow screens the card sits at the bottom, so aim below the sprite to
  // frame it in the upper half of the screen
  if (innerWidth <= 640) target.y -= 2.4;
  stage.flyTo(target, target.clone().addScaledVector(dir, 11));
}

// ---------- Layouts
const overlay = new Overlay({ games, layouts: LAYOUTS, onLayout: (k) => setLayout(k) });
function setLayout(key) {
  if (selected >= 0) select(-1);
  field.morphTo(LAYOUTS[key].build(pokemon), { delays: genDelays });
  overlay.setLayout(key);
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
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const coarse = e.pointerType === 'touch' || matchMedia('(pointer: coarse)').matches;
  const i = picker.pick(e.clientX, e.clientY, coarse ? 18 : 0);
  if (i >= 0) select(i);
  else if (selected >= 0) select(-1);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selected >= 0) select(-1);
  if (e.key === '1') setLayout('role');
  if (e.key === '2') setLayout('power');
});

// Intro: sprites fly out from the centre, generation by generation
field.setLayout(new Float32Array(pokemon.length * 3));
field.morphTo(LAYOUTS.role.build(pokemon), { duration: 2.4, stagger: 0.6, delays: genDelays });
overlay.setLayout('role');
