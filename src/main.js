import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Placeholder Stat Galaxy: every Pokémon drawn as its sprite (one draw call, GPU points
// sampling the atlas). Press L to morph between the UMAP "role" layout and the PCA layout.
// Task 4 replaces this with instanced billboards, picking and proper views.
const BASE = import.meta.env.BASE_URL;
const SCALE = 10;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(0, 3, 24);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  material.uniforms.uViewportH.value = innerHeight * renderer.getPixelRatio();
}

const [pokemon, meta, atlas] = await Promise.all([
  fetch(`${BASE}data/pokemon.json`).then((r) => r.json()),
  fetch(`${BASE}data/meta.json`).then((r) => r.json()),
  new THREE.TextureLoader().loadAsync(`${BASE}data/atlas.png`),
]);
atlas.magFilter = THREE.NearestFilter; // keep pixel art crisp
atlas.minFilter = THREE.LinearFilter;
atlas.generateMipmaps = false;
atlas.colorSpace = THREE.SRGBColorSpace;

const n = pokemon.length;
const posUmap = new Float32Array(n * 3);
const posPca = new Float32Array(n * 3);
const cell = new Float32Array(n);
const size = new Float32Array(n);
pokemon.forEach((p, i) => {
  posUmap.set(p.umap.map((v) => v * SCALE), i * 3);
  posPca.set(p.pca.map((v) => v * SCALE), i * 3);
  cell[i] = p.atlas;
  size[i] = 0.5 + ((p.bst - 175) / (720 - 175)) * 1.0; // BST drives sprite size
});

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(posUmap, 3));
geo.setAttribute('positionB', new THREE.BufferAttribute(posPca, 3));
geo.setAttribute('cell', new THREE.BufferAttribute(cell, 1));
geo.setAttribute('size', new THREE.BufferAttribute(size, 1));

const material = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    uAtlas: { value: atlas },
    uGrid: { value: new THREE.Vector2(meta.atlas.cols, meta.atlas.rows) },
    uMix: { value: 0 },
    uViewportH: { value: 1 },
  },
  vertexShader: /* glsl */ `
    attribute vec3 positionB;
    attribute float cell;
    attribute float size;
    uniform float uMix;
    uniform float uViewportH;
    varying float vCell;
    void main() {
      vec3 p = mix(position, positionB, uMix);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      // world-space size -> pixels, so sprites shrink with distance
      gl_PointSize = size * uViewportH * projectionMatrix[1][1] / (-mv.z) * 0.5;
      vCell = cell;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uAtlas;
    uniform vec2 uGrid;
    varying float vCell;
    void main() {
      float col = mod(vCell, uGrid.x);
      float row = floor(vCell / uGrid.x);
      vec2 uv = vec2((col + gl_PointCoord.x) / uGrid.x, 1.0 - (row + gl_PointCoord.y) / uGrid.y);
      vec4 c = texture2D(uAtlas, uv);
      if (c.a < 0.5) discard;
      gl_FragColor = vec4(c.rgb, 1.0);
      #include <colorspace_fragment>
    }`,
});
scene.add(new THREE.Points(geo, material));

addEventListener('resize', resize);
resize();

let target = 0;
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'l') target = 1 - target;
});
const status = document.getElementById('status');
const label = () => (target ? 'PCA: x = overall power, y = fast/special vs bulky' : 'UMAP: clustered by stat role');
status.textContent = `${n} Pokémon · ${label()} · press L to switch`;

renderer.setAnimationLoop(() => {
  const m = material.uniforms.uMix;
  m.value += (target - m.value) * 0.06;
  status.textContent = `${n} Pokémon · ${label()} · press L to switch`;
  controls.update();
  renderer.render(scene, camera);
});
