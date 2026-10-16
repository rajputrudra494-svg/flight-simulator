// Targeting-pod camera: renders a zoomed, stabilised view of the selected
// target into a small render target. Outside the cockpit it is shown as a
// picture-in-picture "TGP" window; in the cockpit it feeds the centre display.
import * as THREE from 'three';
import { updateAtmosphereCamera } from '../world/atmosphere.js';
import { makeTgpMaterial } from '../aircraft/Cockpit.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class TargetCam {
  constructor(renderer) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(4, 4 / 3, 1, 60000);
    this.rt = new THREE.WebGLRenderTarget(384, 288, { type: THREE.HalfFloatType });
    this.mat = makeTgpMaterial();
    this.mat.uniforms.tVideo.value = this.rt.texture;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.screenScene = new THREE.Scene();
    this.screenScene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.active = false;
    this.zoom = 1;
    this.time = 0;
    this.frame = 0;
    this.rect = null; // CSS pixel rect of the picture-in-picture window
    this.target = null;
  }

  // renders the pod view; returns true when there is a picture
  update(dt, scene, player, target, mainCamera) {
    this.time += dt;
    this.active = false;
    this.target = target;
    if (!player || !target || target.alive === false || !player.alive) return false;
    const cam = this.camera;
    // the pod hangs under the jet and looks straight at the target
    _v.subVectors(target.position, player.position);
    const dist = _v.length();
    if (dist < 30 || dist > 40000) return false;
    _v.divideScalar(dist);
    cam.position.copy(player.position).addScaledVector(_v, player.model.length * 0.8 + 6).add(_w.set(0, -2, 0));
    const size = Math.max(14, (target.radius || 8) * (target.kind === 'air' ? 5 : 9));
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(size / dist));
    this.zoom = THREE.MathUtils.clamp(60 / fov, 1, 400);
    cam.fov = THREE.MathUtils.clamp(fov, 0.15, 30);
    cam.near = Math.max(1, Math.min(dist * 0.5, 200));
    cam.far = dist + 30000;
    cam.up.set(0, 1, 0);
    cam.lookAt(target.position);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // the pod updates at 30 Hz to stay cheap
    this.frame++;
    if (this.frame % 2 === 0 || !this._hasFrame) {
      const r = this.renderer;
      const prevShadow = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      updateAtmosphereCamera(cam);
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(scene, cam);
      r.setRenderTarget(null);
      updateAtmosphereCamera(mainCamera);
      r.shadowMap.autoUpdate = prevShadow;
      this._hasFrame = true;
    }
    this.mat.uniforms.uTime.value = this.time;
    this.active = true;
    return true;
  }

  // draw the picture-in-picture window at a CSS-pixel rect (top-left origin)
  present(rect) {
    if (!this.active) return;
    this.rect = rect;
    const r = this.renderer;
    const h = r.domElement.clientHeight || window.innerHeight;
    r.setScissorTest(true);
    r.setScissor(rect.x, h - rect.y - rect.h, rect.w, rect.h);
    r.setViewport(rect.x, h - rect.y - rect.h, rect.w, rect.h);
    const ac = r.autoClear;
    r.autoClear = false;
    r.render(this.screenScene, this.ortho);
    r.autoClear = ac;
    r.setScissorTest(false);
    r.setViewport(0, 0, r.domElement.clientWidth || window.innerWidth, h);
  }

  get texture() {
    return this.active ? this.rt.texture : null;
  }

  dispose() {
    this.rt.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}
