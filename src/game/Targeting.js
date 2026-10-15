// Player target selection and missile lock-on logic.
import * as THREE from 'three';
import { MISSILE_TYPES } from '../combat/Weapons.js';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class Targeting {
  constructor(battle) {
    this.battle = battle;
    this.target = null;
    this.lock = 0;
    this.locked = false;
    this.lockTime = 1.2;
    this.missileType = 'ir';
    this.inCone = false;
    this.seeker = 'none';
    this.retarget = 0;
  }

  candidates() {
    const b = this.battle;
    const p = b.player;
    if (!p) return [];
    const list = [];
    for (const a of b.aircraft) if (a.alive && !a.dying && a.team !== p.team) list.push(a);
    for (const g of b.ground) if (g.alive && g.team !== p.team && g.isTarget !== false) list.push(g);
    return list;
  }

  _score(p, e) {
    _v.subVectors(e.position, p.position);
    const d = _v.length();
    _f.set(0, 0, -1).applyQuaternion(p.quaternion);
    const ang = Math.acos(Math.max(-1, Math.min(1, _f.dot(_v.divideScalar(Math.max(d, 1))))));
    return d * (0.4 + ang) * (e.kind === 'air' ? 0.6 : 1);
  }

  cycle() {
    const p = this.battle.player;
    const list = this.candidates();
    if (!list.length) { this.target = null; return; }
    list.sort((a, b) => this._score(p, a) - this._score(p, b));
    const i = list.indexOf(this.target);
    this.target = list[(i + 1) % list.length];
    this.lock = 0;
    this.locked = false;
  }

  update(dt) {
    const b = this.battle;
    const p = b.player;
    if (!p || !p.alive) {
      this.seeker = 'none';
      return;
    }
    if (this.target && (!this.target.alive || this.target.dying)) {
      this.target = null;
      this.retarget = 0.6;
    }
    if (!this.target) {
      this.retarget -= dt;
      if (this.retarget <= 0) {
        const list = this.candidates();
        if (list.length) {
          list.sort((a, c) => this._score(p, a) - this._score(p, c));
          this.target = list[0];
        }
        this.retarget = 0.5;
      }
    }
    const t = this.target;
    this.inCone = false;
    if (t && p.missiles > 0) {
      const dist = t.position.distanceTo(p.position);
      this.missileType = t.kind === 'air' && dist > MISSILE_TYPES.ir.range * 0.9 ? 'radar' : 'ir';
      this.lockTime = this.missileType === 'radar' ? 1.8 : 1.1;
      this.inCone = b.weapons.canLock(p, t, this.missileType);
      if (this.inCone) {
        this.lock = Math.min(this.lockTime, this.lock + dt);
      } else this.lock = Math.max(0, this.lock - dt * 2.5);
    } else this.lock = 0;
    this.locked = this.lock >= this.lockTime;
    this.seeker = this.locked ? 'lock' : this.inCone || (t && p.missiles > 0 && this.lock > 0) ? 'search' : 'none';
  }

  fire() {
    const b = this.battle;
    const p = b.player;
    if (!p || !p.alive || p.dying || p.missiles <= 0 || p.missileCooldown > 0) return false;
    const tgt = this.locked ? this.target : null;
    b.weapons.launchMissile(p, tgt, this.missileType);
    p.missiles--;
    p.missileCooldown = 0.6;
    if (tgt) {
      this.lock = this.lockTime * 0.4;
      this.locked = false;
    }
    return !!tgt;
  }
}
