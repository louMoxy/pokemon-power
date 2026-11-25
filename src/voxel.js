// VoxelViewer: turns a Pokémon's pixel sprite into a 3D voxel figure that spins in the
// focus card. Every opaque pixel becomes one box; boxes are thicker the further the
// pixel is from the sprite's outline, so the figure looks rounded instead of like flat
// cardboard. Drawn with one InstancedMesh in its own small renderer, which only runs
// while the card is open.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Thickness profile: a circular arc of radius R (in pixels) measured in from the
// outline, so the figure is pillow-shaped: rounded at the edges, chunky in the middle.
const R = 10;
const thickness = (d) => { const t = Math.min(d, R); return 1.5 + 1.6 * Math.sqrt(t * (2 * R - t)); };

export class VoxelViewer {
  constructor(container, atlasImage, meta) {
    this.container = container;
    this.atlasImage = atlasImage;
    this.cell = meta.atlas.cell;
    this.cols = meta.atlas.cols;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x30283a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 4, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffcb3d, 1.2);
    rim.position.set(4, 1, -5);
    this.scene.add(rim);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 0.6, 11);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 2.2;
    this.controls.minPolarAngle = Math.PI * 0.25;
    this.controls.maxPolarAngle = Math.PI * 0.7;

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.mesh = null;
    this.appear = 1;
    this.clock = new THREE.Clock();

    // a 1-cell canvas to read sprite pixels out of the atlas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.cell;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    new ResizeObserver(() => this.resize()).observe(container);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  show(p) {
    this.clear();
    const { data: px } = this.readSprite(p.atlas);
    const n = this.cell;
    const opaque = (x, y) => x >= 0 && y >= 0 && x < n && y < n && px[(y * n + x) * 4 + 3] > 127;

    // chessboard distance from each opaque pixel to the nearest transparent one,
    // as two raster passes (forward, then backward)
    const dist = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!opaque(x, y)) continue;
      const up = y ? dist[(y - 1) * n + x] : 0, left = x ? dist[y * n + x - 1] : 0;
      const ul = x && y ? dist[(y - 1) * n + x - 1] : 0, ur = y && x < n - 1 ? dist[(y - 1) * n + x + 1] : 0;
      dist[y * n + x] = 1 + Math.min(up, left, ul, ur);
    }
    for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
      if (!opaque(x, y)) continue;
      const dn = y < n - 1 ? dist[(y + 1) * n + x] : 0, rt = x < n - 1 ? dist[y * n + x + 1] : 0;
      const dr = x < n - 1 && y < n - 1 ? dist[(y + 1) * n + x + 1] : 0, dl = x && y < n - 1 ? dist[(y + 1) * n + x - 1] : 0;
      dist[y * n + x] = Math.min(dist[y * n + x], 1 + Math.min(dn, rt, dr, dl));
    }

    const voxels = [];
    let x0 = n, x1 = 0, y0 = n, y1 = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!opaque(x, y)) continue;
      voxels.push([x, y]);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (!voxels.length) return;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(geo, mat, voxels.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    voxels.forEach(([x, y], k) => {
      const depth = thickness(dist[y * n + x]);
      m.makeScale(1, 1, depth).setPosition(x - cx, cy - y, 0);
      mesh.setMatrixAt(k, m);
      const o = (y * n + x) * 4;
      mesh.setColorAt(k, c.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace));
    });
    // fit the figure to the viewer: the tallest/widest side maps to ~5.2 units
    const fit = 5.2 / Math.max(x1 - x0 + 1, y1 - y0 + 1, 24);
    mesh.scale.setScalar(fit);
    this.pivot.add(mesh);
    this.mesh = mesh;

    this.controls.reset();
    this.appear = 0;
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  readSprite(index) {
    const col = index % this.cols, row = Math.floor(index / this.cols);
    this.ctx.clearRect(0, 0, this.cell, this.cell);
    this.ctx.drawImage(this.atlasImage, col * this.cell, row * this.cell, this.cell, this.cell, 0, 0, this.cell, this.cell);
    return this.ctx.getImageData(0, 0, this.cell, this.cell);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.appear < 1) {
      // pop in: grow from nothing with a half spin, settling with a little overshoot
      this.appear = Math.min(1, this.appear + dt / 0.7);
      const t = this.appear, s = 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
      this.pivot.scale.setScalar(Math.max(0.001, s));
      this.pivot.rotation.y = (1 - t) * Math.PI;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  clear() {
    if (this.mesh) {
      this.pivot.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh.dispose();
      this.mesh = null;
    }
  }

  hide() {
    this.renderer.setAnimationLoop(null);
    this.clear();
  }
}
