// High-level visual effects built on the particle and trail systems, plus
// camera shake impulses and audio hooks.
import * as THREE from 'three';
import { Particles } from './Particles.js';

const _v = new THREE.Vector3();

export class Effects {
  constructor(battle, quality) {
    this.battle = battle;
    this.particles = new Particles(battle.scene, quality);
    this.shake = 0;
    this.lowQuality = quality.particles < 1200;
    // a dynamic light costs a little on every lit pixel, so only on capable GPUs
    this.flashLight = this.lowQuality ? null : new THREE.PointLight(0xffaa55, 0, 600, 1.6);
    if (this.flashLight) battle.scene.add(this.flashLight);
    this.flashT = 0;
  }

  _shakeFrom(pos, strength) {
    const cam = this.battle.camera;
    if (!cam) return;
    const d = cam.position.distanceTo(pos);
    this.shake = Math.max(this.shake, strength * Math.max(0, 1 - d / 1500));
  }

  _flash(pos, intensity) {
    if (!this.flashLight) return;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = intensity;
    this.flashT = 0.25;
  }

  explosion(pos, scale = 1) {
    this.particles.explosion(pos, scale);
    this._shakeFrom(pos, 0.8 * scale);
    this._flash(pos, 4000 * scale);
    this.battle.audio?.explosion(pos, scale);
  }

  bigExplosion(pos, vel, scale = 1.5) {
    this.particles.explosion(pos, scale, vel);
    // burning debris
    const p = this.particles;
    for (let i = 0; i < 8; i++) {
      const vx = vel.x * 0.5 + (Math.random() - 0.5) * 80;
      const vy = vel.y * 0.5 + Math.random() * 50;
      const vz = vel.z * 0.5 + (Math.random() - 0.5) * 80;
      for (let k = 0; k < 6; k++) {
        p.fire.emit({ x: pos.x, y: pos.y, z: pos.z, vx: vx * (1 - k * 0.08), vy: vy * (1 - k * 0.08), vz: vz * (1 - k * 0.08), life: 1.5 + k * 0.25, size0: 3, size1: 1, color0: [5, 2.5, 0.8, 1], color1: [1, 0.3, 0.05, 0], cell: 1, drag: 0.4, gravity: 9.8 });
      }
    }
    this._shakeFrom(pos, 1.2 * scale);
    this._flash(pos, 9000 * scale);
    this.battle.audio?.explosion(pos, scale * 1.4);
  }

  groundExplosion(pos, scale = 1) {
    this.particles.explosion(pos, scale);
    const p = this.particles;
    // dirt column
    for (let i = 0; i < 14; i++) {
      p.smoke.emit({ x: pos.x + (Math.random() - 0.5) * 6 * scale, y: pos.y, z: pos.z + (Math.random() - 0.5) * 6 * scale, vx: (Math.random() - 0.5) * 20, vy: 20 + Math.random() * 40 * scale, vz: (Math.random() - 0.5) * 20, life: 2 + Math.random() * 2, size0: 6 * scale, size1: 22 * scale, color0: [0.35, 0.3, 0.24, 0.9], color1: [0.5, 0.46, 0.4, 0], cell: 0, drag: 1.2, gravity: 6 });
    }
    this._shakeFrom(pos, 1.0 * scale);
    this._flash(pos, 6000 * scale);
    this.battle.audio?.explosion(pos, scale * 1.2);
  }

  hit(pos, vel) {
    this.particles.hitSparks(pos, vel);
    this.battle.audio?.hit(pos);
  }

  groundImpact(pos, water) {
    this.particles.groundImpact(pos, water);
  }

  motor(pos) {
    this.particles.fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.06, size0: 2.6, size1: 1.6, color0: [6, 4.5, 2.5, 1], color1: [3, 1, 0.3, 0], cell: 2, drag: 0 });
  }

  flare(pos, strength) {
    const p = this.particles;
    p.fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.08, size0: 5 * strength + 1, size1: 3, color0: [8, 6, 4, 1], color1: [4, 2, 1, 0], cell: 2, drag: 0 });
    if (Math.random() < 0.6) p.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: 0, vy: 1, vz: 0, life: 2.2, size0: 1.2, size1: 5, color0: [0.95, 0.95, 0.95, 0.5], color1: [1, 1, 1, 0], cell: 0, drag: 0.8 });
  }

  burning(pos, vel, strength) {
    const p = this.particles;
    p.fire.emit({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x * 0.6, vy: vel.y * 0.6, vz: vel.z * 0.6, life: 0.35, size0: 2.5 * strength, size1: 5 * strength, color0: [5, 2.2, 0.6, 1], color1: [1, 0.2, 0, 0], cell: 1, drag: 3 });
    if (Math.random() < 0.6) p.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x * 0.3, vy: vel.y * 0.3 + 2, vz: vel.z * 0.3, life: 3.5, size0: 3 * strength, size1: 14 * strength, color0: [0.1, 0.1, 0.1, 0.7], color1: [0.25, 0.25, 0.25, 0], cell: 0, drag: 1.5, gravity: -0.8 });
  }

  // persistent smoke column from a destroyed ground target
  smokeColumn(pos) {
    const p = this.particles;
    p.smoke.emit({ x: pos.x + (Math.random() - 0.5) * 4, y: pos.y + 2, z: pos.z + (Math.random() - 0.5) * 4, vx: 2 + Math.random() * 2, vy: 6 + Math.random() * 4, vz: 1, life: 9, size0: 5, size1: 38, color0: [0.08, 0.08, 0.08, 0.6], color1: [0.3, 0.3, 0.3, 0], cell: 0, drag: 0.3 });
    if (Math.random() < 0.3) p.fire.emit({ x: pos.x + (Math.random() - 0.5) * 4, y: pos.y + 1, z: pos.z + (Math.random() - 0.5) * 4, vx: 0, vy: 4, vz: 0, life: 0.6, size0: 4, size1: 6, color0: [5, 2, 0.5, 1], color1: [1, 0.2, 0, 0], cell: 1, drag: 1 });
  }

  // Breaking the sound barrier: a condensation collar that is shed behind the
  // airframe plus an expanding shock ring. The boom itself is heard wherever
  // the Mach cone sweeps over the listener (see Battle.update).
  sonicBoom(ac) {
    const p = this.particles;
    const pos = ac.position, vel = ac.velocity;
    const speed = vel.length() || 1;
    const fwd = _v.copy(vel).divideScalar(speed);
    const len = ac.model.length;
    const r0 = Math.max(ac.model.maxWidth * 1.6, ac.model.span * 0.32);
    // two perpendicular axes around the flight direction
    const a = new THREE.Vector3(0, 1, 0).cross(fwd);
    if (a.lengthSq() < 1e-4) a.set(1, 0, 0);
    a.normalize();
    const b = new THREE.Vector3().crossVectors(fwd, a);
    const n = this.lowQuality ? 26 : 56;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const dx = a.x * Math.cos(th) + b.x * Math.sin(th);
      const dy = a.y * Math.cos(th) + b.y * Math.sin(th);
      const dz = a.z * Math.cos(th) + b.z * Math.sin(th);
      const back = (Math.random() * 0.5) * len;
      p.smoke.emit({
        x: pos.x + dx * r0 - fwd.x * back, y: pos.y + dy * r0 - fwd.y * back, z: pos.z + dz * r0 - fwd.z * back,
        vx: vel.x * 0.92 + dx * 26, vy: vel.y * 0.92 + dy * 26, vz: vel.z * 0.92 + dz * 26,
        life: 0.9 + Math.random() * 0.7, size0: len * 0.18, size1: len * 0.75,
        color0: [1.25, 1.27, 1.32, 0.75], color1: [1.3, 1.3, 1.35, 0], cell: 0, drag: 3.5,
      });
    }
    // shock ring and flash travelling with the aircraft
    p.fire.emit({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x * 0.85, vy: vel.y * 0.85, vz: vel.z * 0.85, life: 0.55, size0: len * 0.6, size1: len * 7, color0: [1.4, 1.4, 1.5, 0.6], color1: [1, 1, 1, 0], cell: 3, rotVel: 0, drag: 0.5 });
    p.fire.emit({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x * 0.9, vy: vel.y * 0.9, vz: vel.z * 0.9, life: 0.18, size0: len * 1.4, size1: len * 2.6, color0: [2.5, 2.5, 2.6, 0.5], color1: [1, 1, 1, 0], cell: 2, drag: 0 });
    this._shakeFrom(pos, 0.9);
  }

  // Low supersonic pass over water: a rooster tail of spray behind the jet.
  waterSpray(pos, vel, strength) {
    const p = this.particles;
    for (let i = 0; i < 3; i++) {
      p.smoke.emit({
        x: pos.x + (Math.random() - 0.5) * 8, y: pos.y, z: pos.z + (Math.random() - 0.5) * 8,
        vx: vel.x * 0.25 + (Math.random() - 0.5) * 12, vy: 14 + Math.random() * 22 * strength, vz: vel.z * 0.25 + (Math.random() - 0.5) * 12,
        life: 1.6 + Math.random(), size0: 4, size1: 18 * strength + 6,
        color0: [1.15, 1.2, 1.25, 0.55 * strength], color1: [1.1, 1.15, 1.2, 0], cell: 0, drag: 1.2, gravity: 7,
      });
    }
  }

  muzzleFlash(pos) {
    this.particles.fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.04, size0: 1.6, size1: 2.2, color0: [6, 4.5, 2, 1], color1: [4, 2, 0.5, 0], cell: 2, drag: 0 });
  }

  update(dt, camera) {
    this.particles.update(dt, camera);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.flashT > 0 && this.flashLight) {
      this.flashT -= dt;
      this.flashLight.intensity *= Math.max(0, 1 - dt * 12);
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
    void _v;
  }

  clear() {
    this.particles.clear();
  }

  dispose() {
    this.particles.dispose();
    if (this.flashLight) this.battle.scene.remove(this.flashLight);
  }
}
