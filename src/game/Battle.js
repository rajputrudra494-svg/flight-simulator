// Runtime container for a mission: entities, weapons, effects, trails and
// the event hooks the mission logic and HUD listen to.
import * as THREE from 'three';
import { Aircraft } from '../aircraft/Aircraft.js';
import { AIPilot } from '../aircraft/AIPilot.js';
import { JETS } from '../aircraft/jets.js';
import { Weapons } from '../combat/Weapons.js';
import { GroundUnit } from '../combat/GroundUnits.js';
import { Effects } from '../fx/Effects.js';
import { TrailSystem } from '../fx/Trails.js';
import { Wreckage } from '../fx/Wreckage.js';

const _n = new THREE.Vector3();
const _d = new THREE.Vector3();
const _vd = new THREE.Vector3();

const AIRLINES = ['NOVA', 'SKYWARD', 'AZURE', 'SAHARA', 'NORDIC', 'SPEEDBIRD', 'HORIZON'];

export class Battle {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this.scene = world.scene;
    this.map = world.map;
    this.camera = game.camera;
    this.quality = game.quality;
    this.audio = game.audio;
    this.time = 0;
    this.aircraft = [];
    this.ground = [];
    this.trails = new TrailSystem(this.scene);
    this.effects = new Effects(this, this.quality);
    this.weapons = new Weapons(this, this.quality);
    this.wreckage = new Wreckage(this, this.quality);
    this.listeners = {};
    this.player = null;
    const sunLight = world.sunColor.clone().multiplyScalar(0.65).add(world.skyAmbient.clone().multiplyScalar(0.45));
    this.effects.particles.setLighting(sunLight);
    this.trails.setLighting(sunLight);
    const map = this.map;
    const groundResult = { h: 0, water: false, landable: false, runway: false, building: false, mu: 0.62, condition: 'dry' };
    const rwSurface = map.runwayCondition || { condition: 'dry', mu: 0.62 };
    const grassMu = map.def.id === 'arctic' ? 0.25 : 0.35;
    this.env = {
      groundAt: (x, z, y = Infinity) => {
        const h = map.heightAt(x, z);
        const roof = map.buildingTopAt(x, z, y);
        if (roof > Math.max(h, map.waterLevel)) {
          groundResult.h = roof;
          groundResult.water = false;
          groundResult.landable = false;
          groundResult.runway = false;
          groundResult.building = true;
          return groundResult;
        }
        groundResult.building = false;
        if (h < map.waterLevel) {
          groundResult.h = map.waterLevel;
          groundResult.water = true;
          groundResult.landable = false;
          groundResult.runway = false;
          return groundResult;
        }
        groundResult.h = h;
        groundResult.water = false;
        groundResult.runway = map.isOnRunway(x, z);
        if (groundResult.runway) {
          groundResult.landable = true;
          groundResult.mu = rwSurface.mu;
          groundResult.condition = rwSurface.condition;
        } else {
          map.normalAt(x, z, _n);
          groundResult.landable = _n.y > 0.985;
          groundResult.mu = grassMu;
          groundResult.condition = 'grass';
        }
        return groundResult;
      },
    };
  }

  on(evt, fn) {
    (this.listeners[evt] || (this.listeners[evt] = [])).push(fn);
  }

  emit(evt, ...args) {
    const l = this.listeners[evt];
    if (l) for (const fn of l) fn(...args);
  }

  spawnAircraft(jetId, opts = {}) {
    const spec = JETS[jetId] || JETS.f16;
    const ac = new Aircraft(spec, this.quality, opts);
    this.scene.add(ac.root);
    ac.attachTrails(this.trails);
    if (this.world.vaporLight) ac.model.setVaporLight(this.world.vaporLight);
    if (opts.position) {
      if (opts.onRunway) ac.placeOnRunway(opts.position, opts.heading || 0);
      else ac.place(opts.position, opts.heading || 0, opts.speed ?? 220, opts.pitch || 0);
    }
    if (!opts.isPlayer) {
      new AIPilot(ac, opts.ai || {});
      ac.controls.throttle = opts.ai?.cruise ?? 0.8;
      ac.fm.throttle = ac.controls.throttle;
    }
    this.aircraft.push(ac);
    if (opts.isPlayer) this.player = ac;
    return ac;
  }

  // Background airliner traffic flying wide circuits around a point.
  spawnTraffic(count, { center, radius = 14000, altMin = 1500, altMax = 10500, rand = Math.random } = {}) {
    const ids = ['a320', 'b737', 'b787', 'b777', 'b747', 'a380', 'a320', 'b737', 'b787'];
    const c = center || new THREE.Vector3(this.map.airbase.x, 0, this.map.airbase.z);
    const out = [];
    for (let i = 0; i < count; i++) {
      const id = ids[Math.floor(rand() * ids.length)];
      const a = rand() * Math.PI * 2, r = radius * (0.35 + rand() * 0.65);
      const alt = altMin + rand() * (altMax - altMin);
      const ground = this.map.maxHeightAround(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, 2000);
      const pos = new THREE.Vector3(c.x + Math.cos(a) * r, Math.max(alt, ground + 900), c.z + Math.sin(a) * r);
      const callsign = `${AIRLINES[Math.floor(rand() * AIRLINES.length)]} ${100 + Math.floor(rand() * 899)}`;
      const ac = this.spawnAircraft(id, {
        team: 'civil', isTarget: false, position: pos, heading: (THREE.MathUtils.radToDeg(a) + 90 + 360) % 360, speed: 200 + rand() * 30,
        ai: { role: 'civil', patrolCenter: c.clone().setY(pos.y), patrolRadius: r, patrolAlt: pos.y, cruise: 0.6 }, callsign,
      });
      ac.label = callsign;
      out.push(ac);
    }
    return out;
  }

  spawnGround(type, x, z, heading = 0, opts = {}) {
    const palette = this.map.def.id === 'canyon' ? 'desert' : this.map.def.id === 'arctic' ? 'snow' : 'green';
    const u = new GroundUnit(type, new THREE.Vector3(x, 0, z), heading, { palette, shadows: this.quality.shadows, ...opts });
    u.attach(this.scene, this.map);
    this.ground.push(u);
    return u;
  }

  // ---- events (forwarded to mission + HUD) --------------------------------
  onAircraftKilled(ac, source) { this.emit('aircraftKilled', ac, source); }
  onAircraftCrashed(ac, reason) { this.emit('aircraftCrashed', ac, reason); }
  onGroundKilled(u, source) { this.emit('groundKilled', u, source); }
  onPlayerHit(target) { this.emit('playerHit', target); }
  onPlayerDamaged(amount, source) { this.emit('playerDamaged', amount, source); }
  onMissileLaunched(m) { this.emit('missileLaunched', m); }
  onFlares(owner) { this.emit('flares', owner); }
  // flight-model events: touchdown, reversers, spoilers, autobrake, chute, RTO
  onAircraftEvent(ac, ev) { this.emit('aircraftEvent', ac, ev); }
  onSonicBoom(ac) {
    this.effects.sonicBoom(ac);
    // the pilot only feels a jolt; outside observers hear it when the cone arrives
    if (ac.isPlayer && this.game.rig && this.game.rig.mode === 'cockpit') this.audio?.sonicBoom(0.35, true);
    this.emit('sonicBoom', ac);
  }
  onPlayerLocked(by, t) {
    if (this.player && t > 0.4) this.player.lockedBy = Math.max(this.player.lockedBy, 1);
    this.emit('playerLocked', by, t);
  }

  update(dt) {
    this.time += dt;
    if (this.player) {
      this.player.incoming = this.weapons.threatsTo(this.player).length;
      this.player.lockedBy = 0;
    }
    for (const g of this.ground) g.update(dt, this);
    for (const ac of this.aircraft) {
      if (ac.ai) ac.ai.update(dt, this);
      ac.update(dt, this);
    }
    this._supersonicEffects(dt);
    this.weapons.update(dt);
    this.wreckage.update(dt);
    this.effects.update(dt, this.camera);
    this.trails.update(dt, this.camera);
    // remove destroyed AI aircraft after their trails have faded
    for (let i = this.aircraft.length - 1; i >= 0; i--) {
      const ac = this.aircraft[i];
      if (!ac.alive && !ac.isPlayer) {
        ac.deadTime = (ac.deadTime || 0) + dt;
        if (ac.deadTime > 2) {
          ac.dispose(this.scene);
          this.aircraft.splice(i, 1);
        }
      }
    }
  }

  // Mach cone sweeping over the listener -> boom; low supersonic passes over
  // water kick up a rooster tail of spray.
  _supersonicEffects(dt) {
    const cam = this.camera;
    const cockpit = this.game.rig && this.game.rig.mode === 'cockpit';
    for (const ac of this.aircraft) {
      if (!ac.alive) continue;
      const fm = ac.fm;
      if (fm.mach < 1.0) {
        ac._coneIn = false;
        continue;
      }
      const v = fm.airspeed || 1;
      _d.subVectors(cam.position, ac.position);
      const dist = _d.length();
      let inside = false;
      if (dist > 1) {
        const cosA = -_d.dot(_vd.copy(ac.velocity).divideScalar(v)) / dist;
        const mu = Math.asin(Math.min(1, 1 / fm.mach));
        inside = cosA > Math.cos(mu);
      }
      if (inside && !ac._coneIn && dist < 16000 && !(ac.isPlayer && cockpit)) {
        const gain = 1.2 / (1 + dist / 1800);
        this.audio?.sonicBoom(gain, false);
        if (dist < 2500) this.effects.shake = Math.max(this.effects.shake, 0.9 * (1 - dist / 2500));
      }
      ac._coneIn = inside;
      // spray over water at very low level
      const agl = ac.position.y - this.map.waterLevel;
      if (agl < 45 && this.map.heightAt(ac.position.x, ac.position.z) < this.map.waterLevel - 1) {
        ac._sprayT = (ac._sprayT || 0) - dt;
        if (ac._sprayT <= 0) {
          ac._sprayT = 0.03;
          this.effects.waterSpray(_d.set(ac.position.x, this.map.waterLevel, ac.position.z), ac.velocity, 1 - agl / 45);
        }
      }
    }
  }

  hostilesOf(team) {
    const out = [];
    for (const a of this.aircraft) if (a.alive && !a.dying && a.team !== team && a.team !== 'civil') out.push(a);
    for (const g of this.ground) if (g.alive && g.team !== team) out.push(g);
    return out;
  }

  dispose() {
    for (const ac of this.aircraft) ac.dispose(this.scene);
    for (const g of this.ground) g.dispose();
    this.aircraft = [];
    this.ground = [];
    this.weapons.dispose();
    this.wreckage.dispose();
    this.effects.dispose();
    this.trails.dispose();
  }
}
