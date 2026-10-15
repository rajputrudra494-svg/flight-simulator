// Aircraft entity: visual model + flight model + weapons state + damage.
import * as THREE from 'three';
import { JetModel } from './JetBuilder.js';
import { FlightModel } from './FlightModel.js';

let nextId = 1;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Aircraft {
  constructor(spec, quality, opts = {}) {
    this.id = nextId++;
    this.spec = spec;
    this.kind = 'air';
    this.team = opts.team || 'enemy';
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || spec.name;
    this.callsign = opts.callsign || '';
    this.model = new JetModel(spec, quality, { gear: !!opts.gear });
    this.fm = new FlightModel(spec.flight);
    if (opts.massScale) this.fm.mass *= opts.massScale;
    this.fm.gearHeight = this.model.gearHeight;
    this.root = this.model.root;
    this.position = this.fm.position;
    this.velocity = this.fm.velocity;
    this.quaternion = this.fm.quaternion;
    this.radius = Math.max(4.5, this.model.length * 0.33);
    this.maxHealth = (opts.healthScale || 1) * spec.health;
    this.health = this.maxHealth;
    this.alive = true;
    this.dying = false;
    this.dyingTime = 0;
    this.isTarget = opts.isTarget ?? this.team === 'enemy';
    this.ai = null;
    this.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, airbrake: false, gear: !!opts.gear, brakes: false, gun: false, missile: false, flare: false };
    const w = spec.weapons;
    this.gunAmmo = opts.gunAmmo ?? w.gunAmmo;
    this.missiles = opts.missiles ?? w.missiles;
    this.flares = opts.flares ?? w.flares;
    this.gunCooldown = 0;
    this.missileCooldown = 0;
    this.flareCooldown = 0;
    this.slotIndex = 0;
    this.heat = 1;
    this.lastHitTime = -10;
    this.lastAttacker = null;
    this.trails = null;
    this.smokeTimer = 0;
    this.gunFiring = false;
    this.incoming = 0;
    this.lockedBy = 0;
    this.kills = 0;
    this.hits = 0;
    this.shots = 0;
    this.lockTarget = null;
  }

  place(position, heading, speed, pitch = 0) {
    const e = new THREE.Euler(THREE.MathUtils.degToRad(pitch), -THREE.MathUtils.degToRad(heading), 0, 'YXZ');
    _q.setFromEuler(e);
    this.fm.reset(position, _q, speed);
    this.fm.throttle = this.controls.throttle;
    this.syncVisual();
  }

  placeOnRunway(position, heading) {
    this.place(position, heading, 0, 0);
    this.fm.onGround = true;
    this.fm.gearDown = true;
    this.controls.gear = true;
    this.controls.throttle = 0;
    this.fm.throttle = 0;
    this.model.gearDeploy = 1;
    this.syncVisual();
  }

  attachTrails(trailSystem) {
    this.trails = {
      sys: trailSystem,
      tipL: trailSystem.create({ width: 0.35, life: 1.6, color: [1.6, 1.6, 1.7], maxPoints: 50, minDist: 6, growth: 2 }),
      tipR: trailSystem.create({ width: 0.35, life: 1.6, color: [1.6, 1.6, 1.7], maxPoints: 50, minDist: 6, growth: 2 }),
      con: this.model.flames.map(() => trailSystem.create({ width: 1.6, life: 9, color: [1.5, 1.5, 1.55], maxPoints: 90, minDist: 25, growth: 4 })),
      smoke: trailSystem.create({ width: 2.4, life: 7, color: [0.12, 0.12, 0.12], maxPoints: 90, minDist: 10, growth: 5 }),
    };
  }

  detachTrails() {
    if (!this.trails) return;
    const t = this.trails;
    for (const tr of [t.tipL, t.tipR, ...t.con, t.smoke]) {
      tr.stop();
      t.sys.remove(tr);
    }
    this.trails = null;
  }

  get forward() {
    return _w.set(0, 0, -1).applyQuaternion(this.quaternion);
  }

  worldPoint(local, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(this.quaternion).add(this.position);
  }

  damage(amount, source, battle) {
    if (!this.alive || this.dying) return;
    this.health -= amount;
    this.lastHitTime = battle ? battle.time : 0;
    this.lastAttacker = source || null;
    if (this.health <= 0) {
      this.health = 0;
      this.kill(source, battle);
    }
  }

  kill(source, battle) {
    if (this.dying || !this.alive) return;
    this.dying = true;
    this.dyingTime = 0;
    this.spin = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.5);
    if (source && source.owner && source.owner !== this) source.owner.kills++;
    if (battle) battle.onAircraftKilled(this, source);
    // some aircraft just disintegrate immediately
    if (Math.random() < 0.35 || this.fm.onGround) this.explode(battle);
  }

  explode(battle) {
    if (!this.alive) return;
    this.alive = false;
    this.root.visible = false;
    if (battle) battle.effects.bigExplosion(this.position, this.velocity, 1.6);
    this.detachTrails();
  }

  update(dt, battle) {
    if (!this.alive) return;
    const c = this.controls;
    if (this.dying) {
      this.dyingTime += dt;
      c.roll = this.spin;
      c.pitch = -0.3;
      c.throttle = 0.2;
      c.gun = c.missile = false;
      if (this.dyingTime > 10) this.explode(battle);
    }
    this.fm.update(dt, c, battle.env);
    if (this.fm.crashed) {
      if (!this.dying) battle.onAircraftCrashed(this, this.fm.crashReason);
      this.dying = true;
      this.explode(battle);
      return;
    }
    this.syncVisual();
    const fm = this.fm;
    this.model.animate(dt, {
      pitch: c.pitch, roll: c.roll, yaw: c.yaw, throttle: fm.throttle, ab: fm.afterburner, gear: c.gear,
    });
    this.heat = 0.4 + fm.throttle * 0.6 + fm.afterburner * 1.5;

    // Weapons
    this.gunCooldown -= dt;
    this.missileCooldown -= dt;
    this.flareCooldown -= dt;
    this.gunFiring = false;
    if (c.gun && this.gunAmmo > 0 && !this.dying) {
      const interval = 1 / this.spec.weapons.gunRate;
      let shots = 0;
      while (this.gunCooldown <= 0 && this.gunAmmo > 0 && shots < 6) {
        this.gunCooldown += interval;
        this.gunAmmo--;
        this.shots++;
        shots++;
        battle.weapons.fireGun(this);
      }
      this.gunFiring = true;
    }
    if (this.gunCooldown < 0) this.gunCooldown = 0;
    if (c.flare && this.flares > 0 && this.flareCooldown <= 0) {
      this.flareCooldown = 0.35;
      this.flares--;
      battle.weapons.dropFlares(this);
    }

    // Trails
    if (this.trails) {
      const t = battle.time;
      const vortex = Math.max(0, Math.min(1, (Math.abs(fm.gLoad) - 4.5) / 3)) * Math.min(1, fm.airspeed / 120);
      this.trails.tipL.add(this.worldPoint(this.model.wingtips[1], _v), vortex * 0.55, t);
      this.trails.tipR.add(this.worldPoint(this.model.wingtips[0], _v), vortex * 0.55, t);
      const contrail = Math.max(0, Math.min(1, (this.position.y - 7600) / 900));
      for (let i = 0; i < this.trails.con.length; i++) {
        this.worldPoint(this.model.flames[i].exit, _v);
        _v.addScaledVector(this.forward, -6);
        this.trails.con[i].add(_v, contrail * 0.75, t);
      }
      const dmg = 1 - this.health / this.maxHealth;
      const smoke = this.dying ? 0.9 : dmg > 0.5 ? (dmg - 0.5) * 1.4 : 0;
      this.worldPoint(this.model.flames[0].exit, _v);
      this.trails.smoke.add(_v, smoke, t);
    }
    if ((this.dying || this.health < this.maxHealth * 0.3) && battle.effects) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.05;
        battle.effects.burning(this.worldPoint(this.model.flames[0].exit, _v), this.velocity, this.dying ? 1.4 : 0.6);
      }
    }
  }

  syncVisual() {
    this.root.position.copy(this.fm.position);
    this.root.quaternion.copy(this.fm.quaternion);
  }

  nextMissileSlot() {
    const slots = this.model.missileSlots;
    if (!slots.length) return null;
    for (let k = 0; k < slots.length; k++) {
      const s = slots[(this.slotIndex + k) % slots.length];
      if (!s.used) {
        this.slotIndex = (this.slotIndex + k + 1) % slots.length;
        return s;
      }
    }
    // all visual slots used: reuse one (reloads are not shown)
    return slots[this.slotIndex++ % slots.length];
  }

  rearm() {
    const w = this.spec.weapons;
    this.gunAmmo = w.gunAmmo;
    this.missiles = w.missiles;
    this.flares = w.flares;
    for (const s of this.model.missileSlots) {
      s.used = false;
      s.mesh.visible = !s.internal;
    }
  }

  dispose(scene) {
    scene.remove(this.root);
    this.detachTrails();
    this.model.dispose();
  }
}
