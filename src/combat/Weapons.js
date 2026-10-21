// Guns (instanced tracers), guided missiles (proportional navigation with
// seeker cone, motor burn, drag, proximity fuse), guided bombs and decoy flares.
// Launches follow the real sequence: rail-launched heat seekers light up on
// the rail, ejected radar missiles fall clear for a moment before the motor
// fires; bombs drop from opening bay doors and glide to GPS coordinates.
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
  // 2,000 lb guided bomb: a ~430 kg high-explosive fill, lethal to vehicles out to ~45 m
  bomb: { name: 'JDAM', damage: 900, radius: 48, maxLat: 26, lift: 0.8, life: 120, model: 'bomb' },
};

// air density ratio (fast approximation for weapons)
const rhoRatio = (y) => Math.exp(-Math.max(0, y) / 9000);

// rocket plume: a cone fading from a white-hot nozzle to orange (vertex alpha)
let plumeGeo = null;
function getPlumeGeometry() {
  if (plumeGeo) return plumeGeo;
  const g = new THREE.CylinderGeometry(0.03, 0.16, 1, 12, 6, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, 0.5);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i); // 0 at the nozzle, 1 at the tip
    col.set([1, 0.9 - 0.55 * t, 0.7 - 0.65 * t, Math.pow(1 - t, 1.6)], i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  plumeGeo = g;
  return g;
}

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
    this.bombs = [];
    this.bombMats = { body: new THREE.MeshStandardMaterial({ color: 0x5d6656, roughness: 0.6, metalness: 0.25 }) };
    this.plumeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 2.2), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
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
    const muzzle = pos.clone();
    // offset by a random fraction of a frame so streams don't bunch up
    pos.addScaledVector(vel, Math.random() * 0.016);
    // belts are loaded with a tracer every few rounds; the rest fly unseen
    owner._round = (owner._round || 0) + 1;
    this.fireBullet(owner, pos, vel, owner.spec.weapons.gunDamage, 2.4, owner._round % 3 === 0);
    if (Math.random() < 0.6) b.effects.muzzleFlash(muzzle, owner.velocity);
    if (owner._round % 2 === 0) b.effects.gunSmoke(muzzle, owner.velocity);
    b.audio?.gunShot(owner);
  }

  fireBullet(owner, pos, vel, damage, life = 3, tracer = true) {
    if (this.bullets.length >= this.maxBullets) this.bullets.shift();
    this.bullets.push({ pos, prev: pos.clone(), vel, life, owner, damage, tracer });
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
          if (bl.tracer || Math.random() < 0.35) b.effects.groundImpact(bl.pos, h < map.waterLevel && s <= map.waterLevel + 0.01);
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
      if (!bl.tracer) continue;
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
    // enemy seekers against stealth aircraft: radar range scales with the radar
    // cross-section; shielded exhausts cut the infrared signature less
    const rcs = !owner.isPlayer && target.spec ? target.spec.stealth ?? 1 : 1;
    const k = typeKey === 'ir' ? Math.min(1, Math.sqrt(rcs) * 1.4) : rcs;
    if (dist > t.range * rangeScale * k || dist < 200) return false;
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
    const plume = new THREE.Mesh(getPlumeGeometry(), this.plumeMat);
    plume.position.z = geo.length / 2;
    plume.visible = false;
    plume.frustumCulled = false;
    plume.renderOrder = 29;
    mesh.add(plume);
    if (typeKey === 'sam') mesh.scale.setScalar(1.6);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    this.scene.add(mesh);
    const trail = this.battle.trails.create({ width: typeKey === 'sam' ? 2.2 : 1.4, life: this.lowQuality ? 3.5 : 6, color: [0.85, 0.85, 0.86], maxPoints: 120, minDist: 12, growth: 5 });
    // rail launch (heat seekers, SAMs) lights the motor at once; ejected radar
    // missiles are pushed clear and fall for a moment first
    const ejected = owner.kind === 'air' && typeKey === 'radar';
    if (ejected) vel.add(new THREE.Vector3(0, -9, 0).applyQuaternion(owner.quaternion));
    const m = {
      owner, target, type: typeKey, t, pos, vel, quat, mesh, trail, plume, age: 0, alive: true, slotMesh,
      ignite: ejected ? 0.32 : 0, lit: false, smokeT: 0, wobble: Math.random() * 6.28,
      prevDist: Infinity, lastPos: pos.clone(), lostTrack: false,
      // the player's datalinked missiles track a little more stubbornly
      seekerScale: owner.isPlayer ? 1.35 : 1, decoyScale: owner.isPlayer ? 0.75 : 1,
      decoyChecked: new Set(),
    };
    this.missiles.push(m);
    if (target && target.kind === 'air') target.incoming++;
    if (!ejected) this._ignite(m);
    this.battle.audio?.missileLaunch(pos, owner.isPlayer);
    this.battle.onMissileLaunched(m);
    return m;
  }

  _ignite(m) {
    m.lit = true;
    m.burnStart = m.age;
    m.plume.visible = true;
    this.battle.effects.missileIgnite(m.pos, m.owner.kind === 'air' ? m.owner.velocity : m.vel, m.type === 'sam' ? 1.8 : 1);
  }

  _updateMissile(m, dt) {
    const b = this.battle;
    const t = m.t;
    m.age += dt;
    // separation: an ejected round drops clear, then the motor lights
    if (!m.lit) {
      m.vel.y -= 9.81 * dt;
      m.lastPos.copy(m.pos);
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      if (m.age >= m.ignite) this._ignite(m);
      return;
    }
    const burnAge = m.age - (m.burnStart || 0);
    const speed = m.vel.length();
    const fwd = _fwd.copy(m.vel).divideScalar(Math.max(speed, 1));
    const tgt = m.target;
    // seeker
    if (tgt && !m.lostTrack && burnAge > 0.15) {
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
    const burning = burnAge < t.burn;
    if (burning) m.vel.addScaledVector(fwd, t.accel * dt);
    const rho = Math.exp(-m.pos.y / 9000);
    const dragK = 0.00012 * rho * speed + (m.age > t.burn ? 0.03 : 0.0);
    m.vel.multiplyScalar(Math.max(0, 1 - dragK * dt));
    if (m.vel.length() > t.speed * 1.4) m.vel.setLength(t.speed * 1.4);
    m.vel.y -= 9.81 * dt * (m.lostTrack ? 1 : 0.15);
    m.lastPos.copy(m.pos);
    m.pos.addScaledVector(m.vel, dt);
    // orientation follows velocity (with a little coning just off the rail)
    _a.copy(m.vel).normalize();
    m.quat.setFromUnitVectors(_b.set(0, 0, -1), _a);
    if (burnAge < 0.6) {
      const w = (0.6 - burnAge) * 0.05;
      _q.setFromAxisAngle(_d.set(Math.sin(m.wobble + m.age * 40), Math.cos(m.wobble + m.age * 40), 0), w);
      m.quat.multiply(_q);
    }
    m.mesh.position.copy(m.pos);
    m.mesh.quaternion.copy(m.quat);
    // exhaust plume, glow, smoke trail
    if (burning) {
      const flick = 0.85 + Math.random() * 0.3;
      const len = (m.type === 'sam' ? 5 : 3.2) * flick * Math.min(1, 0.4 + burnAge * 3);
      m.plume.scale.set(1.2 * flick, 1.2 * flick, len);
      _c.copy(m.pos).addScaledVector(_a, -2);
      b.effects.motor(_c);
      m.trail.add(_c, 0.75, b.time);
      m.smokeT -= dt;
      if (m.smokeT <= 0) {
        m.smokeT = this.lowQuality ? 0.06 : 0.025;
        b.effects.missileSmoke(_c, m.vel, m.type === 'sam' ? 1.5 : 1);
      }
    } else {
      m.plume.visible = false;
      m.trail.add(m.pos, 0, b.time);
    }
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

  // ---------------------------------------------------------------- bombs
  // Release a bomb from the bay. With a target it steers to the coordinates
  // (GPS / laser) and glides on its fins; without one it falls ballistically.
  dropBomb(owner, target = null) {
    const slot = owner.nextMissileSlot();
    const pos = owner.worldPoint(slot ? slot.local : new THREE.Vector3(0, -1.5, 0), new THREE.Vector3());
    if (slot) slot.used = true;
    // ejector rams push it down and clear of the bay
    const vel = owner.velocity.clone().add(new THREE.Vector3(0, -3.5, 0).applyQuaternion(owner.quaternion));
    const geo = getMissileGeometry('bomb');
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geo.body, this.bombMats.body));
    mesh.position.copy(pos);
    mesh.quaternion.copy(owner.quaternion);
    this.scene.add(mesh);
    const bomb = { owner, target, pos, vel, mesh, age: 0, alive: true, t: MISSILE_TYPES.bomb, quat: owner.quaternion.clone() };
    this.bombs.push(bomb);
    owner.bayTimer = 3.2;
    if (owner.isPlayer) this.battle.audio?.click?.();
    return bomb;
  }

  // ballistic impact point of a bomb released now (CCIP), or null
  predictImpact(pos, vel, out = new THREE.Vector3()) {
    const map = this.battle.map;
    _a.copy(pos);
    _b.copy(vel);
    const dt = 0.25;
    for (let t = 0; t < 90; t += dt) {
      const sp = _b.length();
      const k = 9.6e-5 * rhoRatio(_a.y) * sp;
      _b.multiplyScalar(Math.max(0, 1 - k * dt));
      _b.y -= 9.81 * dt;
      _a.addScaledVector(_b, dt);
      const h = map.surfaceAt(_a.x, _a.z, _a.y);
      if (_a.y <= h) {
        out.set(_a.x, h, _a.z);
        return out;
      }
    }
    return null;
  }

  _updateBomb(bm, dt) {
    const b = this.battle;
    const t = bm.t;
    bm.age += dt;
    const speed = bm.vel.length();
    const tgt = bm.target;
    // drag: terminal velocity around 320 m/s at sea level
    bm.vel.multiplyScalar(Math.max(0, 1 - 9.6e-5 * rhoRatio(bm.pos.y) * speed * dt));
    bm.vel.y -= 9.81 * dt;
    // tail kit steering once the fins have deployed
    if (tgt && tgt.alive !== false && bm.age > 0.7) {
      const fwd = _fwd.copy(bm.vel).divideScalar(Math.max(speed, 1));
      _a.subVectors(tgt.position, bm.pos);
      const dist = _a.length();
      const tgo = dist / Math.max(speed, 60);
      if (tgt.velocity) _a.addScaledVector(tgt.velocity, tgo);
      _a.normalize().multiplyScalar(speed);
      const acc = _c.subVectors(_a, bm.vel).multiplyScalar(1.4);
      // body lift lets it glide: the fins can hold up to ~0.8 g
      acc.y += 9.81 * t.lift * Math.min(1, dist / 3000);
      acc.addScaledVector(fwd, -acc.dot(fwd));
      if (acc.length() > t.maxLat) acc.setLength(t.maxLat);
      bm.vel.addScaledVector(acc, dt);
    }
    bm.pos.addScaledVector(bm.vel, dt);
    _a.copy(bm.vel).normalize();
    bm.quat.setFromUnitVectors(_b.set(0, 0, -1), _a);
    bm.mesh.position.copy(bm.pos);
    bm.mesh.quaternion.copy(bm.quat);
    const map = b.map;
    const ground = map.surfaceAt(bm.pos.x, bm.pos.z, bm.pos.y);
    if (bm.pos.y <= ground) {
      bm.pos.y = ground;
      this._detonateBomb(bm, map.heightAt(bm.pos.x, bm.pos.z) < map.waterLevel);
    } else if (bm.age > t.life) this._detonateBomb(bm, false);
  }

  _detonateBomb(bm, water) {
    const b = this.battle;
    const t = bm.t;
    bm.alive = false;
    this.scene.remove(bm.mesh);
    const at = bm.pos;
    if (water) b.effects.waterCrash(at, _a.set(0, 0, 0), 2.2);
    else {
      b.effects.groundExplosion(at, 2.4);
      b.effects.crashFireball(at, _a.set(0, 0, 0), 0.9);
      b.wreckage?.scorch(at, 11);
    }
    for (const g of b.ground) {
      if (!g.alive || g.team === bm.owner.team) continue;
      const d = g.position.distanceTo(at) - g.radius;
      if (d < t.radius) {
        g.damage(t.damage * Math.min(1, 1.15 - Math.max(0, d) / t.radius), { owner: bm.owner, type: 'bomb' }, b);
        if (bm.owner.isPlayer) b.onPlayerHit(g);
      }
    }
    for (const ac of b.aircraft) {
      if (!ac.alive || ac.team === bm.owner.team) continue;
      const d = ac.position.distanceTo(at);
      if (d < t.radius * 1.3) {
        ac.damage(t.damage * 0.5 * (1 - d / (t.radius * 1.3)), { owner: bm.owner, type: 'bomb' }, b);
        if (ac.isPlayer) b.onPlayerDamaged(40, bm.owner);
      }
    }
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
    for (const bm of this.bombs) if (bm.alive) this._updateBomb(bm, dt);
    this.bombs = this.bombs.filter((bm) => bm.alive);
    this._updateFlares(dt);
  }

  // incoming missiles that target a given entity
  threatsTo(entity) {
    return this.missiles.filter((m) => m.alive && m.target === entity);
  }

  clear() {
    for (const m of this.missiles) this.scene.remove(m.mesh);
    for (const bm of this.bombs) this.scene.remove(bm.mesh);
    this.missiles.length = 0;
    this.bombs.length = 0;
    this.bullets.length = 0;
    this.flareList.length = 0;
    this.tracers.count = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.tracers);
    this.tracers.geometry.dispose();
    this.tracers.material.dispose();
    this.plumeMat.dispose();
    this.bombMats.body.dispose();
  }
}
