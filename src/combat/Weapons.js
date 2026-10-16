// Guns (instanced tracers), guided missiles (proportional navigation with
// seeker cone, motor burn, drag, proximity fuse) and decoy flares.
import * as THREE from 'three';
import { getMissileGeometry } from '../aircraft/JetBuilder.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _fwd = new THREE.Vector3();

// distance squared from point p to segment ab, returns t in out
function segPointDist2(a, b, p) {
  _d.subVectors(b, a);
  const len2 = _d.lengthSq();
  let t = len2 > 0 ? _c.subVectors(p, a).dot(_d) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  _c.copy(a).addScaledVector(_d, t);
  return _c.distanceToSquared(p);
}

export const MISSILE_TYPES = {
  ir: { name: 'IR', speed: 820, accel: 260, burn: 3.2, maxG: 38, life: 14, seeker: 0.75, lockCone: 0.35, range: 4200, decoy: 0.42, damage: 120, fuse: 11, model: 'ir' },
  radar: { name: 'RDR', speed: 950, accel: 220, burn: 5.0, maxG: 32, life: 22, seeker: 0.9, lockCone: 0.5, range: 9000, decoy: 0.22, damage: 130, fuse: 13, model: 'radar' },
  sam: { name: 'SAM', speed: 900, accel: 180, burn: 6, maxG: 26, life: 22, seeker: 1.0, lockCone: 1.2, range: 9000, decoy: 0.3, damage: 75, fuse: 15, model: 'radar' },
};

export class Weapons {
  constructor(battle, quality) {
    this.battle = battle;
    const scene = battle.scene;
    this.scene = scene;
    // --- bullets
    this.maxBullets = 700;
    this.bullets = [];
    const tracerGeo = new THREE.BoxGeometry(0.16, 0.16, 1);
    const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.2, 1.2), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = new THREE.InstancedMesh(tracerGeo, tracerMat, this.maxBullets);
    this.tracers.count = 0;
    this.tracers.frustumCulled = false;
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.renderOrder = 28;
    scene.add(this.tracers);
    // --- missiles
    this.missiles = [];
    this.flareList = [];
    this.missileMats = {
      body: new THREE.MeshStandardMaterial({ color: 0xd6d6d0, roughness: 0.45, metalness: 0.2 }),
      nose: new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.3, metalness: 0.4 }),
      sam: new THREE.MeshStandardMaterial({ color: 0x9a9f86, roughness: 0.5, metalness: 0.2 }),
    };
    this.muzzle = [];
    this.lowQuality = quality.particles < 1200;
  }

  // ---------------------------------------------------------------- guns
  fireGun(owner) {
    const b = this.battle;
    const pos = owner.worldPoint(owner.model.gunPos, new THREE.Vector3());
    const fwd = _fwd.set(0, 0, -1).applyQuaternion(owner.quaternion);
    const spread = owner.isPlayer ? 0.0025 : 0.004 + (owner.ai ? owner.ai.aimError * 0.5 : 0);
    const dir = new THREE.Vector3(
      fwd.x + (Math.random() - 0.5) * spread,
      fwd.y + (Math.random() - 0.5) * spread,
      fwd.z + (Math.random() - 0.5) * spread,
    ).normalize();
    const vel = dir.multiplyScalar(1030).add(owner.velocity);
    // offset by a random fraction of a frame so streams don't bunch up
    pos.addScaledVector(vel, Math.random() * 0.016);
    this.fireBullet(owner, pos, vel, owner.spec.weapons.gunDamage, 2.4);
    if (Math.random() < 0.5) b.effects.muzzleFlash(pos);
    b.audio?.gunShot(owner);
  }

  fireBullet(owner, pos, vel, damage, life = 3) {
    if (this.bullets.length >= this.maxBullets) this.bullets.shift();
    this.bullets.push({ pos, prev: pos.clone(), vel, life, owner, damage });
  }

  _updateBullets(dt) {
    const b = this.battle;
    const map = b.map;
    const list = this.bullets;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const bl = list[i];
      bl.life -= dt;
      bl.prev.copy(bl.pos);
      bl.vel.y -= 9.81 * dt;
      bl.pos.addScaledVector(bl.vel, dt);
      let hit = false;
      // aircraft
      for (const ac of b.aircraft) {
        if (!ac.alive || ac === bl.owner || ac.team === bl.owner.team) continue;
        const r = ac.radius;
        if (Math.abs(ac.position.x - bl.pos.x) > 80 && Math.abs(ac.position.x - bl.prev.x) > 80) continue;
        if (segPointDist2(bl.prev, bl.pos, ac.position) < r * r) {
          ac.damage(bl.damage, { owner: bl.owner, type: 'gun' }, b);
          bl.owner.hits++;
          b.effects.hit(_c, ac.velocity);
          if (bl.owner.isPlayer) b.onPlayerHit(ac);
          if (ac.isPlayer) b.onPlayerDamaged(bl.damage, bl.owner);
          hit = true;
          break;
        }
      }
      // ground units
      if (!hit) {
        for (const g of b.ground) {
          if (!g.alive || g.team === bl.owner.team) continue;
          if (Math.abs(g.position.x - bl.pos.x) > 60 && Math.abs(g.position.x - bl.prev.x) > 60) continue;
          if (segPointDist2(bl.prev, bl.pos, g.position) < g.radius * g.radius) {
            g.damage(bl.damage * 0.8, { owner: bl.owner, type: 'gun' }, b);
            bl.owner.hits++;
            b.effects.hit(_c, _a.set(0, 0, 0));
            if (bl.owner.isPlayer) b.onPlayerHit(g);
            hit = true;
            break;
          }
        }
      }
      // terrain / water / buildings
      if (!hit && bl.pos.y < 6000) {
        const h = map.heightAt(bl.pos.x, bl.pos.z);
        const s = map.surfaceAt(bl.pos.x, bl.pos.z, bl.pos.y);
        if (bl.pos.y <= s) {
          bl.pos.y = s;
          if (Math.random() < 0.5) b.effects.groundImpact(bl.pos, h < map.waterLevel && s <= map.waterLevel + 0.01);
          hit = true;
        }
      }
      if (!hit && bl.life > 0) list[n++] = bl;
    }
    list.length = n;
    // render tracers
    const cam = b.camera.position;
    let k = 0;
    for (const bl of list) {
      const speed = bl.vel.length();
      _a.copy(bl.vel).divideScalar(speed);
      _q.setFromUnitVectors(_z, _a);
      const dist = bl.pos.distanceTo(cam);
      const thick = Math.max(1, dist / 160);
      _s.set(thick, thick, Math.min(26, 9 + dist / 60));
      _b.copy(bl.pos).addScaledVector(_a, -_s.z * 0.5);
      _m.compose(_b, _q, _s);
      this.tracers.setMatrixAt(k++, _m);
    }
    this.tracers.count = k;
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- missiles
  canLock(owner, target, typeKey = 'ir', coneScale = 1, rangeScale = 1) {
    const t = MISSILE_TYPES[typeKey];
    _a.subVectors(target.position, owner.position);
    const dist = _a.length();
    if (dist > t.range * rangeScale || dist < 200) return false;
    _a.divideScalar(dist);
    const fwd = _fwd.set(0, 0, -1).applyQuaternion(owner.quaternion);
    return Math.acos(Math.max(-1, Math.min(1, fwd.dot(_a)))) < Math.min(1.4, t.lockCone * coneScale);
  }

  launchMissile(owner, target, typeKey = 'ir', origin = null) {
    const t = MISSILE_TYPES[typeKey];
    let pos, vel, quat;
    let slotMesh = null;
    if (owner.kind === 'air') {
      const slot = owner.nextMissileSlot();
      if (slot) {
        slot.used = true;
        slot.mesh.visible = false;
        slotMesh = slot;
        pos = owner.worldPoint(slot.local, new THREE.Vector3());
      } else {
        pos = owner.worldPoint(new THREE.Vector3(0, -1, 0), new THREE.Vector3());
      }
      vel = owner.velocity.clone().add(new THREE.Vector3(0, -6, 0).applyQuaternion(owner.quaternion));
      quat = owner.quaternion.clone();
    } else {
      pos = origin.clone();
      const dir = new THREE.Vector3().subVectors(target.position, pos).normalize();
      dir.y = Math.max(dir.y, 0.35);
      dir.normalize();
      vel = dir.clone().multiplyScalar(60);
      quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    }
    const geo = getMissileGeometry(t.model);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geo.body, typeKey === 'sam' ? this.missileMats.sam : this.missileMats.body));
    mesh.add(new THREE.Mesh(geo.nose, this.missileMats.nose));
    if (typeKey === 'sam') mesh.scale.setScalar(1.6);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    this.scene.add(mesh);
    const trail = this.battle.trails.create({ width: typeKey === 'sam' ? 2.2 : 1.4, life: this.lowQuality ? 3.5 : 6, color: [0.85, 0.85, 0.86], maxPoints: 120, minDist: 12, growth: 5 });
    const m = {
      owner, target, type: typeKey, t, pos, vel, quat, mesh, trail, age: 0, alive: true, slotMesh,
      prevDist: Infinity, lastPos: pos.clone(), lostTrack: false,
      // the player's datalinked missiles track a little more stubbornly
      seekerScale: owner.isPlayer ? 1.35 : 1, decoyScale: owner.isPlayer ? 0.75 : 1,
      decoyChecked: new Set(),
    };
    this.missiles.push(m);
    if (target && target.kind === 'air') target.incoming++;
    this.battle.audio?.missileLaunch(pos, owner.isPlayer);
    this.battle.onMissileLaunched(m);
    return m;
  }

  _updateMissile(m, dt) {
    const b = this.battle;
    const t = m.t;
    m.age += dt;
    const speed = m.vel.length();
    const fwd = _fwd.copy(m.vel).divideScalar(Math.max(speed, 1));
    const tgt = m.target;
    // seeker
    if (tgt && !m.lostTrack) {
      const tAlive = tgt.alive !== false && !(tgt.dying && tgt.kind === 'air' && Math.random() < 0.002);
      _a.subVectors(tgt.position, m.pos);
      const dist = _a.length();
      const los = _b.copy(_a).divideScalar(Math.max(dist, 1e-3));
      const off = Math.acos(Math.max(-1, Math.min(1, fwd.dot(los))));
      if (!tAlive || (off > t.seeker * m.seekerScale && m.age > 0.6)) {
        m.lostTrack = true;
      } else if (m.age > 0.25) {
        // proportional navigation
        const relVel = _c.subVectors(tgt.velocity || _d.set(0, 0, 0), m.vel);
        const omega = _d.crossVectors(_a, relVel).divideScalar(Math.max(dist * dist, 1));
        const closing = -relVel.dot(los);
        const acc = new THREE.Vector3().crossVectors(omega, los).multiplyScalar(4 * Math.max(closing, 150));
        // gravity compensation
        acc.y += 9.81;
        // remove component along velocity
        acc.addScaledVector(fwd, -acc.dot(fwd));
        const maxA = t.maxG * 9.81 * Math.min(1, speed / 300);
        if (acc.length() > maxA) acc.setLength(maxA);
        m.vel.addScaledVector(acc, dt);
      }
      // proximity fuse: closest approach this frame
      const d2 = segPointDist2(m.lastPos, m.pos, tgt.position);
      if (d2 < t.fuse * t.fuse && m.age > 0.4) {
        this._detonate(m, _c.clone(), tgt);
        return;
      }
      if (dist > m.prevDist && dist < 60 && m.age > 0.6) {
        // passed the target: fuse on the way past if close
        this._detonate(m, m.pos.clone(), dist < t.fuse * 2 ? tgt : null);
        return;
      }
      m.prevDist = dist;
    }
    // motor and drag
    if (m.age < t.burn) m.vel.addScaledVector(fwd, t.accel * dt);
    const rho = Math.exp(-m.pos.y / 9000);
    const dragK = 0.00012 * rho * speed + (m.age > t.burn ? 0.03 : 0.0);
    m.vel.multiplyScalar(Math.max(0, 1 - dragK * dt));
    if (m.vel.length() > t.speed * 1.4) m.vel.setLength(t.speed * 1.4);
    m.vel.y -= 9.81 * dt * (m.lostTrack ? 1 : 0.15);
    m.lastPos.copy(m.pos);
    m.pos.addScaledVector(m.vel, dt);
    // orientation follows velocity
    _a.copy(m.vel).normalize();
    m.quat.setFromUnitVectors(_b.set(0, 0, -1), _a);
    m.mesh.position.copy(m.pos);
    m.mesh.quaternion.copy(m.quat);
    // exhaust + trail
    if (m.age < t.burn) {
      _c.copy(m.pos).addScaledVector(_a, -2);
      b.effects.motor(_c);
      m.trail.add(_c, 0.75, b.time);
    } else m.trail.add(m.pos, 0, b.time);
    // flares decoy
    for (const f of this.flareList) {
      if (m.decoyChecked.has(f) || !tgt || tgt.kind !== 'air') continue;
      if (f.owner !== tgt) continue;
      if (f.age < 0.15) continue;
      m.decoyChecked.add(f);
      _c.subVectors(f.pos, m.pos).normalize();
      if (_c.dot(_a) > Math.cos(t.seeker) && Math.random() < t.decoy * m.decoyScale) {
        tgt.incoming = Math.max(0, tgt.incoming - 1);
        m.target = f;
        break;
      }
    }
    // ground
    const ground = b.map.surfaceAt(m.pos.x, m.pos.z, m.pos.y);
    if (m.pos.y <= ground) {
      m.pos.y = ground;
      this._detonate(m, m.pos.clone(), null, true);
      return;
    }
    if (m.age > t.life) this._detonate(m, m.pos.clone(), null);
  }

  _detonate(m, at, target, ground = false) {
    const b = this.battle;
    m.alive = false;
    this.scene.remove(m.mesh);
    m.trail.add(m.pos, 0, b.time);
    m.trail.stop();
    b.trails.remove(m.trail);
    const prevTarget = m.target;
    if (prevTarget && prevTarget.kind === 'air') prevTarget.incoming = Math.max(0, prevTarget.incoming - 1);
    b.effects.explosion(at, ground ? 1.0 : 0.8);
    // damage everything nearby
    const radius = m.t.fuse * 2.2;
    for (const ac of b.aircraft) {
      if (!ac.alive || ac.team === m.owner.team) continue;
      const d = ac.position.distanceTo(at);
      if (d < radius) {
        const dmg = m.t.damage * (d < m.t.fuse * 0.6 ? 1 : 1 - (d - m.t.fuse * 0.6) / (radius - m.t.fuse * 0.6));
        ac.damage(dmg, { owner: m.owner, type: 'missile' }, b);
        if (m.owner.isPlayer) b.onPlayerHit(ac);
        if (ac.isPlayer) b.onPlayerDamaged(dmg, m.owner);
      }
    }
    for (const g of b.ground) {
      if (!g.alive || g.team === m.owner.team) continue;
      const d = g.position.distanceTo(at);
      if (d < radius + g.radius) {
        g.damage(m.t.damage * 1.4 * (1 - Math.max(0, d - g.radius) / radius), { owner: m.owner, type: 'missile' }, b);
        if (m.owner.isPlayer) b.onPlayerHit(g);
      }
    }
    void target;
  }

  // ---------------------------------------------------------------- flares
  dropFlares(owner) {
    const b = this.battle;
    for (const side of [-1, 1]) {
      const pos = owner.worldPoint(new THREE.Vector3(side * 0.8, -0.6, owner.model.length * 0.3), new THREE.Vector3());
      const vel = owner.velocity.clone().multiplyScalar(0.85).add(new THREE.Vector3(side * 18, -14, 8).applyQuaternion(owner.quaternion));
      const f = { owner, pos, position: pos, vel, velocity: vel, age: 0, life: 4.5, alive: true, kind: 'flare', heat: 3 };
      this.flareList.push(f);
    }
    b.audio?.flare(owner);
    b.onFlares(owner);
  }

  _updateFlares(dt) {
    const b = this.battle;
    let n = 0;
    for (const f of this.flareList) {
      f.age += dt;
      f.vel.multiplyScalar(1 - 0.6 * dt);
      f.vel.y -= 9.81 * dt * 0.6;
      f.pos.addScaledVector(f.vel, dt);
      b.effects.flare(f.pos, 1 - f.age / f.life);
      if (f.age < f.life) this.flareList[n++] = f;
      else f.alive = false;
    }
    this.flareList.length = n;
  }

  update(dt) {
    this._updateBullets(dt);
    for (const m of this.missiles) if (m.alive) this._updateMissile(m, dt);
    this.missiles = this.missiles.filter((m) => m.alive);
    this._updateFlares(dt);
  }

  // incoming missiles that target a given entity
  threatsTo(entity) {
    return this.missiles.filter((m) => m.alive && m.target === entity);
  }

  clear() {
    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.missiles.length = 0;
    this.bullets.length = 0;
    this.flareList.length = 0;
    this.tracers.count = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.tracers);
    this.tracers.geometry.dispose();
    this.tracers.material.dispose();
  }
}
