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

const _n = new THREE.Vector3();

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
    this.listeners = {};
    this.player = null;
    const sunLight = world.sunColor.clone().multiplyScalar(0.65).add(world.skyAmbient.clone().multiplyScalar(0.45));
    this.effects.particles.setLighting(sunLight);
    this.trails.setLighting(sunLight);
    const map = this.map;
    const groundResult = { h: 0, water: false, landable: false, runway: false };
    this.env = {
      groundAt: (x, z) => {
        const h = map.heightAt(x, z);
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
        if (groundResult.runway) groundResult.landable = true;
        else {
          map.normalAt(x, z, _n);
          groundResult.landable = _n.y > 0.985;
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
    this.weapons.update(dt);
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

  hostilesOf(team) {
    const out = [];
    for (const a of this.aircraft) if (a.alive && !a.dying && a.team !== team) out.push(a);
    for (const g of this.ground) if (g.alive && g.team !== team) out.push(g);
    return out;
  }

  dispose() {
    for (const ac of this.aircraft) ac.dispose(this.scene);
    for (const g of this.ground) g.dispose();
    this.aircraft = [];
    this.ground = [];
    this.weapons.dispose();
    this.effects.dispose();
    this.trails.dispose();
  }
}
