// Backdrop: a full-screen shader drawn behind the chart. Slowly drifting nebula clouds,
// a faint dot grid (graph paper for the charts) that drifts a little as you pan, sparse
// twinkling stars and a vignette. Its colours follow a "mood" that story chapters set,
// cross-fading as you scroll.
import * as THREE from 'three';

// Two nebula colours per mood. Kept dark: the sprites must stay the brightest thing.
const MOODS = {
  default: ['#1b2a6b', '#4d1d63'],
  core: ['#12344f', '#2a1b55'],
  paradox: ['#0d4f5c', '#5c104f'],
  gold: ['#5c3f0a', '#3d1a4d'],
  types: ['#4a2a12', '#13304f'],
  dragon: ['#2c1a75', '#0f2f5c'],
};

export class Backdrop {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPan: { value: new THREE.Vector2() },
      uDpr: { value: 1 },
      uColA: { value: new THREE.Color(MOODS.default[0]) },
      uColB: { value: new THREE.Color(MOODS.default[1]) },
    };
    this.targetA = this.uniforms.uColA.value.clone();
    this.targetB = this.uniforms.uColB.value.clone();
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uRes, uPan;
        uniform float uDpr;
        uniform vec3 uColA, uColB;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int k = 0; k < 5; k++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
          return v;
        }

        void main() {
          vec2 frag = gl_FragCoord.xy;
          vec2 uv = frag / uRes.y;                 // aspect-correct, 1 unit = screen height
          vec2 pan = uPan * 0.015;                 // far layer: barely moves when panning
          float t = uTime * 0.015;

          // nebula: two layers of domain-warped noise, coloured between the mood colours
          vec2 q = uv * 1.6 + pan;
          vec2 warp = vec2(fbm(q + vec2(t, -t)), fbm(q + vec2(-t * 0.7, t * 1.3) + 4.1));
          float n = fbm(q + 1.8 * warp);
          float clouds = smoothstep(0.38, 0.95, n);
          vec3 neb = mix(uColA, uColB, smoothstep(0.2, 0.8, warp.x)) * clouds * 0.9;

          // (linear colour values: they are converted to sRGB on output)
          vec3 col = vec3(0.0035, 0.004, 0.008) + neb;

          // dot grid every 34px, drifting a little with the pan (mid layer)
          vec2 g = fract((frag + uPan * 6.0) / (34.0 * uDpr)) - 0.5;
          col += vec3(0.55, 0.6, 0.85) * smoothstep(0.075, 0.035, length(g)) * 0.014;

          // sparse twinkling stars on a 3px lattice
          vec2 cell = floor((frag + uPan * 2.0) / (3.0 * uDpr));
          float h = hash(cell);
          if (h > 0.9975) {
            float tw = 0.5 + 0.5 * sin(uTime * (1.0 + 3.0 * fract(h * 91.0)) + h * 60.0);
            col += vec3(0.8, 0.85, 1.0) * tw * 0.55;
          }

          // vignette
          vec2 c = frag / uRes - 0.5;
          col *= 1.0 - 0.55 * dot(c, c) * 1.6;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setMood(name) {
    const [a, b] = MOODS[name] ?? MOODS.default;
    this.targetA.set(a);
    this.targetB.set(b);
  }

  // pan: the chart camera's target (world units), for parallax
  update(dt, elapsed, renderer, pan) {
    const u = this.uniforms;
    u.uTime.value = elapsed;
    renderer.getDrawingBufferSize(u.uRes.value);
    u.uDpr.value = renderer.getPixelRatio();
    u.uPan.value.set(pan.x, pan.y).multiplyScalar(u.uDpr.value * 10);
    const k = Math.min(1, dt * 1.2); // ~1.5s cross-fade between moods
    u.uColA.value.lerp(this.targetA, k);
    u.uColB.value.lerp(this.targetB, k);
  }
}
