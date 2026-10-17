// Camera modes: chase, cockpit, padlock (target), cinematic flyby, orbit.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export const CAMERA_MODES = ['chase', 'cockpit', 'padlock', 'flyby', 'orbit'];
const LABELS = { chase: 'CHASE VIEW', cockpit: 'COCKPIT VIEW', padlock: 'PADLOCK VIEW', flyby: 'CINEMATIC VIEW', orbit: 'ORBIT VIEW', weapon: 'WEAPON CAM' };

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.target = null;
    this.lookTarget = null;
    this.smoothQ = new THREE.Quaternion();
    this.smoothPos = new THREE.Vector3();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.orbitYaw = 0.6;
    this.orbitPitch = 0.25;
    this.orbitDist = 40;
    this.flybyPos = new THREE.Vector3();
    this.flybyTimer = 0;
    this.shake = 0;
    this.baseFov = 65;
    this.fov = 65;
    this.time = 0;
    this.initialized = false;
    this.weapon = null;
    this.weaponHold = 0;
    this.prevMode = 'chase';
    this.weaponPos = new THREE.Vector3();
  }

  // ride along behind a missile until it detonates, then return
  followWeapon(m) {
    if (!m) return;
    if (this.mode !== 'weapon') this.prevMode = this.mode;
    this.weapon = m;
    this.weaponHold = 1.8;
    this.mode = 'weapon';
    if (this.target) this.target.model.setCockpitView(false);
  }

  setTarget(ac) {
    this.target = ac;
    this.initialized = false;
  }

  setMode(mode) {
    this.mode = mode;
    this.initialized = false;
    this.lookYaw = this.lookPitch = 0;
    if (this.target) this.target.model.setCockpitView(mode === 'cockpit');
    return LABELS[mode];
  }

  cycle() {
    const i = CAMERA_MODES.indexOf(this.mode);
    return this.setMode(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
  }

  update(dt, input, map, extraShake = 0) {
    const ac = this.target;
    const cam = this.camera;
    if (!ac) return;
    this.time += dt;
    const pos = ac.root.position;
    const quat = ac.root.quaternion;
    const len = ac.model.length;
    if (!this.initialized) {
      this.smoothQ.copy(quat);
      this.smoothPos.copy(pos);
      this.initialized = true;
      this.flybyTimer = 0;
    }
    // head look input
    if (input) {
      if (input.mouseLook || input.look) {
        this.lookYaw = THREE.MathUtils.clamp(this.lookYaw - input.lookX * (input.look ? dt * 2.5 : 1), -2.6, 2.6);
        this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - input.lookY * (input.look ? dt * 2.5 : 1), -1.2, 1.4);
        input.lookX = 0;
        input.lookY = 0;
      } else if (this.mode !== 'orbit') {
        this.lookYaw *= Math.max(0, 1 - dt * 3);
        this.lookPitch *= Math.max(0, 1 - dt * 3);
      }
    }
    const speed = ac.fm.airspeed;
    let near = 0.8;
    if (this.mode === 'weapon') {
      const m = this.weapon;
      if (m && m.alive) {
        _v.copy(m.vel).normalize();
        this.weaponPos.copy(m.pos);
        cam.position.copy(m.pos).addScaledVector(_v, -16).add(_w.set(0, 2.5, 0));
        const look = m.target && m.target.position ? m.target.position : _w.copy(m.pos).addScaledVector(_v, 80);
        cam.up.set(0, 1, 0);
        cam.lookAt(m.target && m.pos.distanceTo(look) < 3000 ? look : _w.copy(m.pos).addScaledVector(_v, 80));
      } else {
        this.weaponHold -= dt;
        cam.up.set(0, 1, 0);
        cam.lookAt(this.weaponPos);
        if (this.weaponHold <= 0) {
          this.setMode(this.prevMode || 'chase');
          this.weapon = null;
        }
      }
      near = 0.5;
    }
    switch (this.mode) {
      case 'cockpit': {
        near = 0.08;
        ac.worldPoint(ac.model.eye, _v);
        // G pushes the head down a little
        const g = ac.fm.gLoad;
        _v.addScaledVector(_w.set(0, 1, 0).applyQuaternion(quat), -Math.min(0.06, Math.max(-0.04, (g - 1) * 0.008)));
        cam.position.copy(_v);
        _e.set(this.lookPitch + (ac.model.cockpitView?.pitch || 0), this.lookYaw, 0, 'YXZ');
        _q.setFromEuler(_e);
        cam.quaternion.copy(quat).multiply(_q);
        break;
      }
      case 'padlock': {
        const tgt = this.lookTarget && this.lookTarget.alive !== false ? this.lookTarget : null;
        if (tgt) {
          _v.subVectors(tgt.position, pos).normalize();
          const up = _w.set(0, 1, 0).applyQuaternion(quat);
          const desired = _q.setFromRotationMatrix(_m.lookAt(pos.clone().addScaledVector(_v, -1), pos, up));
          this.smoothQ.slerp(desired, 1 - Math.exp(-dt * 5));
          const back = len * 2.2 + 8;
          cam.position.copy(pos).addScaledVector(_v, -back).addScaledVector(up, len * 0.35 + 2);
          cam.quaternion.copy(this.smoothQ);
          break;
        }
      }
      // falls through to chase when no padlock target
      // eslint-disable-next-line no-fallthrough
      case 'chase': {
        const k = 1 - Math.exp(-dt * 7.5);
        this.smoothQ.slerp(quat, k);
        const dist = len * 1.45 + 7 + Math.min(10, speed / 60);
        const height = len * 0.2 + 1.6;
        _e.set(this.lookPitch * 0.8 - 0.06, this.lookYaw, 0, 'YXZ');
        _q.setFromEuler(_e);
        _q2.copy(this.smoothQ).multiply(_q);
        _v.set(0, height, dist).applyQuaternion(_q2);
        cam.position.copy(pos).add(_v);
        cam.quaternion.copy(_q2);
        // slight look-down onto the aircraft
        _q.setFromAxisAngle(_w.set(1, 0, 0), -0.04);
        cam.quaternion.multiply(_q);
        break;
      }
      case 'flyby': {
        this.flybyTimer -= dt;
        const d = this.flybyPos.distanceTo(pos);
        if (this.flybyTimer <= 0 || d > 900) {
          _v.copy(ac.velocity).normalize();
          if (_v.lengthSq() < 0.5) _v.set(0, 0, -1).applyQuaternion(quat);
          const side = _w.crossVectors(_v, UP).normalize();
          this.flybyPos.copy(pos).addScaledVector(_v, Math.max(120, speed * 2.6)).addScaledVector(side, (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 30)).addScaledVector(UP, (Math.random() - 0.3) * 20);
          const gh = map.surfaceAt(this.flybyPos.x, this.flybyPos.z);
          if (this.flybyPos.y < gh + 6) this.flybyPos.y = gh + 6;
          this.flybyTimer = 7;
        }
        cam.position.copy(this.flybyPos);
        cam.up.set(0, 1, 0);
        cam.lookAt(pos);
        near = 1;
        break;
      }
      case 'orbit': {
        if (input && (input.mouseLook || input.look)) {
          this.orbitYaw = this.lookYaw;
          this.orbitPitch = this.lookPitch;
        }
        const dist = len * 2.2 + 12;
        _e.set(-this.orbitPitch - 0.15, this.orbitYaw + Math.PI * 0.85, 0, 'YXZ');
        _q.setFromEuler(_e);
        _v.set(0, 0, dist).applyQuaternion(_q);
        cam.position.copy(pos).add(_v);
        cam.up.set(0, 1, 0);
        cam.lookAt(pos);
        break;
      }
      default:
        break;
    }
    // keep above the ground
    const gh = map.surfaceAt(cam.position.x, cam.position.z, cam.position.y) + 1.2;
    if (cam.position.y < gh) cam.position.y = gh;

    // shake: gunfire, afterburner, high G, buffet, explosions
    const ab = ac.fm.afterburner;
    const buffet = Math.max(0, Math.abs(ac.fm.alpha) - 0.3) * 2 + (ac.fm.mach > 0.92 && ac.fm.mach < 1.05 ? 0.4 : 0);
    let s = this.shake + extraShake + (ac.gunFiring ? 0.35 : 0) + ab * 0.08 + buffet * 0.3;
    if (this.mode === 'flyby' || this.mode === 'orbit') s *= 0.3;
    if (s > 0.001) {
      const t = this.time;
      const amp = s * 0.004;
      _e.set(Math.sin(t * 61) * amp + Math.sin(t * 23) * amp, Math.sin(t * 47) * amp, Math.sin(t * 37) * amp * 0.5);
      _q.setFromEuler(_e);
      cam.quaternion.multiply(_q);
    }
    this.shake = Math.max(0, this.shake - dt * 2);

    // speed-based FOV for a sense of speed
    const targetFov = this.mode === 'cockpit' ? this.baseFov + (ac.model.cockpitView?.fov ?? 5) : this.baseFov + Math.min(12, speed / 40) + ab * 3;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 2);
    if (Math.abs(cam.fov - this.fov) > 0.01 || cam.near !== near) {
      cam.fov = this.fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }
}
