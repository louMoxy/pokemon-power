// CPU picking for the sprite field: project every sprite to screen space and hit-test
// its rectangle. ~1,000 projections per frame is far cheaper than GPU picking and
// always matches the animated positions (SpriteField.positionOf mirrors the shader).
import * as THREE from 'three';

export class Picker {
  constructor(stage, field) {
    this.stage = stage;
    this.field = field;
    this.pointer = null; // {x, y} in CSS pixels, null when outside the canvas
    const el = stage.renderer.domElement;
    el.addEventListener('pointermove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerleave', () => { this.pointer = null; });
    this._v = new THREE.Vector3();
  }

  // Index of the front-most visible sprite under (x, y), or -1. With slop > 0 (touch),
  // a miss falls back to the sprite whose centre is nearest, within slop pixels.
  pick(x, y, slop = 0) {
    const { camera } = this.stage;
    const el = this.stage.renderer.domElement;
    const w = el.clientWidth, h = el.clientHeight;
    const view = camera.matrixWorldInverse;
    const p = camera.projectionMatrix.elements;
    let best = -1, bestDepth = Infinity;
    let near = -1, nearDist = slop;
    for (let i = 0; i < this.field.count; i++) {
      if (this.field.visibility(i) < 0.5) continue; // hidden by filters
      const v = this.field.positionOf(i, this._v).applyMatrix4(view);
      const depth = -v.z;
      if (depth < camera.near) continue;
      // perspective projection to CSS pixels
      const cx = ((p[0] * v.x) / depth + 1) * 0.5 * w;
      const cy = (1 - (p[5] * v.y) / depth) * 0.5 * h;
      const pxPerUnit = (p[5] / depth) * 0.5 * h;
      const [hx, hy] = this.field.halfSize(i);
      if (depth < bestDepth && Math.abs(x - cx) <= hx * pxPerUnit && Math.abs(y - cy) <= hy * pxPerUnit) {
        best = i; bestDepth = depth;
      }
      if (slop > 0) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < nearDist) { near = i; nearDist = d; }
      }
    }
    return best >= 0 ? best : near;
  }

  // Pick under the current pointer (for hover)
  hovered() {
    return this.pointer ? this.pick(this.pointer.x, this.pointer.y) : -1;
  }
}
