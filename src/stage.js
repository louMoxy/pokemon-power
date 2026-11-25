// Renderer, camera, controls, resize and the render loop. Views register per-frame
// callbacks with stage.onFrame(fn) where fn(dt, elapsed) runs before each render.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // HTML labels positioned in the scene (group names, axis ticks). Click-through.
    this.labels = new CSS2DRenderer();
    this.labels.domElement.id = 'labels';
    canvas.after(this.labels.domElement);
    this.scene = new THREE.Scene();
    // Flat charts need no depth fade; the fog object stays because the sprite shader
    // includes three.js's fog chunks.
    this.scene.fog = new THREE.FogExp2(0x0b0d14, 0);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(0, 0, 30);

    // Flat charts: drag to pan, wheel / pinch to zoom towards the cursor. No orbiting.
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.minDistance = 2;
    this.controls.maxDistance = 100;
    // user input cancels any camera flight in progress
    this.controls.addEventListener('start', () => { this.cameraTween = null; });

    this.callbacks = [];
    this.clock = new THREE.Clock();
    this.cameraTween = null;
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  onFrame(fn) { this.callbacks.push(fn); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Smoothly move the camera and its target. Interrupted by user input.
  flyTo(target, position, duration = 1.2) {
    this.cameraTween = {
      t: 0, duration,
      fromTarget: this.controls.target.clone(), toTarget: target.clone(),
      fromPos: this.camera.position.clone(), toPos: position.clone(),
    };
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const tw = this.cameraTween;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      if (tw.t >= 1) this.cameraTween = null;
    }
    for (const fn of this.callbacks) fn(dt, this.clock.elapsedTime);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
