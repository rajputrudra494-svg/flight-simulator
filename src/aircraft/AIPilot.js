// AI pilot: flies the same flight model as the player using stick commands.
// Priorities: terrain avoidance > missile defence > defensive break > attack
// > route / patrol.
import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _loc = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export class AIPilot {
  constructor(aircraft, opts = {}) {
    this.ac = aircraft;
    aircraft.ai = this;
    this.skill = Math.max(0, Math.min(1, opts.skill ?? 0.5));
    this.role = opts.role || 'fighter';
    this.route = opts.route || null;
    this.routeIndex = 0;
    this.loop = opts.loop ?? true;
    this.patrolCenter = opts.patrolCenter ? opts.patrolCenter.clone() : aircraft.position.clone();
    this.patrolRadius = opts.patrolRadius || 4000;
    this.patrolAlt = opts.patrolAlt || aircraft.position.y;
    this.cruise = opts.cruise || 0.8;
    this.aggressive = opts.aggressive ?? (this.role === 'fighter' || this.role === 'escort');
    this.detectRange = opts.detectRange || 14000;
    this.target = null;
    this.retargetTimer = 0;
    this.lockTimer = 0;
    this.mode = 'patrol';
    this.breakDir = 1;
    this.breakTimer = 0;
    this.flareTimer = 0;
    this.aimError = THREE.MathUtils.degToRad(2.5 * (1 - this.skill) + 0.3);
    this.reaction = 0.6 - this.skill * 0.45;
    this.jinkTimer = 0;
    this.jink = new THREE.Vector3();
    this.escortOf = opts.escortOf || null;
    this.engaged = opts.engaged ?? false;
    this.turnTimer = 3 + Math.random() * 6;
    this.wander = new THREE.Vector3();
    if (this.role === 'civil') this.aggressive = false;
  }

  // Airliner autopilot: bank-limited turns towards a point, vertical-speed
  // hold to an altitude and an auto-throttle on airspeed.
  civilFly(point, alt, speed = 225) {
    const ac = this.ac;
    const c = ac.controls;
    const fm = ac.fm;
    const att = fm.attitude(this._att || (this._att = {}));
    const want = (THREE.MathUtils.radToDeg(Math.atan2(point.x - ac.position.x, -(point.z - ac.position.z))) + 360) % 360;
    let err = want - att.heading;
    err = ((err + 540) % 360) - 180;
    const bankTarget = THREE.MathUtils.clamp(err * 1.1, -25, 25);
    // attitude roll is negative when banked right
    const rollErr = -bankTarget - att.roll;
    c.roll = THREE.MathUtils.clamp(-rollErr * 0.045, -0.6, 0.6);
    const vsTarget = THREE.MathUtils.clamp((alt - ac.position.y) * 0.06, -10, 10);
    const bankComp = (1 / Math.max(0.6, Math.cos(THREE.MathUtils.degToRad(att.roll))) - 1) * 0.9;
    c.pitch = THREE.MathUtils.clamp((vsTarget - ac.velocity.y) * 0.05 + bankComp - att.pitch * 0.01, -0.5, 0.6);
    c.yaw = 0;
    c.throttle = THREE.MathUtils.clamp(0.55 + (speed - fm.airspeed) * 0.03, 0.25, 0.95);
  }

  // Convert a desired world-space direction into stick commands.
  steer(dir, aggr = 1, allowInverted = true) {
    const ac = this.ac;
    const c = ac.controls;
    _qi.copy(ac.quaternion).invert();
    _loc.copy(dir).normalize().applyQuaternion(_qi);
    const angle = Math.acos(THREE.MathUtils.clamp(-_loc.z, -1, 1));
    const att = ac.fm.attitude(this._att || (this._att = {}));
    let rollErr = Math.atan2(_loc.x, _loc.y);
    if (!allowInverted && Math.abs(att.roll + THREE.MathUtils.radToDeg(rollErr)) > 100) {
      rollErr = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(-att.roll, -60, 60)) * 0.5;
    }
    const pullScale = 0.55 + 0.45 * this.skill;
    if (angle < 0.12) {
      c.pitch = THREE.MathUtils.clamp(_loc.y * 9, -1, 1) * pullScale;
      c.yaw = THREE.MathUtils.clamp(_loc.x * 7, -1, 1);
      c.roll = THREE.MathUtils.clamp(_loc.x * 4 - THREE.MathUtils.degToRad(att.roll) * 0.4, -1, 1);
    } else {
      c.roll = THREE.MathUtils.clamp(rollErr * 2.4, -1, 1);
      const inPlane = Math.abs(rollErr) < 0.9 ? 1 : Math.abs(rollErr) < 1.8 ? 0.4 : 0.1;
      c.pitch = THREE.MathUtils.clamp(angle * 2.2, 0, 1) * inPlane * aggr * pullScale;
      c.yaw = THREE.MathUtils.clamp(_loc.x * 1.5, -1, 1) * 0.3;
    }
    return angle;
  }

  levelToward(point, alt, speedFactor = 1) {
    const ac = this.ac;
    _dir.set(point.x - ac.position.x, 0, point.z - ac.position.z);
    const horiz = _dir.length() || 1;
    _dir.divideScalar(horiz);
    const climb = THREE.MathUtils.clamp((alt - ac.position.y) / 1500, -0.35, 0.35);
    _dir.y = climb;
    this.steer(_dir, 0.6 * speedFactor, false);
    return horiz;
  }

  _pickTarget(battle) {
    const ac = this.ac;
    let best = null, bestScore = Infinity;
    for (const o of battle.aircraft) {
      if (!o.alive || o.dying || o.team === ac.team || o.team === 'civil') continue;
      const d = o.position.distanceTo(ac.position);
      if (d > this.detectRange * (o.spec.stealth ?? 1) && !this.engaged) continue;
      const score = d * (o.isPlayer ? 0.8 : 1) * (o.priority || 1);
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  update(dt, battle) {
    const ac = this.ac;
    if (!ac.alive || ac.dying) return;
    const c = ac.controls;
    const fm = ac.fm;
    const map = battle.map;
    c.gun = false;
    c.missile = false;
    c.flare = false;
    c.airbrake = false;
    c.gear = false;
    const speed = fm.airspeed;

    // --- 1. Terrain avoidance
    // airliners on approach fly much closer to the ground than fighters
    const minClear = this.role === 'civil' ? 50 + speed * 0.35 : 160 + speed * 0.9;
    let danger = 0;
    for (const t of [1, 2.5, 4.5, 7]) {
      _p.copy(ac.position).addScaledVector(ac.velocity, t);
      const h = map.surfaceAt(_p.x, _p.z);
      const clear = _p.y - h;
      if (clear < minClear * (t / 7 + 0.4)) danger = Math.max(danger, 1 - clear / (minClear * (t / 7 + 0.4)));
    }
    const agl = ac.position.y - map.surfaceAt(ac.position.x, ac.position.z);
    if (danger > 0 || agl < (this.role === 'civil' ? 45 : 120)) {
      _dir.copy(ac.velocity).setY(0).normalize();
      _dir.y = 0.8 + danger;
      this.steer(_dir, 1, false);
      c.pitch = Math.max(c.pitch, 0.6);
      c.throttle = 1;
      this.mode = 'terrain';
      return;
    }

    // --- civil traffic: follow the route or circuit, never fight
    if (this.role === 'civil') {
      this.mode = 'cruise';
      if (this.route && this.route.length) {
        const wp = this.route[Math.min(this.routeIndex, this.route.length - 1)];
        this.civilFly(wp, wp.y, wp.speed || 225);
        if (Math.hypot(wp.x - ac.position.x, wp.z - ac.position.z) < 1500 && this.routeIndex < this.route.length - 1) this.routeIndex++;
        else if (this.routeIndex >= this.route.length - 1 && this.loop && Math.hypot(wp.x - ac.position.x, wp.z - ac.position.z) < 1500) this.routeIndex = 0;
        return;
      }
      _t.subVectors(ac.position, this.patrolCenter).setY(0);
      const r = _t.length() || 1;
      const tangent = new THREE.Vector3(-_t.z, 0, _t.x).divideScalar(r);
      _p.copy(this.patrolCenter).addScaledVector(_t.divideScalar(r), this.patrolRadius).addScaledVector(tangent, 4000);
      this.civilFly(_p, this.patrolAlt, 225);
      return;
    }

    this.retargetTimer -= dt;
    if (this.retargetTimer <= 0) {
      this.retargetTimer = 1.5 + this.reaction * 2;
      if (this.role === 'fighter' || this.role === 'escort') this.target = this._pickTarget(battle);
    }

    // --- 2. Missile defence
    const threats = battle.weapons.threatsTo(ac);
    let threat = null, tDist = Infinity;
    for (const m of threats) {
      const d = m.pos.distanceTo(ac.position);
      if (d < tDist) { tDist = d; threat = m; }
    }
    if (threat && tDist < 3500 + this.skill * 2500 && this.role !== 'drone') {
      this.mode = 'evade';
      _t.subVectors(threat.pos, ac.position).normalize();
      // beam the missile: turn perpendicular to it, slightly nose-low
      _dir.crossVectors(_t, new THREE.Vector3(0, 1, 0)).multiplyScalar(this.breakDir);
      _dir.y = -0.25;
      this.steer(_dir, 1);
      c.throttle = 1;
      this.flareTimer -= dt;
      if (this.flareTimer <= 0 && tDist < 2200 && ac.flares > 0) {
        this.flareTimer = 0.9 - this.skill * 0.5 + Math.random() * 0.6;
        c.flare = Math.random() < 0.35 + this.skill * 0.6;
      }
      return;
    }
    if (!threat) this.breakDir = Math.random() < 0.5 ? -1 : 1;

    // --- 3./4. Combat
    const tgt = this.target && this.target.alive && !this.target.dying ? this.target : null;
    if (tgt && (this.aggressive || ac.lastAttacker)) {
      _t.subVectors(tgt.position, ac.position);
      const dist = _t.length();
      _fwd.set(0, 0, -1).applyQuaternion(ac.quaternion);
      // is the enemy behind us and close?
      const tgtFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(tgt.quaternion);
      const toUs = _t.clone().negate().divideScalar(dist);
      const onOurSix = tgtFwd.dot(toUs) > 0.94 && _fwd.dot(_t) < -0.3 * dist && dist < 1600;
      if (onOurSix && this.skill > 0.25) {
        this.mode = 'defend';
        this.breakTimer -= dt;
        if (this.breakTimer <= 0) {
          this.breakTimer = 2 + Math.random() * 2;
          this.breakDir *= -1;
          this.jink.set((Math.random() - 0.5), (Math.random() - 0.3) * 0.8, (Math.random() - 0.5));
        }
        _dir.crossVectors(_fwd, new THREE.Vector3(0, 1, 0)).multiplyScalar(this.breakDir).add(this.jink).add(_fwd.clone().multiplyScalar(0.2));
        this.steer(_dir, 1);
        c.throttle = 1;
        if (Math.random() < dt * this.skill * 0.5 && ac.flares > 0) c.flare = true;
        return;
      }
      this.mode = 'attack';
      // lead pursuit for guns, pure pursuit when far
      const lead = THREE.MathUtils.clamp(dist / 1000, 0, 1.4);
      _p.copy(tgt.position).addScaledVector(tgt.velocity, dist < 2500 ? lead : 0);
      // aim error / jitter
      this.jinkTimer -= dt;
      if (this.jinkTimer <= 0) {
        this.jinkTimer = 0.4 + Math.random() * 0.8;
        this.jink.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.aimError * dist * 1.6);
      }
      _p.add(this.jink);
      _dir.subVectors(_p, ac.position);
      const off = this.steer(_dir, 1);
      // throttle management
      const closing = -_t.clone().divideScalar(dist).dot(new THREE.Vector3().subVectors(tgt.velocity, ac.velocity));
      if (dist < 700 && closing > 60) {
        c.throttle = 0.45;
        c.airbrake = closing > 120;
      } else if (dist > 3000 || speed < 180) c.throttle = 1;
      else c.throttle = 0.88;
      // guns
      if (dist < 950 && off < 0.045 + this.aimError && ac.gunAmmo > 0) c.gun = true;
      // missiles
      const canMissile = this.skill > 0.2 && ac.missiles > 0 && ac.missileCooldown <= 0;
      const typeKey = dist > 4000 ? 'radar' : 'ir';
      if (canMissile && battle.weapons.canLock(ac, tgt, typeKey)) {
        this.lockTimer += dt;
        if (tgt.isPlayer) battle.onPlayerLocked(ac, this.lockTimer);
        if (this.lockTimer > 2.6 - this.skill * 1.4) {
          battle.weapons.launchMissile(ac, tgt, typeKey);
          ac.missiles--;
          ac.missileCooldown = 9 - this.skill * 4 + Math.random() * 4;
          this.lockTimer = 0;
        }
      } else this.lockTimer = Math.max(0, this.lockTimer - dt * 2);
      return;
    }

    // --- 5. Route / patrol
    this.mode = 'patrol';
    c.throttle = this.cruise;
    if (this.escortOf && this.escortOf.alive) {
      const e = this.escortOf;
      _p.copy(e.position).add(new THREE.Vector3(80, 60, 120).applyQuaternion(e.quaternion));
      _dir.subVectors(_p, ac.position);
      const d = _dir.length();
      _dir.addScaledVector(e.velocity, 2).normalize();
      this.steer(_dir, 0.7, false);
      c.throttle = THREE.MathUtils.clamp(0.7 + (d - 150) / 800, 0.4, 0.98);
      return;
    }
    if (this.route && this.route.length) {
      const wp = this.route[this.routeIndex];
      const d = this.levelToward(wp, wp.y);
      if (d < 900) {
        this.routeIndex++;
        if (this.routeIndex >= this.route.length) this.routeIndex = this.loop ? 0 : this.route.length - 1;
      }
      return;
    }
    // circle the patrol centre; drones and patrols keep changing direction
    // and height so they are not sitting ducks
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = (this.role === 'drone' ? 5 : 9) + Math.random() * 8;
      const k = this.role === 'drone' ? 1600 : 900;
      this.wander.set((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * (this.role === 'drone' ? 500 : 250), (Math.random() - 0.5) * 2 * k);
      if (Math.random() < 0.3) this.patrolDir = -(this.patrolDir || 1);
    }
    _t.subVectors(ac.position, this.patrolCenter).setY(0);
    const r = _t.length() || 1;
    const dirSign = this.patrolDir || 1;
    const tangent = new THREE.Vector3(-_t.z, 0, _t.x).divideScalar(r).multiplyScalar(dirSign);
    _p.copy(this.patrolCenter).addScaledVector(_t.divideScalar(r), this.patrolRadius).addScaledVector(tangent, 2500).add(this.wander);
    this.levelToward(_p, this.patrolAlt + this.wander.y);
  }
}
