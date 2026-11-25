// SpriteField: every Pokémon as a camera-facing sprite, drawn in one instanced call.
// - Each quad is cropped to the sprite's trimmed pixels in the atlas and sized to them,
//   so small Pokémon look small and there is no wasted transparent fill.
// - Positions morph between layouts on the GPU (aFrom -> aTo) with a per-instance delay;
//   the same easing runs on the CPU so picking always matches what is on screen.
// - Visibility (filters) morphs with the same clock: hidden sprites shrink away in place
//   while the visible ones glide to their new layout.
// - Hover / selection are uniforms, so they never require rebuilding geometry.
import * as THREE from 'three';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class SpriteField {
  constructor(pokemon, meta, atlas) {
    this.pokemon = pokemon;
    this.count = pokemon.length;
    const n = this.count;
    const { cell, cols, width: W, height: H } = meta.atlas;

    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.instanceCount = n;

    this.from = new Float32Array(n * 3);
    this.to = new Float32Array(n * 3);
    this.delay = new Float32Array(n);
    this.visFrom = new Float32Array(n).fill(1);
    this.visTo = new Float32Array(n).fill(1);
    const uvRect = new Float32Array(n * 4);
    const size = new Float32Array(n * 2);
    const scale = new Float32Array(n);
    const index = new Float32Array(n);

    pokemon.forEach((p, i) => {
      const [w, h] = p.spriteSize;
      const col = p.atlas % cols, row = Math.floor(p.atlas / cols);
      // Must match build-derived.mjs: centred horizontally, bottom-aligned in its cell
      const x0 = col * cell + Math.floor((cell - w) / 2);
      const yTop = row * cell + (cell - h);
      uvRect.set([x0 / W, 1 - (yTop + h) / H, (x0 + w) / W, 1 - yTop / H], i * 4);
      size.set([w / cell, h / cell], i * 2);
      scale[i] = 0.7 + ((p.bst - 175) / (720 - 175)) * 0.9; // BST drives size
      index[i] = i;
    });
    this.size = size;
    this.scale = scale;

    this.attr = {
      from: new THREE.InstancedBufferAttribute(this.from, 3),
      to: new THREE.InstancedBufferAttribute(this.to, 3),
      delay: new THREE.InstancedBufferAttribute(this.delay, 1),
      visFrom: new THREE.InstancedBufferAttribute(this.visFrom, 1),
      visTo: new THREE.InstancedBufferAttribute(this.visTo, 1),
    };
    geo.setAttribute('aFrom', this.attr.from);
    geo.setAttribute('aTo', this.attr.to);
    geo.setAttribute('aDelay', this.attr.delay);
    geo.setAttribute('aVisFrom', this.attr.visFrom);
    geo.setAttribute('aVisTo', this.attr.visTo);
    geo.setAttribute('aUvRect', new THREE.InstancedBufferAttribute(uvRect, 4));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scale, 1));
    geo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(index, 1));

    // Fog uniforms (fogColor/fogDensity/fogNear/fogFar) are filled in by three.js
    this.uniforms = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uMap: { value: atlas },
      uT: { value: 1 },
      uStagger: { value: 0 },
      uHover: { value: -1 },
      uSelected: { value: -1 },
      uTime: { value: 0 },
      uSizeMul: { value: 1.05 },
    });

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true,
      vertexShader: /* glsl */ `
        attribute vec3 aFrom;
        attribute vec3 aTo;
        attribute float aDelay;
        attribute float aVisFrom;
        attribute float aVisTo;
        attribute vec4 aUvRect;
        attribute vec2 aSize;
        attribute float aScale;
        attribute float aIndex;
        uniform float uT, uStagger, uHover, uSelected, uTime, uSizeMul;
        varying vec2 vUv;
        varying float vFocus;
        #include <fog_pars_vertex>

        float ease(float t) { return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0; }

        void main() {
          float t = clamp((uT - aDelay * uStagger) / max(1.0 - uStagger, 1e-4), 0.0, 1.0);
          float e = ease(t);
          vec3 center = mix(aFrom, aTo, e);
          float vis = mix(aVisFrom, aVisTo, e);

          float hovered = 1.0 - step(0.5, abs(aIndex - uHover));
          float selected = 1.0 - step(0.5, abs(aIndex - uSelected));
          vFocus = max(hovered, selected);

          float s = aScale * uSizeMul * (1.0 + 0.3 * vFocus) * vis;
          vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
          // little hop on the hovered sprite
          mvPosition.y += hovered * abs(sin(uTime * 6.0)) * 0.12 * s;
          mvPosition.xy += position.xy * aSize * s;   // billboard: offset in view space
          gl_Position = projectionMatrix * mvPosition;

          vUv = mix(aUvRect.xy, aUvRect.zw, uv);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vFocus;
        #include <fog_pars_fragment>
        void main() {
          vec4 c = texture2D(uMap, vUv);
          if (c.a < 0.5) discard;
          vec3 col = c.rgb;
          col *= 1.0 + 0.25 * vFocus;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; // instances move outside the base quad's bounds
    this.anim = null;
    this.sizeTarget = this.uniforms.uSizeMul.value;
    this.baseSize = this.uniforms.uSizeMul.value;
  }

  // Eased morph progress of sprite i (mirrors the vertex shader).
  progress(i) {
    const u = this.uniforms;
    const span = Math.max(1 - u.uStagger.value, 1e-4);
    return easeInOutCubic(Math.min(1, Math.max(0, (u.uT.value - this.delay[i] * u.uStagger.value) / span)));
  }

  // Current visibility 0..1 of sprite i (1 = fully shown).
  visibility(i) {
    return this.visFrom[i] + (this.visTo[i] - this.visFrom[i]) * this.progress(i);
  }

  // Current on-screen position of sprite i (mirrors the vertex shader).
  positionOf(i, out = new THREE.Vector3()) {
    const e = this.progress(i), k = i * 3;
    return out.set(
      this.from[k] + (this.to[k] - this.from[k]) * e,
      this.from[k + 1] + (this.to[k + 1] - this.from[k + 1]) * e,
      this.from[k + 2] + (this.to[k + 2] - this.from[k + 2]) * e,
    );
  }

  // Jump straight to a layout (no animation).
  setLayout(positions) {
    this.from.set(positions);
    this.to.set(positions);
    this.uniforms.uT.value = 1;
    this.attr.from.needsUpdate = this.attr.to.needsUpdate = true;
  }

  // Animate to a layout. delays: optional Float32Array in [0,1] (e.g. by generation).
  // visible: optional 0/1 mask; hidden sprites shrink away where they currently are.
  morphTo(positions, { duration = 1.6, stagger = 0.35, delays = null, visible = null } = {}) {
    const v = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      this.from.set(this.positionOf(i, v).toArray(), i * 3);
      this.visFrom[i] = this.visibility(i);
    }
    for (let i = 0; i < this.count; i++) {
      const show = visible ? visible[i] : 1;
      this.visTo[i] = show;
      // hidden: stay put and shrink; shown: go to the new layout position
      const k = i * 3;
      if (show) { this.to[k] = positions[k]; this.to[k + 1] = positions[k + 1]; this.to[k + 2] = positions[k + 2]; }
      else { this.to[k] = this.from[k]; this.to[k + 1] = this.from[k + 1]; this.to[k + 2] = this.from[k + 2]; }
    }
    this.attr.visFrom.needsUpdate = this.attr.visTo.needsUpdate = true;
    // fewer sprites on screen -> room to draw them bigger (up to 1.8x)
    const shown = visible ? visible.reduce((a, b) => a + b, 0) : this.count;
    this.sizeTarget = this.baseSize * Math.min(1.8, Math.pow(this.count / Math.max(1, shown), 0.15));
    if (delays) this.delay.set(delays);
    else for (let i = 0; i < this.count; i++) this.delay[i] = Math.random();
    this.attr.from.needsUpdate = this.attr.to.needsUpdate = this.attr.delay.needsUpdate = true;
    this.uniforms.uT.value = 0;
    this.uniforms.uStagger.value = stagger;
    this.anim = { duration };
  }

  // World-space half extents of sprite i (for picking and camera framing).
  halfSize(i) {
    const s = this.scale[i] * this.uniforms.uSizeMul.value * 0.5;
    return [this.size[i * 2] * s, this.size[i * 2 + 1] * s];
  }

  update(dt, elapsed) {
    this.uniforms.uTime.value = elapsed;
    const sm = this.uniforms.uSizeMul;
    sm.value += (this.sizeTarget - sm.value) * Math.min(1, dt * 4);
    if (this.anim) {
      this.uniforms.uT.value = Math.min(1, this.uniforms.uT.value + dt / this.anim.duration);
      if (this.uniforms.uT.value >= 1) this.anim = null;
    }
  }
}
