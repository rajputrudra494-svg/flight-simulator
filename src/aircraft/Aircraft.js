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
    this.civil = this.team === 'civil' || !!spec.civil;
    // sonic boom bookkeeping (hysteresis so the boom fires once per crossing)
    this.supersonic = false;
    this.booms = 0;
    this.ai = null;
    this.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, airbrake: false, gear: !!opts.gear, brakes: false, reverse: false, chute: false, gun: false, missile: false, flare: false };
    const w = spec.weapons;
    this.gunAmmo = opts.gunAmmo ?? w.gunAmmo;
    this.missiles = opts.missiles ?? w.missiles;
    this.bombs = opts.bombs ?? w.bombs ?? 0;
    this.flares = opts.flares ?? w.flares;
    // weapons-bay doors stay open for a moment after each release
    this.bayTimer = 0;
    this.unarmed = !!spec.unarmed;
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
    this.mainWheelPoints = this.model.mainWheelPoints || [];
    this.brakeSmokeT = 0;
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
      con: this.model.exhausts.map(() => trailSystem.create({ width: this.model.airliner ? 2.4 : 1.6, life: this.model.airliner ? 14 : 9, color: [1.5, 1.5, 1.55], maxPoints: 90, minDist: 25, growth: 4 })),
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
    // a missile's warhead or a fuel tank going up tears the airframe apart in
    // the air; otherwise it burns and goes down, sometimes shedding a wing
    const blast = source && source.type === 'missile' ? 0.45 : 0.2;
    if (this.fm.onGround || Math.random() < blast) this.explode(battle, { air: !this.fm.onGround });
    else if (battle && battle.wreckage && Math.random() < 0.45) {
      const side = Math.random() < 0.5 ? 'L' : 'R';
      if (battle.wreckage.breakUp(this, { only: 'wing' + side, impulse: 10 })) {
        // asymmetric lift: it rolls hard towards the missing wing
        this.spin = (side === 'L' ? -1 : 1) * (2.2 + Math.random());
        battle.effects.explosion(this.position, 0.6);
      }
    }
  }

  // Destroyed: fireball and break-up. Hitting the ground or the sea gives a
  // fuel fireball (or a splash) with wreckage strewn along the impact path.
  explode(battle, opts = {}) {
    if (!this.alive) return;
    this.alive = false;
    if (battle) {
      const map = battle.map;
      const water = !!opts.water || (this.fm.crashed && map.heightAt(this.position.x, this.position.z) < map.waterLevel);
      const ground = !opts.air && (this.fm.crashed || this.fm.onGround);
      const scale = Math.min(3.2, Math.max(1.2, Math.sqrt(this.fm.mass / 9000)));
      if (water) battle.effects.waterCrash(this.position, this.velocity, scale);
      else if (ground) battle.effects.crashFireball(this.position, this.velocity, scale * 0.8);
      else battle.effects.bigExplosion(this.position, this.velocity, scale);
      this.wreckFocus = battle.wreckage ? battle.wreckage.breakUp(this, { ground, water, impulse: ground ? 10 : 18 }) : null;
    }
    this.root.visible = false;
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
      this.explode(battle, { water: /sea|ditch/i.test(this.fm.crashReason || '') });
      return;
    }
    this.bayTimer = Math.max(0, this.bayTimer - dt);
    this.syncVisual();
    const fm = this.fm;
    if (fm.events.length) this._drainEvents(battle);
    this.model.animate(dt, {
      pitch: c.pitch, roll: c.roll, yaw: c.yaw, throttle: fm.throttle, ab: fm.afterburner, gear: c.gear,
      mach: fm.mach, gLoad: fm.gLoad, alpha: fm.alpha, speed: fm.airspeed, altitude: this.position.y,
      lightGlow: battle.world ? battle.world.nightFactor : 0,
      // airliner speedbrakes in flight use the same panels as the ground spoilers
      spoilers: Math.max(fm.spoilers, this.model.airliner ? fm.airbrake : 0), airbrake: fm.airbrake,
      reverser: fm.reverser.deploy, chute: fm.chute.inflate, chuteState: fm.chute.state, bay: this.bayTimer > 0,
    });
    // glowing-hot brakes smoke from the wheel wells
    if (fm.brakeTemp > 850 && fm.gearDown && battle.effects && this.mainWheelPoints.length) {
      this.brakeSmokeT -= dt;
      if (this.brakeSmokeT <= 0) {
        this.brakeSmokeT = 0.12 - Math.min(0.08, (fm.brakeTemp - 850) / 2000);
        const wp = this.mainWheelPoints[Math.floor(Math.random() * this.mainWheelPoints.length)];
        battle.effects.brakeSmoke(this.worldPoint(wp, _v), this.velocity);
      }
    }
    // breaking the sound barrier
    if (!this.supersonic && fm.mach >= 1.0 && !this.dying) {
      this.supersonic = true;
      this.booms++;
      battle.onSonicBoom?.(this);
    } else if (this.supersonic && fm.mach < 0.97) {
      this.supersonic = false;
    }
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
        this.worldPoint(this.model.exhausts[i], _v);
        _v.addScaledVector(this.forward, -6);
        this.trails.con[i].add(_v, contrail * 0.75, t);
      }
      const dmg = 1 - this.health / this.maxHealth;
      const smoke = this.dying ? 0.9 : dmg > 0.5 ? (dmg - 0.5) * 1.4 : 0;
      this.worldPoint(this.model.exhausts[0], _v);
      this.trails.smoke.add(_v, smoke, t);
    }
    if ((this.dying || this.health < this.maxHealth * 0.3) && battle.effects) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.05;
        battle.effects.burning(this.worldPoint(this.model.exhausts[0], _v), this.velocity, this.dying ? 1.4 : 0.6);
      }
    }
  }

  // Flight-model events: effects and sounds here, game logic via the battle
  _drainEvents(battle) {
    const fm = this.fm;
    for (const ev of fm.events) {
      if (ev.type === 'touchdown') {
        const strength = Math.min(1.6, 0.5 + ev.speed / 120 - ev.vs * 0.12);
        if (battle.effects) for (const wp of this.mainWheelPoints) battle.effects.tyreSmoke(this.worldPoint(wp, _v), this.velocity, strength);
        battle.audio?.touchdown?.(ev.vs, ev.speed, this.position, this.isPlayer);
      } else if (ev.type === 'nosewheel') {
        if (this.isPlayer) battle.audio?.nosewheel?.();
      } else if (ev.type === 'chute') {
        if (this.isPlayer) battle.audio?.chute?.(ev.state);
      }
      battle.onAircraftEvent?.(this, ev);
    }
    fm.events.length = 0;
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
    this.bombs = w.bombs || 0;
    this.flares = w.flares;
    for (const s of this.model.missileSlots) {
      s.used = false;
      s.mesh.visible = !s.internal;
    }
    // ground crew repack the chute and the brakes get time to cool
    this.fm.repackChute();
    this.fm.coolBrakes();
    this.controls.chute = false;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.detachTrails();
    this.model.dispose();
  }
}
