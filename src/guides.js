// Scene guides for grouped layouts: group labels (HTML via CSS2DRenderer), a gold ring
// at each group's average BST, heat tiles for matrix cells, and faint BST reference
// lines. Guides fade in once the sprites have mostly arrived and fade out when the
// layout changes. When filters are active, counts, averages, ring heights and tile
// colours are recomputed for just the visible Pokémon.
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { bstToY } from './layouts.js';

const GOLD = 0xffcb3d;
const EMPTY = new THREE.Color(0x1a1e2c);
// Average BST -> colour: deep blue (weak) through purple to gold (strong)
const HEAT = [[330, new THREE.Color(0x1b2550)], [450, new THREE.Color(0x6a2c70)], [560, new THREE.Color(0xffb020)]];
export function heatColor(bst) {
  if (bst <= HEAT[0][0]) return HEAT[0][1].clone();
  for (let k = 1; k < HEAT.length; k++) {
    const [b1, c1] = HEAT[k], [b0, c0] = HEAT[k - 1];
    if (bst <= b1) return c0.clone().lerp(c1, (bst - b0) / (b1 - b0));
  }
  return HEAT.at(-1)[1].clone();
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Guides {
  constructor(scene, pokemon) {
    this.scene = scene;
    this.pokemon = pokemon;
    this.current = null;
    this.fading = []; // built guide sets currently fading in or out
    this.mask = null;
    this.filterActive = false;
  }

  set(layout, delay = 0.9) {
    if (this.current) this.fade(this.current, -1);
    this.current = null;
    if (!layout.groups && !layout.axis) return;
    const built = this.build(layout);
    built.t = -delay / 0.5; // wait 'delay' seconds before fading in (0.5s fade)
    this.current = built;
    this.applyFilter(this.mask, this.filterActive);
    this.fade(built, 1);
    this.scene.add(built.group);
  }

  build({ groups = [], axis, frame, horizontal = false }) {
    const group = new THREE.Group();
    const materials = [], labels = [], stats = [];
    const baseY = bstToY(175) - 1.2;

    for (const g of groups) {
      const handle = { g, horizontal };
      if (g.label) {
        // CSS2DRenderer owns the outer element's transform, so offsets go on an inner one
        const el = document.createElement('div');
        el.style.opacity = 0;
        const inner = document.createElement('div');
        inner.className = ['group-label', g.side && 'side', g.above && 'above', g.raise && 'raise',
          g.labelOnly && 'axis', g.stagger && 'lower'].filter(Boolean).join(' ');
        if (g.color) inner.style.setProperty('--chip', g.color);
        inner.innerHTML = `<b>${esc(g.label)}</b>` + (g.sub ? `<span>${esc(g.sub)}</span>` : '') +
          (g.members ? '<span class="nums"></span>' : '');
        el.appendChild(inner);
        handle.nums = inner.querySelector('.nums');
        handle.labelEl = inner;
        const obj = new CSS2DObject(el);
        obj.position.set(g.x, g.y ?? baseY, g.z);
        group.add(obj);
        labels.push(el);
      }
      if (g.tile) {
        // heat tile behind a matrix cell, coloured by the cell's average BST
        const mat = new THREE.MeshBasicMaterial({ color: EMPTY, transparent: true, opacity: 0, depthWrite: false, fog: false });
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(g.tile * 0.94, g.tile * 0.94), mat);
        tile.position.set(g.x, g.y, g.z - 0.05);
        group.add(tile);
        materials.push(mat);
        handle.tile = mat;
      } else if (g.members && !g.labelOnly) {
        const r = g.radius;
        const mat = new THREE.MeshBasicMaterial({
          color: GOLD, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false,
        });
        mat.userData.target = 0.9;
        const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.1, 64), mat);
        if (horizontal) ring.rotation.y = Math.PI / 2; // sideways pillar: ring stands upright
        else ring.rotation.x = -Math.PI / 2;
        group.add(ring);
        materials.push(mat);
        handle.ring = ring;
      }
      if (g.members) stats.push(handle);
    }

    if (axis && frame) {
      // BST reference lines: horizontal for upright pillars, vertical when sideways
      const half = (horizontal ? frame.size[1] : frame.size[0]) / 2 + 1.2;
      const cy = horizontal ? frame.center[1] : 0;
      for (let bst = 200; bst <= 700; bst += 100) {
        const v = bstToY(bst);
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
        mat.userData.target = bst === 600 ? 0.16 : 0.08;
        const ends = horizontal
          ? [new THREE.Vector3(v, cy - half, 0), new THREE.Vector3(v, cy + half, 0)]
          : [new THREE.Vector3(-half, v, 0), new THREE.Vector3(half, v, 0)];
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ends), mat));
        materials.push(mat);
        const el = document.createElement('div');
        el.style.opacity = 0;
        el.innerHTML = `<div class="axis-label">${bst === 700 ? '700 BST' : bst}</div>`;
        const obj = new CSS2DObject(el);
        if (horizontal) obj.position.set(v, cy - half - 0.8, 0);
        else obj.position.set(-half - 0.6, v, 0);
        group.add(obj);
        labels.push(el);
      }
    }
    return { group, materials, labels, stats, t: 0, dir: 1 };
  }

  // Recompute each group's count / average for the visible Pokémon and move rings,
  // recolour tiles and rewrite labels to match.
  applyFilter(mask, active) {
    this.mask = mask;
    this.filterActive = active;
    const built = this.current;
    if (!built) return;
    for (const h of built.stats) {
      const { g } = h;
      let n = 0, sum = 0;
      for (const i of g.members) if (!mask || mask[i]) { n++; sum += this.pokemon[i].bst; }
      const mean = n ? sum / n : null;
      if (h.nums) {
        h.nums.textContent = !n ? '' : `${g.compact ? '' : `${n} · `}avg ${Math.round(mean)}`;
        h.labelEl.classList.toggle('empty', !n);
      }
      if (h.ring) {
        const v = mean == null ? 0 : bstToY(mean);
        if (h.horizontal) h.ring.position.set(v, g.y, g.z);
        else h.ring.position.set(g.x, v, g.z);
        h.ring.visible = n > 0;
      }
      if (h.tile) {
        h.tile.color.copy(n ? heatColor(mean) : EMPTY);
        // tiles built on very few Pokémon are drawn fainter: their average is noisy
        h.tile.userData.target = n ? (n >= 3 ? 0.55 : 0.3) : 0.2;
        if (built.t >= 1) h.tile.opacity = h.tile.userData.target;
      }
    }
  }

  fade(built, dir) {
    built.dir = dir;
    if (dir < 0) built.t = Math.min(built.t, 1);
    if (!this.fading.includes(built)) this.fading.push(built);
  }

  update(dt) {
    for (const b of [...this.fading]) {
      b.t += (dt / 0.5) * b.dir;
      const k = Math.min(1, Math.max(0, b.t));
      for (const m of b.materials) m.opacity = (m.userData.target ?? 0.9) * k;
      for (const el of b.labels) el.style.opacity = k;
      if (b.dir > 0 && b.t >= 1) this.fading.splice(this.fading.indexOf(b), 1);
      if (b.dir < 0 && b.t <= 0) {
        this.fading.splice(this.fading.indexOf(b), 1);
        this.scene.remove(b.group);
        b.group.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
          if (o.isCSS2DObject) o.element.remove();
        });
      }
    }
  }
}
