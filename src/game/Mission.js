// Mission runtime: builds the scenario through a small scripting context,
// tracks objectives / waves / failure conditions and computes the score.
import * as THREE from 'three';
import { mulberry32 } from '../world/noise.js';
import { Rings } from './Rings.js';

const _v = new THREE.Vector3();

export class Mission {
  constructor(game, def, options = {}) {
    this.game = game;
    this.def = def;
    this.options = options;
    this.free = !!options.free;
    this.status = 'running';
    this.time = 0;
    this.endTimer = 0;
    this.objectives = [];
    this.waves = [];
    this.failChecks = [];
    this.entities = [];
    this.rings = null;
    this.messages = [];
    this.radioLog = [];
    // story radio lines issued before the ATC exists (during setup) wait here
    this.pendingRadio = [];
    this.score = 0;
    this.kills = { air: 0, ground: 0 };
    this.ringScore = 0;
    this.failReason = '';
    this.outTimer = 0;
    this.ceilingAlt = null;
    this.ceilingTimer = 0;
    this.center = new THREE.Vector3();
    this.areaRadius = options.free ? Infinity : def.areaRadius || 24000;
    this.prevPos = new THREE.Vector3();
    this.landed = false;
    this.wasAirborne = false;
    this.airborneTime = 0;
    this.respawnTimer = 0;
    this.booms = 0;
    this.civilLosses = 0;
    this.loadout = null;
    if (def.forceJet) this.options.jetId = def.forceJet;
  }

  onSonicBoom() {
    this.booms++;
    if (this.booms === 1 || this.free) this.message(`SONIC BOOM  x${this.booms}`, 'ring');
  }

  setup(battle) {
    this.battle = battle;
    const map = battle.map;
    const def = this.def;
    const self = this;
    const rand = mulberry32((map.def.seed * 31 + (def.id || 'free').length * 7) >>> 0);
    this.rand = rand;
    const ctx = {
      battle, map, rand,
      startAir(pos, heading, speed, throttle = 0.8) {
        self.start = { pos: pos.clone(), heading, speed, throttle, runway: false };
        self.wasAirborne = true;
        self._spawnPlayer();
      },
      startRunway() {
        const ab = map.airbase;
        const u = -ab.length / 2 + 120;
        const p = map.fromAirbaseLocal(u, 0);
        self.start = { pos: new THREE.Vector3(p.x, ab.elevation, p.z), heading: ab.heading, speed: 0, throttle: 0, runway: true };
        self._spawnPlayer();
      },
      rings(points, opts = {}) {
        self.rings = new Rings(battle.scene, points, opts);
        self.rings.minMach = opts.minMach || 0;
        if (!opts.optional) self.objectives.push({ type: 'rings', text: 'Fly through the checkpoints', required: true });
      },
      enemyAir(jetId, pos, heading, opts = {}) {
        const ac = battle.spawnAircraft(jetId, {
          team: 'enemy', position: pos, heading, speed: opts.speed ?? 220,
          ai: {
            skill: (opts.skill ?? 0.5) * (self.game.settings.difficulty ?? 1),
            role: opts.role === 'drone' ? 'drone' : opts.role === 'bomber' ? 'bomber' : opts.role === 'escort' ? 'escort' : 'fighter',
            route: opts.route, loop: opts.loop, patrolCenter: opts.patrolCenter, patrolRadius: opts.patrolRadius,
            patrolAlt: opts.patrolAlt ?? pos.y, cruise: opts.cruise, aggressive: opts.aggressive, escortOf: opts.escortOf,
            engaged: opts.engaged,
          },
          healthScale: opts.healthScale, missiles: opts.missiles, gunAmmo: opts.gunAmmo, massScale: opts.massScale,
          callsign: opts.label,
        });
        ac.role = opts.role || 'fighter';
        ac.label = opts.label || (opts.role === 'bomber' ? 'BOMBER' : opts.role === 'drone' ? 'DRONE' : ac.spec.name.split(' ')[0]);
        self.entities.push(ac);
        return ac;
      },
      groundAt(type, x, z, heading = 0, opts = {}) {
        let px = x, pz = z;
        if (type !== 'ship') {
          const spot = map.findLandSpot(x, z, opts.radius ?? 600, rand, { maxSlope: type === 'fuel' ? 0.08 : 0.15 });
          px = spot.x; pz = spot.z;
        }
        const u = battle.spawnGround(type, px, pz, heading, { difficulty: self.game.settings.difficulty ?? 1, ...opts });
        self.entities.push(u);
        return u;
      },
      samSite(x, z) {
        const spot = map.findLandSpot(x, z, 900, rand, { maxSlope: 0.12 });
        const sam = ctx.groundAt('sam', spot.x, spot.z, rand() * Math.PI * 2, { radius: 30 });
        for (let i = 0; i < 2; i++) {
          const a = rand() * Math.PI * 2;
          ctx.groundAt('aaa', spot.x + Math.cos(a) * 220, spot.z + Math.sin(a) * 220, 0, { radius: 120 });
        }
        ctx.groundAt('truck', spot.x + 60, spot.z - 40, rand() * 6, { radius: 60 });
        return sam;
      },
      convoy(x, z, headingDeg, n) {
        const spot = map.findLandSpot(x, z, 900, rand, { maxSlope: 0.08 });
        const h = THREE.MathUtils.degToRad(headingDeg);
        for (let i = 0; i < n; i++) {
          const d = i * 28;
          ctx.groundAt(i % 3 === 1 ? 'tank' : 'truck', spot.x + Math.sin(h) * d, spot.z - Math.cos(h) * d, h, { radius: 40 });
        }
      },
      objectiveDestroy(text, filter, opts = {}) {
        self.objectives.push({ type: 'destroy', text, filter, required: true, minCount: opts.minCount || 0 });
      },
      objectiveLand(text) {
        self.objectives.push({ type: 'land', text, required: true });
      },
      wave(fn, opts = {}) {
        self.waves.push({ fn, triggered: false, afterKills: opts.afterKills ?? null, delay: opts.delay ?? null });
      },
      radio(text) {
        self.radio(text);
      },
      failIf(fn, reason) {
        self.failChecks.push({ fn, reason });
      },
      // background airliner traffic
      traffic(count, opts = {}) {
        return battle.spawnTraffic(count, { rand, ...opts });
      },
      // friendly aircraft (escorted airliner, wingmen)
      friendlyAir(jetId, pos, heading, opts = {}) {
        const ac = battle.spawnAircraft(jetId, {
          team: 'player', isTarget: false, position: pos, heading, speed: opts.speed ?? 220,
          ai: { skill: opts.skill ?? 0.6, role: opts.role || 'fighter', route: opts.route, loop: opts.loop ?? false, patrolCenter: opts.patrolCenter, patrolRadius: opts.patrolRadius, patrolAlt: opts.patrolAlt ?? pos.y, cruise: opts.cruise },
          callsign: opts.label,
        });
        ac.label = opts.label || 'FRIENDLY';
        if (opts.priority) ac.priority = opts.priority;
        self.entities.push(ac);
        return ac;
      },
      // air-defence sites inside a city: on rooftops or in parks and squares
      cityTarget(type, x, z, where = 'park', opts = {}) {
        const city = map.city;
        let spot = null;
        if (city) spot = where === 'roof' ? city.roofSpot(x, z, rand, opts.minH ?? 30, opts.maxH ?? 140) : city.openSpot(x, z, rand, opts.radius ?? 2500);
        if (!spot) return ctx.groundAt(type, x, z, rand() * 6.28, opts);
        const u = battle.spawnGround(type, spot.x, spot.z, rand() * Math.PI * 2, { difficulty: self.game.settings.difficulty ?? 1, elevation: where === 'roof' ? spot.y : null, ...opts });
        self.entities.push(u);
        return u;
      },
      objectiveEscort(text, ac, arrived) {
        self.objectives.push({ type: 'escort', text, ac, arrived, required: true, reached: false });
        self.failChecks.push({ fn: () => !ac.alive || ac.dying, reason: `${ac.label || 'The escorted aircraft'} was shot down` });
      },
      objectiveBoom(text, count = 1) {
        self.objectives.push({ type: 'boom', text, count, required: true });
      },
      loadout(l) {
        self.loadout = l;
        self._applyLoadout();
      },
      ceiling(alt, msg) {
        self.ceilingAlt = alt;
        self.ceilingMsg = msg;
      },
    };
    this.ctx = ctx;
    if (this.free) this._setupFree(ctx);
    else def.setup(ctx);
    if (!battle.player) ctx.startAir(new THREE.Vector3(map.airbase.x, map.airbase.elevation + 1000, map.airbase.z), 0, 220);
    this.center.copy(this.start.pos);
    this.prevPos.copy(battle.player.position);
    this.totalTargets = () => this.entities.filter((e) => e.isTarget).length;
  }

  _spawnPlayer() {
    const b = this.battle;
    const s = this.start;
    if (b.player) {
      const i = b.aircraft.indexOf(b.player);
      if (i >= 0) b.aircraft.splice(i, 1);
      b.player.dispose(b.scene);
      b.player = null;
    }
    const ac = b.spawnAircraft(this.options.jetId || 'f16', {
      team: 'player', isPlayer: true, position: s.pos, heading: s.heading, speed: s.speed,
      onRunway: s.runway, gear: s.runway, isTarget: false,
    });
    ac.controls.throttle = s.throttle;
    ac.fm.throttle = s.throttle;
    this.game.onPlayerSpawned(ac);
    this._applyLoadout();
    return ac;
  }

  _applyLoadout() {
    const p = this.battle && this.battle.player;
    if (!p || !this.loadout) return;
    if (this.loadout.missiles !== undefined) p.missiles = Math.min(p.missiles, this.loadout.missiles);
    if (this.loadout.gunAmmo !== undefined) p.gunAmmo = Math.min(p.gunAmmo, this.loadout.gunAmmo);
    if (this.loadout.flares !== undefined) p.flares = Math.min(p.flares, this.loadout.flares);
  }

  _setupFree(ctx) {
    const o = this.options;
    const map = this.battle.map;
    const ab = map.airbase;
    if (o.start === 'runway') ctx.startRunway();
    else ctx.startAir(new THREE.Vector3(ab.x - ab.dirX * 2500, ab.elevation + 900, ab.z - ab.dirZ * 2500), ab.heading, 220);
    const rand = this.rand;
    const n = o.enemies === 'many' ? 6 : o.enemies === 'few' ? 2 : 0;
    const jets = ['mig29', 'su35', 'typhoon', 'fa18', 'f16'];
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const p = new THREE.Vector3(ab.x + Math.cos(a) * 14000, ab.elevation + 2500 + rand() * 1500, ab.z + Math.sin(a) * 14000);
      ctx.enemyAir(jets[i % jets.length], p, rand() * 360, { skill: 0.3 + rand() * 0.4 });
    }
    if (o.ground) {
      for (let i = 0; i < 2; i++) {
        const a = rand() * Math.PI * 2;
        ctx.samSite(ab.x + Math.cos(a) * 9000, ab.z + Math.sin(a) * 9000);
      }
      ctx.convoy(ab.x + 6000, ab.z + 5000, 30, 5);
    }
    if (o.rings) ctx.rings(this._freeRings(), { radius: 55 });
    const traffic = o.traffic === 'heavy' ? 10 : o.traffic === 'light' ? 4 : 0;
    if (traffic) ctx.traffic(traffic, { center: new THREE.Vector3(map.def.city ? map.def.city.x : ab.x, 0, map.def.city ? map.def.city.z : ab.z), radius: 16000 });
    if (n || o.ground) ctx.objectiveDestroy('Destroy all hostiles', (e) => e.isTarget);
  }

  _freeRings() {
    const map = this.battle.map;
    const ab = map.airbase;
    const pts = [];
    let h = ab.heading;
    let p = new THREE.Vector3(ab.x, 0, ab.z);
    for (let i = 0; i < 16; i++) {
      h += (this.rand() - 0.5) * 80;
      const r = THREE.MathUtils.degToRad(h);
      p = new THREE.Vector3(p.x + Math.sin(r) * 2200, 0, p.z - Math.cos(r) * 2200);
      p.y = Math.max(map.maxHeightAround(p.x, p.z, 600), map.waterLevel) + 220;
      pts.push(p);
    }
    return pts;
  }

  radio(text) {
    this.radioLog.push({ text, time: this.time });
    if (this.radioLog.length > 4) this.radioLog.shift();
    const atc = this._atc();
    if (atc) atc.missionRadio(text);
    else this.pendingRadio.push(text);
  }

  _atc() {
    const atc = this.game.atc;
    return atc && atc.mission === this ? atc : null;
  }

  message(text, kind = 'info') {
    this.messages.push({ text, kind, time: this.time });
    if (this.messages.length > 4) this.messages.shift();
  }

  onKill(entity, source) {
    if (!source || !source.owner || !source.owner.isPlayer) return;
    if (entity.team === 'civil' || (entity.team === 'player' && entity !== this.battle.player)) {
      // rules of engagement: shooting down civilians or friendlies costs dearly
      this.civilLosses++;
      this.score -= 1500;
      this.message(`${entity.team === 'civil' ? 'CIVILIAN AIRLINER' : 'FRIENDLY'} DOWN  -1500`, 'fail');
      this._atc()?.onCivilianDown(entity);
      if (this.def.noCivilianLosses) this._fail('Rules of engagement violated');
      return;
    }
    if (entity.kind === 'air') {
      this.kills.air++;
      const pts = entity.role === 'bomber' ? 250 : entity.ai && entity.ai.skill > 0.8 ? 600 : 200;
      this.score += pts;
      this.message(`${entity.label || 'BANDIT'} DESTROYED  +${pts}`, 'kill');
      this._atc()?.onKill(entity, source);
    } else {
      this.kills.ground++;
      const pts = entity.score || 100;
      this.score += pts;
      this.message(`${entity.name} DESTROYED  +${pts}`, 'kill');
      this._atc()?.onKill(entity, source);
    }
  }

  _objectiveState(o) {
    if (o.type === 'rings') {
      const r = this.rings;
      return { done: r.done, progress: `${r.passed}/${r.points.length}`, failed: r.done && r.passed < r.points.length * 0.5 };
    }
    if (o.type === 'destroy') {
      const list = this.entities.filter((e) => o.filter(e));
      const dead = list.filter((e) => !e.alive || e.dying).length;
      const pending = this.waves.some((w) => !w.triggered);
      const done = list.length > 0 && dead === list.length && !pending && dead >= o.minCount;
      return { done, progress: `${dead}/${Math.max(list.length, o.minCount)}` };
    }
    if (o.type === 'land') {
      return { done: this.landed, progress: this.landed ? 'DONE' : this.wasAirborne ? '' : 'TAKE OFF FIRST' };
    }
    if (o.type === 'escort') {
      if (!o.reached && o.ac.alive && !o.ac.dying && o.arrived(o.ac)) o.reached = true;
      const d = o.ac.alive ? Math.round(o.ac.position.distanceTo(this.battle.player ? this.battle.player.position : o.ac.position) / 100) / 10 : 0;
      return { done: o.reached, progress: o.reached ? 'ARRIVED' : o.ac.alive ? `${Math.round((o.ac.health / o.ac.maxHealth) * 100)}% ${d} km` : 'LOST' };
    }
    if (o.type === 'boom') {
      return { done: this.booms >= o.count, progress: `${Math.min(this.booms, o.count)}/${o.count}` };
    }
    return { done: false, progress: '' };
  }

  objectiveLines() {
    return this.objectives.map((o) => {
      const s = this._objectiveState(o);
      return { text: o.text, progress: s.progress, done: s.done };
    });
  }

  update(dt) {
    const b = this.battle;
    const p = b.player;
    this.time += dt;
    if (this.status !== 'running') {
      this.endTimer -= dt;
      if (this.endTimer <= 0 && !this.reported) {
        this.reported = true;
        this.game.onMissionEnd(this.result());
      }
      return;
    }
    // airborne at least once (a landing only counts after a real flight)
    if (p && p.alive && !p.fm.onGround && p.position.y - b.map.surfaceAt(p.position.x, p.position.z) > 40) {
      this.airborneTime += dt;
      if (this.airborneTime > 4) this.wasAirborne = true;
    }
    // Rings
    if (this.rings && p && p.alive) {
      let r = this.rings.update(dt, this.prevPos, p.position);
      if (r === 'pass' && this.rings.minMach && p.fm.mach < this.rings.minMach) {
        // supersonic course: subsonic passes do not count
        this.rings.passed--;
        this.rings.missed++;
        this.message(`TOO SLOW  M${p.fm.mach.toFixed(2)}`, 'warn');
        r = null;
      }
      if (r === 'pass') {
        this.ringScore += 100;
        this.score += 100;
        this.message('CHECKPOINT  +100', 'ring');
        this.game.audio.click();
      } else if (r === 'miss') {
        this.message('CHECKPOINT MISSED', 'warn');
      }
    }
    if (p) this.prevPos.copy(p.position);

    // Waves
    const killsSoFar = this.kills.air + this.kills.ground;
    for (const w of this.waves) {
      if (w.triggered) continue;
      let go = false;
      if (w.afterKills !== null) go = killsSoFar >= w.afterKills;
      else if (w.delay !== null) go = this.time >= w.delay;
      else {
        const alive = this.entities.filter((e) => e.isTarget && e.alive && !e.dying).length;
        go = alive === 0 && this.time > 3;
      }
      if (go) {
        w.triggered = true;
        w.fn();
        break;
      }
    }

    // Landing objective
    if (p && p.alive && p.fm.onGround && b.map.isOnRunway(p.position.x, p.position.z) && p.fm.airspeed < 3) {
      if (!this.landed && this.wasAirborne && this.objectives.some((o) => o.type === 'land')) {
        this.landed = true;
        const td = p.fm.lastTouchdown;
        const bonus = td ? Math.round(Math.max(0, 5 + td.vs) * 120 + (td.runway ? 300 : 0)) : 0;
        this.score += 500 + bonus;
        this.message(`TOUCHDOWN  ${td ? Math.abs(td.vs).toFixed(1) + ' m/s' : ''}  +${500 + bonus}`, 'ring');
      }
      // free flight: rearm on the runway
      if (this.free && (p.missiles < p.spec.weapons.missiles || p.gunAmmo < p.spec.weapons.gunAmmo)) {
        p.rearm();
        p.health = p.maxHealth;
        this.message('REARMED AND REPAIRED', 'ring');
        this._atc()?.onRearm();
      }
    }

    // Failure checks
    if (p && (!p.alive || p.dying)) {
      if (this.free) {
        this.respawnTimer += dt;
        if (this.respawnTimer > 3.5) {
          this.respawnTimer = 0;
          this._spawnPlayer();
          this.prevPos.copy(b.player.position);
        }
        return;
      }
      this._fail(p.fm.crashed ? p.fm.crashReason || 'Crashed' : 'Shot down');
      return;
    }
    for (const fc of this.failChecks) if (fc.fn()) return this._fail(fc.reason);
    if (this.def.timeLimit && this.time > this.def.timeLimit) return this._fail('Out of time');
    if (p) {
      const d = Math.hypot(p.position.x - this.center.x, p.position.z - this.center.z);
      if (d > this.areaRadius) {
        this.outTimer += dt;
        if (this.outTimer > 20) return this._fail('Left the combat area');
      } else this.outTimer = 0;
      if (this.ceilingAlt !== null && p.position.y > this.ceilingAlt) {
        this.ceilingTimer += dt;
        if (this.ceilingTimer > 8) return this._fail('Detected by enemy radar');
      } else this.ceilingTimer = Math.max(0, this.ceilingTimer - dt);
    }

    // Success
    const req = this.objectives.filter((o) => o.required);
    if (req.length && !this.free) {
      const states = req.map((o) => this._objectiveState(o));
      if (states.some((s) => s.failed)) return this._fail('Too many checkpoints missed');
      if (states.every((s) => s.done)) this._succeed();
    }
  }

  _fail(reason) {
    if (this.status !== 'running') return;
    this.status = 'failed';
    this.failReason = reason;
    this.endTimer = 3.5;
    this.message('MISSION FAILED', 'fail');
    this._atc()?.onMissionEnd('failed', reason);
  }

  _succeed() {
    if (this.status !== 'running') return;
    this.status = 'success';
    this.endTimer = 3;
    this.message('MISSION ACCOMPLISHED', 'success');
    this._atc()?.onMissionEnd('success', '');
  }

  result() {
    const p = this.battle.player;
    const def = this.def;
    const success = this.status === 'success';
    const shots = p ? p.shots : 0, hits = p ? p.hits : 0;
    const accuracy = shots > 0 ? hits / shots : 0;
    const timeBonus = success && def.par ? Math.max(0, Math.round((def.par - this.time) * 4)) : 0;
    const healthBonus = success && p ? Math.round((p.health / p.maxHealth) * 300) : 0;
    const accBonus = success ? Math.round(accuracy * 400) : 0;
    const total = this.score + timeBonus + healthBonus + accBonus;
    let stars = 0;
    if (success) {
      stars = 1;
      if (def.stars && total >= def.stars[0]) stars = 2;
      if (def.stars && total >= def.stars[1]) stars = 3;
    }
    return {
      missionId: def.id, success, reason: this.failReason, time: this.time, score: total,
      breakdown: { base: this.score, timeBonus, healthBonus, accBonus }, accuracy,
      kills: { ...this.kills }, rings: this.rings ? { passed: this.rings.passed, total: this.rings.points.length } : null, stars,
    };
  }

  dispose() {
    this.rings?.dispose();
  }
}
