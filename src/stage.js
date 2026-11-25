// Renderer, camera, controls, resize and the render loop. Views register per-frame
// callbacks with stage.onFrame(fn) where fn(dt, elapsed) runs before each render.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0d14, 0.018); // depth cue: far sprites fade
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(0, 4, 30);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 100;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    // Stop idling rotation as soon as the user touches the scene
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });

    this.callbacks = [];
    this.clock = new THREE.Clock();
    this.cameraTween = null;
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  get viewportHeight() { return this.renderer.domElement.clientHeight; }

  onFrame(fn) { this.callbacks.push(fn); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Smoothly move the camera and orbit target. Interrupted by user input.
  flyTo(target, position, duration = 1.2) {
    this.controls.autoRotate = false;
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
  }
}
