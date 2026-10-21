// Player target selection, missile lock-on and bomb release logic.
// Lock assist (default on) makes locking quick and forgiving: the radar
// prefers whatever is closest to the nose, switches to a bandit you point at,
// the seeker acquires faster through a wider cone and, once locked, holds the
// lock through a wide gimbal until the target really leaves it.
import * as THREE from 'three';
import { MISSILE_TYPES } from '../combat/Weapons.js';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class Targeting {
  constructor(battle, settings = {}) {
    this.battle = battle;
    this.settings = settings;
    this.target = null;
    this.lock = 0;
    this.locked = false;
    this.lockTime = 1.2;
    this.missileType = 'ir';
    // 'missile' or 'bomb': bombers (and anything carrying bombs at a ground target)
    this.weaponMode = 'missile';
    this.inCone = false;
    this.seeker = 'none';
    this.retarget = 0;
    this.offNoseTime = 0;
    this.manualTime = 0;
    this.lockedTime = 0;
    this.newLock = false;
  }

  get assist() {
    return this.settings.lockAssist !== false;
  }

  candidates() {
    const b = this.battle;
    const p = b.player;
    if (!p) return [];
    const list = [];
    for (const a of b.aircraft) if (a.alive && !a.dying && a.team !== p.team && a.team !== 'civil') list.push(a);
    for (const g of b.ground) if (g.alive && g.team !== p.team && g.isTarget !== false) list.push(g);
    return list;
  }

  // angle between the aircraft's nose (or a camera) and a target
  angleTo(from, quat, e) {
    _v.subVectors(e.position, from);
    const d = _v.length();
    _f.set(0, 0, -1).applyQuaternion(quat);
    return Math.acos(Math.max(-1, Math.min(1, _f.dot(_v.divideScalar(Math.max(d, 1))))));
  }

  _score(p, e) {
    const d = e.position.distanceTo(p.position);
    const ang = this.angleTo(p.position, p.quaternion, e);
    // strongly favour what is in front of the nose, then range
    return ang * 9000 + d * (e.kind === 'air' ? 0.35 : 0.6);
  }

  _setTarget(t) {
    if (t === this.target) return;
    this.target = t;
    this.lock = 0;
    this.locked = false;
    this.lockedTime = 0;
  }

  // T / Tab: step through targets ordered by how close they are to the nose
  cycle() {
    const p = this.battle.player;
    const list = this.candidates();
    if (!list.length) { this._setTarget(null); return; }
    list.sort((a, b) => this._score(p, a) - this._score(p, b));
    const i = list.indexOf(this.target);
    this._setTarget(list[(i + 1) % list.length]);
    this.manualTime = 4;
  }

  // Y / middle mouse: lock whatever is nearest the centre of the view
  // (works in padlock or free-look too)
  selectInView(camera) {
    const list = this.candidates();
    let best = null, bestA = 0.6;
    for (const e of list) {
      const a = this.angleTo(camera.position, camera.quaternion, e);
      if (a < bestA) { bestA = a; best = e; }
    }
    if (best) {
      this._setTarget(best);
      this.manualTime = 4;
      return true;
    }
    return false;
  }

  update(dt) {
    const b = this.battle;
    const p = b.player;
    this.newLock = false;
    if (!p || !p.alive || p.civil) {
      this.seeker = 'none';
      this.target = null;
      return;
    }
    this.manualTime = Math.max(0, this.manualTime - dt);
    if (this.target && (!this.target.alive || this.target.dying)) {
      this.target = null;
      this.retarget = this.assist ? 0.25 : 0.6;
    }
    if (!this.target) {
      this.retarget -= dt;
      if (this.retarget <= 0) {
        const list = this.candidates();
        if (list.length) {
          list.sort((a, c) => this._score(p, a) - this._score(p, c));
          this._setTarget(list[0]);
        }
        this.retarget = 0.4;
      }
    } else if (this.assist && !this.locked && this.manualTime <= 0) {
      // the target drifted far off the nose while another bandit sits right
      // in front: switch to the one the pilot is pointing at
      const off = this.angleTo(p.position, p.quaternion, this.target);
      this.offNoseTime = off > 0.75 ? this.offNoseTime + dt : 0;
      if (this.offNoseTime > 0.8) {
        let best = null, bestA = 0.3;
        for (const e of this.candidates()) {
          if (e === this.target) continue;
          const a = this.angleTo(p.position, p.quaternion, e);
          if (a < bestA && e.position.distanceTo(p.position) < 12000) { bestA = a; best = e; }
        }
        if (best) this._setTarget(best);
        this.offNoseTime = 0;
      }
    }
    const t = this.target;
    this.inCone = false;
    this.weaponMode = p.bombs > 0 && (p.missiles <= 0 || (t && t.kind !== 'air')) ? 'bomb' : 'missile';
    if (this.weaponMode === 'bomb') {
      this._updateBomb(dt, p, t);
      return;
    }
    if (t && p.missiles > 0) {
      const dist = t.position.distanceTo(p.position);
      this.missileType = t.kind === 'air' && dist > MISSILE_TYPES.ir.range * 0.9 ? 'radar' : 'ir';
      const fast = this.assist ? 0.6 : 1;
      this.lockTime = (this.missileType === 'radar' ? 1.8 : 1.1) * fast;
      // acquire inside the seeker cone; once locked the gimbal is much wider
      const cone = this.locked ? (this.assist ? 3.2 : 2.0) : this.assist ? 1.45 : 1;
      const range = this.locked ? 1.12 : 1;
      this.inCone = b.weapons.canLock(p, t, this.missileType, cone, range);
      const wasLocked = this.locked;
      if (this.inCone) this.lock = Math.min(this.lockTime, this.lock + dt);
      else this.lock = Math.max(0, this.lock - dt * (this.assist ? 1.2 : 2.5));
      this.locked = this.lock >= this.lockTime;
      if (this.locked && !wasLocked) this.newLock = true;
    } else {
      this.lock = 0;
      this.locked = false;
    }
    this.lockedTime = this.locked ? this.lockedTime + dt : 0;
    this.seeker = this.locked ? 'lock' : this.inCone || (t && p.missiles > 0 && this.lock > 0) ? 'search' : 'none';
  }

  // how far ahead a guided bomb released now can glide (metres, horizontal)
  bombReach(p, t) {
    const h = Math.max(30, p.position.y - (t ? t.position.y : p.position.y - 1000));
    const vh = Math.hypot(p.velocity.x, p.velocity.z);
    const fall = Math.sqrt((2 * h) / 9.81);
    return vh * fall * 1.7 + h * 0.6 + 300;
  }

  // bomb mode: the target is "locked" once its coordinates are loaded and it is
  // inside the release envelope (ahead, below, within glide reach)
  _updateBomb(dt, p, t) {
    this.missileType = 'bomb';
    this.lockTime = 0.5;
    let ok = false;
    if (t && t.kind !== 'air' && p.bombs > 0) {
      _v.subVectors(t.position, p.position);
      const dh = Math.hypot(_v.x, _v.z);
      const vh = Math.hypot(p.velocity.x, p.velocity.z) || 1;
      const ahead = (_v.x * p.velocity.x + _v.z * p.velocity.z) / (dh * vh || 1);
      this.reach = this.bombReach(p, t);
      ok = dh < this.reach && (ahead > 0.5 || dh < 400) && _v.y < -40;
    }
    this.inCone = ok;
    const was = this.locked;
    this.lock = ok ? Math.min(this.lockTime, this.lock + dt) : Math.max(0, this.lock - dt * 2);
    this.locked = this.lock >= this.lockTime;
    if (this.locked && !was) this.newLock = true;
    this.lockedTime = this.locked ? this.lockedTime + dt : 0;
    this.seeker = 'none';
  }

  // in range for a good shot: inside ~70 % of the missile's reach
  get shoot() {
    if (this.weaponMode === 'bomb') return this.locked;
    const p = this.battle.player;
    if (!this.locked || !this.target || !p) return false;
    return this.target.position.distanceTo(p.position) < MISSILE_TYPES[this.missileType].range * 0.7;
  }

  fire() {
    const b = this.battle;
    const p = b.player;
    if (this.weaponMode === 'bomb') {
      if (!p || !p.alive || p.dying || p.bombs <= 0 || p.missileCooldown > 0) return false;
      const tgt = this.locked ? this.target : null;
      b.weapons.dropBomb(p, tgt);
      p.bombs--;
      // ripple release interval
      p.missileCooldown = 0.3;
      return !!tgt;
    }
    if (!p || !p.alive || p.dying || p.missiles <= 0 || p.missileCooldown > 0) return false;
    const tgt = this.locked ? this.target : null;
    const m = b.weapons.launchMissile(p, tgt, this.missileType);
    this.lastMissile = m;
    p.missiles--;
    p.missileCooldown = 0.6;
    if (tgt) {
      this.lock = this.lockTime * 0.5;
      this.locked = false;
    }
    return !!tgt;
  }
}
