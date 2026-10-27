// Pre-flight story played before every sortie (free flight and missions):
// the pilot walks out to the aircraft on its stand and climbs aboard (ladder
// and canopy on fighters, an airstair and the forward door on airliners, a
// belly hatch on the big bombers), the crew chief or first officer runs the
// start, ATC gives the clearance, start-up and taxi instructions, a marshaller
// waves the jet out, it taxis to the holding point, lines up and is cleared
// for take-off. Runway starts hand over on the runway; air starts fly the
// take-off as a cinematic and cut to the mission's start point.
// The script is a generator: each `yield` waits one frame.
import * as THREE from 'three';
import { Person, makeLadder, makeAirstair, makeCone, disposeGroup } from '../world/People.js';
import { sampleSection } from '../aircraft/geometry.js';
import { MAPS, TIME_PRESETS } from '../world/maps.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

const LOCAL_TIME = { dawn: '06:12', morning: '08:35', noon: '12:20', afternoon: '15:45', sunset: '18:52', dusk: '19:34', night: '23:10' };
const STAGES = ['Walk-out', 'Start-up', 'Taxi', 'Line-up', 'Take-off'];

const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);

// Polyline with rounded corners, sampled every metre: pose (x, z, heading) by distance
class TaxiPath {
  constructor(points, radius) {
    const xs = [], zs = [];
    const push = (x, z) => {
      const n = xs.length;
      if (n && Math.hypot(x - xs[n - 1], z - zs[n - 1]) < 0.01) return;
      xs.push(x);
      zs.push(z);
    };
    const seg = (ax, az, bx, bz) => {
      const d = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(d));
      for (let i = 0; i <= n; i++) push(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
    };
    let px = points[0][0], pz = points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [bx, bz] = points[i];
      if (i === points.length - 1) {
        seg(px, pz, bx, bz);
        break;
      }
      const [cx, cz] = points[i + 1];
      const d1x = bx - px, d1z = bz - pz, l1 = Math.hypot(d1x, d1z);
      const d2x = cx - bx, d2z = cz - bz, l2 = Math.hypot(d2x, d2z);
      const r = Math.min(radius, l1 * 0.5, l2 * 0.5);
      const sx = bx - (d1x / l1) * r, sz = bz - (d1z / l1) * r;
      const ex = bx + (d2x / l2) * r, ez = bz + (d2z / l2) * r;
      seg(px, pz, sx, sz);
      // quadratic Bezier through the corner
      const n = Math.max(4, Math.ceil(r * 1.6));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        push(u * u * sx + 2 * u * t * bx + t * t * ex, u * u * sz + 2 * u * t * bz + t * t * ez);
      }
      px = ex;
      pz = ez;
    }
    this.xs = xs;
    this.zs = zs;
    this.cum = [0];
    for (let i = 1; i < xs.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }

  _index(s) {
    const c = this.cum;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (c[m] <= s) lo = m;
      else hi = m;
    }
    return lo;
  }

  at(s, out = {}) {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    const i = Math.min(this._index(s), this.xs.length - 2);
    const f = (s - this.cum[i]) / Math.max(1e-6, this.cum[i + 1] - this.cum[i]);
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * f;
    out.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * f;
    const a = this._index(Math.max(0, s - 2)), b = Math.min(this.xs.length - 1, this._index(Math.min(this.length, s + 2)) + 1);
    out.dx = this.xs[b] - this.xs[a];
    out.dz = this.zs[b] - this.zs[a];
    const l = Math.hypot(out.dx, out.dz) || 1;
    out.dx /= l;
    out.dz /= l;
    return out;
  }

  // how sharply the path bends over the next stretch (radians)
  bendAhead(s, look = 30) {
    const a = this.at(s, {}), b = this.at(s + look, {});
    return Math.acos(THREE.MathUtils.clamp(a.dx * b.dx + a.dz * b.dz, -1, 1));
  }

  // distance along the path of the sample nearest a point
  nearest(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.xs.length; i++) {
      const d = (this.xs[i] - x) ** 2 + (this.zs[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return this.cum[best];
  }
}

export class Prologue {
  constructor(game, battle, mission) {
    this.game = game;
    this.battle = battle;
    this.mission = mission;
    this.world = battle.world;
    this.map = battle.map;
    this.ab = this.map.airbase;
    this.airbase = this.world.airbase;
    this.camera = game.camera;
    this.player = battle.player;
    this.spec = this.player.spec;
    this.model = this.player.model;
    this.quality = game.quality;
    this.time = 0;
    this.done = false;
    this.skipping = false;
    this.objects = [];
    this.people = [];
    this.start = { ...mission.start, pos: mission.start.pos.clone() };
    this.runwayStart = !!mission.start.runway;
    this.free = !!mission.free;
    const d = this.spec.design;
    this.airliner = !!this.model.airliner;
    this.canopyBoard = !this.airliner && !!this.model.canopy && !(d.canopy && d.canopy.noTub);
    this.len = this.model.length;
    this.R = Math.max(this.model.radius, 8);
    this.gh = this.model.gearHeight;
    this.thr = 0;
    this.engine = 0;
    this.speed = 0;
    this.pitch = 0;
    this.altitude = 0;
    this.gear = true;
    this.fade = 0;
    this.fadeTarget = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camSnap = true;
    this.shot = null;
    this.camFov = 45;
    this.focus = new THREE.Vector3();
    this.stage = 0;

    this._buildPath();
    this.pose = { x: 0, z: 0, dx: -1, dz: 0 };
    this.s = 0;
    this._setPose(this.path.at(0, this.pose), 0);
    // gear down, engines cold, canopy open, nobody on board
    const p = this.player;
    p.controls.gear = true;
    p.fm.gearDown = true;
    p.model.gearDeploy = 1;
    p.controls.throttle = 0;
    p.fm.throttle = 0;
    this.model.setCanopyOpen(this.canopyBoard ? 1 : 0);
    this.canopy = this.canopyBoard ? 1 : 0;
    if (this.model.pilot) this.model.pilot.visible = false;
    this._animateModel(0);
    this._buildCast();
    this._buildOverlay();
    this.it = this._script();
    this._onKey = (e) => {
      if (this.done) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        this.skip();
      }
    };
    window.addEventListener('keydown', this._onKey, true);
    this.update(0);
  }

  // ---------------------------------------------------------------- geometry
  W(x, y, z, out = new THREE.Vector3()) {
    out.set(x, y, z);
    this.airbase.group.updateMatrixWorld();
    return out.applyMatrix4(this.airbase.group.matrixWorld);
  }

  // airbase-local direction -> compass heading (degrees)
  _heading(dx, dz) {
    const a = this.W(0, 0, 0, _v), b = this.W(dx, 0, dz, _w);
    return THREE.MathUtils.radToDeg(Math.atan2(b.x - a.x, -(b.z - a.z)));
  }

  _buildPath() {
    const L = this.ab.length;
    const stand = this.airbase.standFor(this.spec, this.len);
    this.stand = stand;
    const holdZ = this.airbase.holdZ ?? L / 2 - 60;
    // start position on the runway (same as the mission's runway start)
    this.lineupZ = L / 2 - 120;
    const pts = [[stand.x, stand.z], [150, stand.z], [150, holdZ], [0, holdZ], [0, this.lineupZ]];
    const r = this.airliner || this.len > 30 ? 34 : 22;
    this.path = new TaxiPath(pts, r);
    // stop with the nose short of the holding-position markings (x = 62)
    const noseAhead = this.spec.design.cg + 2;
    this.holdS = this.path.nearest(66 + noseAhead, holdZ);
    // cut the long taxi: resume this far before the holding point
    this.cutFrom = this.path.nearest(150, stand.z + 45);
    this.cutTo = Math.max(this.cutFrom + 20, this.holdS - 115);
  }

  _setPose(pose, pitchDeg = 0, extraY = 0) {
    const p = this.player;
    const pos = this.W(pose.x, this.gh + extraY, pose.z, this._posTmp || (this._posTmp = new THREE.Vector3()));
    const hdg = this._heading(pose.dx, pose.dz);
    this.heading = hdg;
    _e.set(THREE.MathUtils.degToRad(pitchDeg), -THREE.MathUtils.degToRad(hdg), 0, 'YXZ');
    _q.setFromEuler(_e);
    p.fm.position.copy(pos);
    p.fm.quaternion.copy(_q);
    _w.set(0, 0, -1).applyQuaternion(_q);
    p.fm.velocity.copy(_w).multiplyScalar(this.speed);
    p.fm.airspeed = this.speed;
    p.syncVisual();
    p.root.updateMatrixWorld(true);
  }

  // a point in the aircraft's own frame (x right, y up, z towards the tail)
  A(x, y, z, out = new THREE.Vector3()) {
    out.set(x, y, z);
    return this.player.root.localToWorld(out);
  }

  _animateModel(dt) {
    const p = this.player;
    p.model.animate(dt, {
      pitch: 0, roll: 0, yaw: this.steer || 0, throttle: this.thr, ab: 0, gear: this.gear, mach: this.speed / 340, gLoad: 1, alpha: 0,
      speed: this.speed, altitude: p.position.y, lightGlow: this.world.nightFactor, spoilers: 0, airbrake: 0,
      reverser: 0, chute: 0, chuteState: 'stowed', bay: false,
    });
    this.model.setCanopyOpen(this.canopy);
  }

  // ---------------------------------------------------------------- cast
  _buildCast() {
    const shadows = this.quality.shadows;
    const scene = this.battle.scene;
    const d = this.spec.design;
    const cg = d.cg;
    const groundY = -this.gh + 0.02;
    const addObj = (o) => {
      scene.add(o);
      this.objects.push(o);
      return o;
    };
    const person = (kind, opts = {}) => {
      const p = new Person(kind, { shadows, ...opts });
      scene.add(p.root);
      this.people.push(p);
      return p;
    };
    const eyeZ = d.pilotEye.z;
    // boarding point (aircraft frame) and the route to it
    if (this.canopyBoard) {
      const sec = sampleSection(d.fuselage, eyeZ);
      const sillY = this.model.canopyInfo ? this.model.canopyInfo.c.y : (sec.y ?? 0) + sec.top * 0.8;
      const half = Math.max(sec.w, 0.4) + 0.06;
      this.boardTop = this.A(-half, sillY + 0.05, eyeZ - cg + 0.25);
      this.boardBase = this.A(-half - 1.05, groundY, eyeZ - cg + 0.25);
      this.seat = this.A(0, d.pilotEye.y - 0.9, eyeZ - cg + 0.2);
      this.ladder = addObj(makeLadder(this.boardTop, this.boardBase, shadows));
    } else if (this.airliner) {
      const doorZ = (d.doors && d.doors[0]) || eyeZ + 2.5;
      const sec = sampleSection(d.fuselage, doorZ);
      const floorY = (sec.y ?? 0) - sec.bot * 0.32;
      const doorH = floorY + this.gh;
      const stair = makeAirstair(doorH, shadows);
      const run = stair.userData.run;
      // the stair's -Z end meets the door on the left side of the fuselage
      const door = this.A(-sec.w - 0.05, groundY, doorZ - cg);
      const out = this.A(-sec.w - 10, groundY, doorZ - cg).sub(door).normalize();
      stair.position.copy(door).addScaledVector(out, run / 2 + 1.35);
      stair.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), out.clone().negate());
      addObj(stair);
      this.stair = stair;
      this.stairOut = out;
      this.boardBase = door.clone().addScaledVector(out, run + 1.3);
      this.boardBase.y = door.y + 1.1;
      this.boardTop = door.clone().addScaledVector(out, 0.9);
      this.boardTop.y = door.y + doorH;
      this.seat = this.A(-0.3, floorY + 0.2, doorZ - cg - 1.5);
      this.walkUp = door.clone().addScaledVector(out, run + 2.6);
    } else {
      // bombers and the SR-71: ladder up into the belly hatch behind the cockpit
      const hz = eyeZ + 1.2;
      const sec = sampleSection(d.fuselage, hz);
      const belly = (sec.y ?? 0) - sec.bot;
      this.boardTop = this.A(0, belly + 0.1, hz - cg);
      this.boardBase = this.A(-0.25, groundY, hz - cg + 0.9);
      this.seat = this.boardTop.clone().add(new THREE.Vector3(0, 0.5, 0));
      this.ladder = addObj(makeLadder(this.boardTop, this.boardBase, shadows));
    }
    // where the crew walk out from: the hangar or terminal behind the stand
    const st = this.stand;
    void st;
    const off = this.W(15, 0, 9).sub(this.W(0, 0, 0));
    const from = (this.walkUp || this.boardBase).clone().add(off);
    from.y = this.ab.elevation + 0.02;
    this.walkFrom = from;
    const kind = this.airliner ? 'captain' : 'fighter';
    this.pilot = person(kind, { bag: true });
    this.pilot.root.position.copy(from);
    if (this.airliner) {
      this.fo = person('officer', { bag: true });
      this.fo.root.position.copy(from).add(new THREE.Vector3(1.4, 0, 1.2));
    }
    // ground crew: a marshaller ahead of the nose and the crew chief at the wing
    const noseZ = -cg;
    this.marshal = person('marshal');
    this.marshal.root.position.copy(this.A(0, groundY, noseZ - 12 - this.len * 0.12));
    this._face(this.marshal, this.A(0, groundY, 0));
    this.chief = person('crewChief');
    this.chief.root.position.copy(this.A(-Math.min(this.model.span * 0.35, 9), groundY, noseZ + this.len * 0.3));
    this._face(this.chief, this.A(0, groundY, noseZ + this.len * 0.3));
    // cones at the wingtips and nose, chocks are implied
    this.cones = [];
    const tips = this.model.wingtips || [];
    const conePts = [this.A(0, groundY, noseZ - 2.5)];
    for (const t of tips) conePts.push(this.A(t.x * 1.04, groundY, t.z + 1));
    if (this.airliner) for (const pod of d.pods || []) for (const s of [1, -1]) conePts.push(this.A(pod.x * s, groundY, pod.z - cg - pod.len * 0.8));
    for (const p of conePts) {
      const c = addObj(makeCone(shadows));
      c.position.copy(p);
      this.cones.push(c);
    }
  }

  _face(person, target) {
    const p = person.root.position;
    person.root.rotation.set(0, Math.atan2(-(target.x - p.x), -(target.z - p.z)), 0);
  }

  // walk a person towards a point; true when there
  _walk(person, target, dt, speed = 1.45) {
    const p = person.root.position;
    _v.set(target.x - p.x, 0, target.z - p.z);
    const d = _v.length();
    if (d < 0.15) {
      person.animate(dt, 'idle', 0);
      return true;
    }
    const step = Math.min(d, speed * dt);
    p.addScaledVector(_v.normalize(), step);
    p.y = target.y ?? p.y;
    const want = Math.atan2(-_v.x, -_v.z);
    let dr = want - person.root.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    person.root.rotation.y += dr * Math.min(1, dt * 6);
    person.animate(dt, 'walk', speed);
    return false;
  }

  // ---------------------------------------------------------------- overlay
  _buildOverlay() {
    const el = document.createElement('div');
    el.id = 'story';
    const def = this.mission.def;
    const mapDef = MAPS[this.map.def.id] || this.map.def;
    const tk = def.time && def.time !== 'default' ? def.time : null;
    const local = tk ? LOCAL_TIME[tk] : mapDef.localTime || '10:40';
    const atc = this.game.atc;
    const fac = atc ? atc.fac : { full: mapDef.name };
    const cs = atc ? atc.cs.d : '';
    const info = atc ? atc.storyInfo() : null;
    const title = this.free ? 'Free Flight' : def.name;
    const field = this.airliner ? `${fac.full}${fac.full.includes('International') ? '' : ' Airport'}` : `${fac.full} Air Base`;
    el.innerHTML = `
      <div class="story-bar top"></div><div class="story-bar bottom"></div>
      <div class="story-fade"></div>
      <div class="story-card">
        <div class="sc-kicker">${esc(title)}</div>
        <div class="sc-title">${esc(field)}</div>
        <div class="sc-sub">${esc(local)} LOCAL · ${esc(mapDef.name)}${tk && TIME_PRESETS[tk] ? '' : ''}</div>
        <div class="sc-sub">${esc(cs)} · ${esc(this.spec.name)}${info ? ` · ${this.airliner ? 'STAND' : 'PARKING'} ${esc(info.stand)}` : ''}</div>
      </div>
      <div class="story-stages">${STAGES.map((s, i) => `<span data-i="${i}">${s}</span>`).join('<i>›</i>')}</div>
      <div class="story-sub"><b></b><span></span></div>
      <button class="story-skip" type="button">Skip ▸ <small>Enter</small></button>
      <div class="story-transit"><div></div><small></small></div>`;
    document.getElementById('app').appendChild(el);
    el.querySelector('.story-skip').addEventListener('click', (e) => {
      e.preventDefault();
      this.skip();
    });
    this.el = el;
    this.elFade = el.querySelector('.story-fade');
    this.elCard = el.querySelector('.story-card');
    this.elSub = el.querySelector('.story-sub');
    this.elSubWho = this.elSub.querySelector('b');
    this.elSubText = this.elSub.querySelector('span');
    this.elStages = [...el.querySelectorAll('.story-stages span')];
    this.elTransit = el.querySelector('.story-transit');
    requestAnimationFrame(() => el.classList.add('on'));
  }

  _setStage(i) {
    this.stage = i;
    this.elStages.forEach((s, k) => {
      s.classList.toggle('on', k === i);
      s.classList.toggle('done', k < i);
    });
  }

  _updateOverlay() {
    this.elFade.style.opacity = this.fade.toFixed(3);
    const log = this.game.radio.log;
    const last = log[log.length - 1];
    const cur = this.game.radio.current;
    const item = cur ? { station: cur.station, display: cur.display } : last && this.game.radio.time - last.time < 4 ? last : null;
    if (item) {
      this.elSub.classList.add('on');
      const nm = item.station.name || item.station.short || '';
      if (this.elSubWho.textContent !== nm) this.elSubWho.textContent = nm;
      if (this.elSubText.textContent !== item.display) this.elSubText.textContent = item.display;
      this.elSub.dataset.kind = item.station.kind || '';
    } else this.elSub.classList.remove('on');
  }

  // ---------------------------------------------------------------- camera
  _cut() {
    this.camSnap = true;
  }

  _camera(dt) {
    if (!this.shot) return;
    const want = this.shot(this.time);
    if (!want) return;
    const k = this.camSnap ? 1 : 1 - Math.exp(-dt * (want.lag ?? 2.2));
    this.camPos.lerp(want.pos, k);
    this.camLook.lerp(want.look, this.camSnap ? 1 : 1 - Math.exp(-dt * (want.lookLag ?? 3.5)));
    this.camSnap = false;
    // never under the ground
    const floor = this.map.heightAt(this.camPos.x, this.camPos.z) + 0.6;
    if (this.camPos.y < floor) this.camPos.y = floor;
    const cam = this.camera;
    cam.position.copy(this.camPos);
    cam.up.copy(UP);
    cam.lookAt(this.camLook);
    const fov = want.fov ?? this.camFov;
    if (Math.abs(cam.fov - fov) > 0.01 || cam.near !== 0.3) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 3 + (this.camSnap ? 1 : 0));
      cam.near = 0.3;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (this.done) return;
    this.time += dt;
    if (this.it) {
      const r = this.it.next(dt);
      if (r.done) {
        this.it = null;
        this._handover();
        return;
      }
    }
    // marshaller signals while the jet is starting and moving off
    if (this.marshal) this.marshal.animate(dt, this.marshalling ? 'marshal' : this.saluting ? 'salute' : 'idle');
    if (this.chief && !this.chiefBusy) this.chief.animate(dt, this.saluting ? 'salute' : 'idle');
    // engines spool towards the commanded throttle
    this.engine += ((this.engineOn ? 1 : 0) - this.engine) * Math.min(1, dt * 0.45);
    this._animateModel(dt);
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 3.2);
    this._camera(dt);
    this.focus.copy(this.player.position);
    this._updateOverlay();
    const audio = this.game.audio;
    audio.setListener(this.camera.position, _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion));
    audio.updateEngine({
      active: this.engine > 0.02, throttle: this.engine < 0.95 ? -0.55 + this.engine * 0.6 : this.thr, ab: 0, speed: this.speed,
      cockpit: false, gLoad: 1, airbrake: false, gunFiring: false, gunRate: 1, turbofan: !!this.spec.flight.noAB, supersonicExternal: false,
    });
  }

  // moves the aircraft along the taxi path towards `stopS`
  _taxi(dt, stopS, vmax) {
    const bend = this.path.bendAhead(this.s, 22);
    const vTurn = bend > 0.2 ? THREE.MathUtils.clamp(10 - bend * 5, this.airliner ? 5 : 6, vmax) : vmax;
    const remain = stopS - this.s;
    const vStop = Math.sqrt(Math.max(0, 2 * 0.9 * remain));
    const vt = Math.min(vTurn, vmax, vStop);
    const a = vt > this.speed ? 1.1 : 1.8;
    this.speed += THREE.MathUtils.clamp(vt - this.speed, -a * dt, a * dt);
    this.s = Math.min(stopS, this.s + this.speed * dt);
    this.path.at(this.s, this.pose);
    this.steer = THREE.MathUtils.clamp(bend * 2, -1, 1) * Math.sign(this.pose.dx * 0 + 1) * 0;
    this._setPose(this.pose);
    this.thr = 0.06 + (vt > this.speed + 0.3 ? 0.22 : 0.05);
    return remain < 0.3 && this.speed < 0.25;
  }

  // ---------------------------------------------------------------- the script
  *wait(sec) {
    let t = 0;
    while (t < sec) t += yield;
  }

  // run an ATC exchange and wait for the frequency to go quiet
  *radio(step, minSec = 1.5, maxSec = 40) {
    this.game.atc?.story(step);
    let t = 0;
    yield;
    while ((t < minSec || this.game.radio.busy) && t < maxSec) t += yield;
  }

  // start an exchange without waiting for it
  say(step) {
    this.game.atc?.story(step);
  }

  // wait until the frequency is quiet
  *quiet(maxSec = 20) {
    let t = yield;
    while (this.game.radio.busy && t < maxSec) t += yield;
  }

  *fadeOut(sec = 0.6) {
    this.fadeTarget = 1;
    yield* this.wait(sec);
  }

  *fadeIn(sec = 0.6) {
    this.fadeTarget = 0;
    yield* this.wait(sec);
  }

  *_script() {
    const cg = this.spec.design.cg;
    const R = this.R, len = this.len;
    const ac = () => this.player.position;
    this._setStage(0);
    this.fade = 1;
    this.fadeTarget = 0;
    // 1. establishing shot of the stand
    const est = this.A(-R * 1.6 - 18, R * 0.5 + 8, -len * 0.9 - 20);
    const est2 = this.A(-R * 1.1 - 10, R * 0.25 + 4, -len * 0.55 - 12);
    this.shot = (t) => {
      const f = smooth(0, 7, t);
      return { pos: est.clone().lerp(est2, f), look: ac().clone().add(_v.set(0, -this.gh * 0.3, 0)), lag: 4, fov: 42 };
    };
    this._cut();
    yield* this.wait(3.2);
    this.elCard.classList.add('out');

    // 2. the walk-out
    const pilot = this.pilot, fo = this.fo;
    const target = this.boardBase.clone();
    target.y = this.ab.elevation + 0.02;
    const approach = this.walkUp ? this.walkUp.clone() : target.clone();
    approach.y = this.ab.elevation + 0.02;
    const mid = this.walkFrom.clone().lerp(approach, 0.5);
    this.shot = () => {
      const p = pilot.root.position;
      const fwd = _w.set(0, 0, -1).applyQuaternion(pilot.root.quaternion);
      const side = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      // tracking shot ahead of the pilot, the aircraft behind the camera's shoulder
      const pos = p.clone().addScaledVector(fwd, 5.5).addScaledVector(side, 2.6).add(_v.set(0, 1.25, 0));
      return { pos, look: p.clone().add(_v.set(0, 1.35, 0)), lag: 3, fov: 40 };
    };
    this._cut();
    let walked = 0;
    while (true) {
      const dt = yield;
      walked += dt;
      const a = this._walk(pilot, approach, dt, 1.6);
      if (fo) this._walk(fo, approach.clone().add(_v.set(0, 0, 0)).addScaledVector(this.stairOut || UP, 1.6), dt, 1.4);
      if (walked > 4 && this.shot.name !== 'over') {
        const over = () => {
          const p = pilot.root.position;
          const fwd = _w.set(0, 0, -1).applyQuaternion(pilot.root.quaternion);
          const side = new THREE.Vector3().crossVectors(fwd, UP).normalize();
          const pos = p.clone().addScaledVector(fwd, -3.6).addScaledVector(side, 1.4).add(_v.set(0, 1.75, 0));
          return { pos, look: this.boardTop.clone().lerp(ac(), 0.4), lag: 2.5, fov: 48 };
        };
        Object.defineProperty(over, 'name', { value: 'over' });
        if (walked > 4 && pilot.root.position.distanceTo(mid) < 30) {
          this.shot = over;
          this._cut();
        }
      }
      if (a || walked > 40) break;
    }
    if (this.walkUp) {
      while (!this._walk(pilot, target, yield)) { /* step onto the stair */ }
    }
    pilot.animate(0, 'idle');

    // 3. boarding
    const climbFrom = pilot.root.position.clone();
    const climbTo = this.boardTop.clone();
    const climbT = Math.max(2.2, (climbTo.y - climbFrom.y) * (this.airliner ? 0.75 : 1.1));
    const side = this.airliner ? this.stairOut.clone() : climbFrom.clone().sub(this.A(0, climbFrom.y, 0)).setY(0).normalize();
    const boardCam = climbFrom.clone().addScaledVector(side, 7 + len * 0.05).add(_v.set(0, 1.4, 0));
    boardCam.addScaledVector(_w.set(0, 0, -1).applyQuaternion(this.player.quaternion), 6 + len * 0.05);
    this.shot = () => ({ pos: boardCam, look: pilot.root.position.clone().add(_v.set(0, 1.2, 0)), lag: 3, lookLag: 4, fov: 38 });
    this._cut();
    this._face(pilot, this.A(0, climbFrom.y, this.spec.design.pilotEye.z - cg));
    let t = 0;
    while (t < climbT) {
      const dt = yield;
      t += dt;
      const f = Math.min(1, t / climbT);
      pilot.root.position.lerpVectors(climbFrom, climbTo, f);
      pilot.animate(dt, this.airliner ? 'walk' : 'climb', 0.9);
      if (fo && t > 1.4) {
        const f2 = Math.min(1, (t - 1.4) / climbT);
        if (f2 > 0) {
          fo.root.position.lerpVectors(climbFrom, climbTo, f2);
          fo.animate(dt, 'walk', 0.9);
        } else this._walk(fo, target, dt);
      }
    }
    // into the seat / through the door
    t = 0;
    const inFrom = pilot.root.position.clone();
    while (t < 1.2) {
      const dt = yield;
      t += dt;
      pilot.root.position.lerpVectors(inFrom, this.seat, Math.min(1, t / 1.2));
      pilot.animate(dt, this.airliner ? 'walk' : 'climb', 0.8);
      if (fo) {
        fo.root.position.lerp(climbTo, Math.min(1, dt * 1.5));
        fo.animate(dt, 'walk', 0.9);
      }
    }
    pilot.root.visible = false;
    if (this.model.pilot) this.model.pilot.visible = true;
    if (fo) {
      t = 0;
      const f0 = fo.root.position.clone();
      while (t < 1.4) {
        const dt = yield;
        t += dt;
        fo.root.position.lerpVectors(f0, this.seat, Math.min(1, t / 1.4));
        fo.animate(dt, 'walk', 0.8);
      }
      fo.root.visible = false;
    }

    // 4. start-up: clearance and start approval, engines spool up
    this._setStage(1);
    const eye = this.spec.design.pilotEye;
    const flightDeck = this.airliner
      ? { pos: this.A(-6.5 - len * 0.03, eye.y + 1.2, eye.z - cg - 10 - len * 0.06), look: this.A(0, eye.y, eye.z - cg) }
      : { pos: this.A(-2.3, eye.y + 0.75, eye.z - cg - 2.4), look: this.A(0, eye.y - 0.2, eye.z - cg + 0.25) };
    this.shot = () => ({ pos: flightDeck.pos, look: flightDeck.look, lag: 1.5, fov: this.airliner ? 34 : 44 });
    this._cut();
    if (this.ladder) this.ladder.visible = false;
    yield* this.radio('clearance', 2);
    // start-up request; the engines light once ground approves
    this.say('start');
    yield* this.wait(5.5);
    const nz = this.model.exhausts && this.model.exhausts[0] ? this.model.exhausts[0] : new THREE.Vector3(0, 0, len * 0.5);
    const enginePos = this.airliner && this.spec.design.pods && this.spec.design.pods[0]
      ? (() => { const pd = this.spec.design.pods[0]; return { pos: this.A(-pd.x - pd.r * 5 - 4, pd.y + 0.8, pd.z - cg - pd.len * 2.2 - 6), look: this.A(-pd.x, pd.y, pd.z - cg) }; })()
      : { pos: this.A(-R * 0.8 - 4, 1.2, nz.z + 7 + len * 0.15), look: this.A(nz.x, nz.y, nz.z) };
    this.shot = () => ({ pos: enginePos.pos, look: enginePos.look, lag: 1.5, fov: 40 });
    this._cut();
    this.engineOn = true;
    this.chiefBusy = false;
    yield* this.quiet(12);
    this.say('engines');
    yield* this.wait(3);
    // canopy comes down on fighters while the crew talk the start through
    if (this.canopyBoard) {
      this.shot = () => ({ pos: flightDeck.pos, look: flightDeck.look, lag: 1.5, fov: 44 });
      this._cut();
      t = 0;
      while (t < 3.2) {
        const dt = yield;
        t += dt;
        this.canopy = 1 - smooth(0.3, 3.0, t);
      }
      this.canopy = 0;
    }
    yield* this.quiet(14);
    // stair truck backs away, cones picked up, the marshaller takes over
    for (const c of this.cones) c.visible = false;
    if (this.stair) {
      const s0 = this.stair.position.clone();
      t = 0;
      while (t < 2.5) {
        const dt = yield;
        t += dt;
        this.stair.position.copy(s0).addScaledVector(this.stairOut, smooth(0, 2.5, t) * 9);
      }
      this.stair.visible = false;
    }

    // 5. taxi clearance and the marshaller waves us out
    this._setStage(2);
    const mPos = this.marshal.root.position.clone();
    const mLook = ac().clone();
    const mCam = mPos.clone().add(mPos.clone().sub(mLook).setY(0).normalize().multiplyScalar(5)).add(_v.set(1.4, 1.6, 0));
    this.shot = () => ({ pos: mCam, look: this.A(0, 0, -cg + len * 0.1), lag: 2, fov: this.airliner ? 46 : 40 });
    this._cut();
    this.marshalling = true;
    // roll as soon as ground has given the route; the read-back follows on the move
    this.say('taxi');
    yield* this.wait(7);
    // the marshaller steps aside as the aircraft rolls
    const mAside = mPos.clone().add(this.W(0, 0, 18).sub(this.W(0, 0, 0)));
    // taxi out of the stand; chase shot from behind the wing
    const chase = (back = 1.15, height = 0.32, sideF = 0.55) => () => {
      const p = ac();
      const fwd = _w.set(0, 0, -1).applyQuaternion(this.player.quaternion);
      const sideV = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      return {
        pos: p.clone().addScaledVector(fwd, -(len * back + 8)).addScaledVector(sideV, R * sideF + 4).add(_v.set(0, len * height + 2.5, 0)),
        look: p.clone().addScaledVector(fwd, len * 0.8 + 10),
        lag: 1.6, fov: 50,
      };
    };
    let held = 0;
    while (this.s < this.cutFrom) {
      const dt = yield;
      held += dt;
      this._taxi(dt, this.cutFrom + 30, this.airliner ? 8.5 : 10);
      if (held > 0.5) this._walk(this.marshal, mAside, dt, 1.6);
      if (held > 4 && this.marshalling) {
        this.marshalling = false;
        this.saluting = !this.airliner;
        this.shot = chase();
        this._cut();
      }
      if (held > 40) break;
    }
    if (held < 4) {
      this.shot = chase();
      this._cut();
    }
    // 6. cut to the approach to the holding point
    this.game.atc?.story('checklist');
    yield* this.fadeOut(0.55);
    this.saluting = false;
    for (const p of this.people) p.root.visible = false;
    this.s = this.cutTo;
    this.speed = this.airliner ? 6 : 7;
    this.path.at(this.s, this.pose);
    this._setPose(this.pose);
    const holdCam = this.W(112, 3 + R * 0.1, this.airbase.holdZ - 40 - R);
    this.shot = () => ({ pos: holdCam, look: ac(), lag: 3, lookLag: 5, fov: 40 });
    this._cut();
    yield* this.fadeIn(0.6);
    while (!this._taxi(yield, this.holdS, this.airliner ? 8.5 : 10)) { /* rolling to the hold line */ }
    this.speed = 0;

    // 7. holding point: tower hand-off, line up and wait
    this._setStage(3);
    const tw = this.W(250, 34, 180);
    // long-lens view from the tower cab
    this.shot = () => ({ pos: tw, look: ac(), lag: 2, fov: Math.max(3, 4 + len * 0.12) });
    this._cut();
    yield* this.radio('hold', 2);
    const lineCam = () => {
      const p = ac();
      return { pos: this.W(-26 - R * 0.6, 2.2 + R * 0.08, this.lineupZ - 45 - len), look: p, lag: 2, fov: 42 };
    };
    this.shot = lineCam;
    this._cut();
    while (!this._taxi(yield, this.path.length, this.airliner ? 5 : 6)) { /* lining up */ }
    this.speed = 0;
    this.thr = 0.06;

    // 8. cleared for take-off
    this._setStage(4);
    const ahead = this.W(0, 1.6 + R * 0.05, this.lineupZ - 140 - len * 1.6);
    this.shot = () => ({ pos: ahead, look: ac().clone().add(_v.set(0, this.gh * 0.4, 0)), lag: 3, fov: 30 });
    this._cut();
    yield* this.radio('cleared', 2);
    if (this.runwayStart) {
      // the player takes it from here
      this.shot = () => {
        const p = ac();
        const fwd = _w.set(0, 0, -1).applyQuaternion(this.player.quaternion);
        return { pos: p.clone().addScaledVector(fwd, -(len * 1.2 + 10)).add(_v.set(0, len * 0.25 + 3, 0)), look: p.clone().addScaledVector(fwd, 30), lag: 1.4, fov: 60 };
      };
      yield* this.wait(1.2);
      return;
    }
    // 9. air start: the take-off as a cinematic, then on to the mission
    yield* this._takeoff();
  }

  *_takeoff() {
    const len = this.len, R = this.R;
    const fl = this.spec.flight;
    const tw = (fl.thrustAB * 1000) / (fl.mass * 9.81);
    const vr = this.airliner ? 78 : fl.mass > 60000 ? 85 : 72;
    // a compressed but believable roll: 9-26 s to rotation speed
    const accel = THREE.MathUtils.clamp(vr / (6 + 2.4 / Math.max(0.15, tw) * 3), 3, 9);
    this.thr = fl.noAB ? 1 : 0.95;
    this.game.atc?.story('rolling');
    const roll = this.W(-24 - R * 0.5, 2.2, this.lineupZ - 95 - len);
    this.shot = () => ({ pos: roll, look: this.player.position, lag: 3, lookLag: 6, fov: 34 });
    this._cut();
    const runwayDir = { dx: 0, dz: -1 };
    let z = this.lineupZ, y = 0, pitch = 0, vs = 0, t = 0;
    let gearT = -1;
    while (true) {
      const dt = yield;
      t += dt;
      this.speed += accel * dt * (this.speed < vr * 1.4 ? 1 : 0.3);
      z -= this.speed * dt;
      if (this.speed > vr) pitch = Math.min(pitch + dt * 3.2, this.airliner ? 12 : 14);
      if (pitch > 6) {
        vs += dt * (this.airliner ? 3.5 : 6);
        vs = Math.min(vs, this.airliner ? 14 : 30);
      }
      y += vs * dt;
      if (y > 12 && gearT < 0) gearT = t;
      if (gearT > 0 && t - gearT > 1.2) this.gear = false;
      this._setPose({ x: 0, z, ...runwayDir }, pitch, y);
      if (t > 3 && this.shot && this.shot.name !== 'chase2' && this.speed > vr * 0.7) {
        const chase2 = () => {
          const p = this.player.position;
          const fwd = _w.set(0, 0, -1).applyQuaternion(this.player.quaternion);
          return { pos: p.clone().addScaledVector(fwd, -(len * 1.6 + 16)).add(_v.set(R * 0.4, len * 0.2 + 3, 0)), look: p.clone().addScaledVector(fwd, 60), lag: 1.2, fov: 55 };
        };
        Object.defineProperty(chase2, 'name', { value: 'chase2' });
        this.shot = chase2;
        this._cut();
      }
      if (y > 120 || t > 60) break;
    }
    this.game.atc?.story('departure');
    // free flight: keep flying from the climb-out
    if (this.free) {
      this.climbOut = { y, pitch, z };
      return;
    }
    // missions: a short transit to the operations area
    yield* this.fadeOut(0.9);
    const tr = this.elTransit;
    tr.querySelector('div').textContent = this.mission.def.name ? this.mission.def.name.toUpperCase() : 'OPERATIONS AREA';
    tr.querySelector('small').textContent = 'Transit to the operations area…';
    tr.classList.add('on');
    yield* this.wait(2.2);
    tr.classList.remove('on');
    this.transit = true;
  }

  // ---------------------------------------------------------------- end
  skip() {
    if (this.done || this.skipping) return;
    this.skipping = true;
    this.fadeTarget = 1;
    this.it = (function* skipper(self) {
      let t = 0;
      while (t < 0.45) t += yield;
      self.skipped = true;
    })(this);
  }

  _handover() {
    const game = this.game, p = this.player;
    this.done = true;
    if (this.skipped || this.transit || !this.climbOut) {
      // back to the mission's own start
      const st = this.start;
      p.controls.throttle = st.throttle;
      p.fm.throttle = st.throttle;
      if (st.runway) {
        p.placeOnRunway(st.pos, st.heading);
      } else {
        p.controls.gear = false;
        p.fm.gearDown = false;
        p.model.gearDeploy = 0;
        p.place(st.pos, st.heading, st.speed);
      }
    } else {
      // free flight: carry on from the climb-out with full power
      const pos = p.position.clone();
      p.controls.gear = false;
      p.fm.gearDown = false;
      p.controls.throttle = 0.92;
      p.place(pos, this.heading, Math.max(this.speed, 95), this.climbOut.pitch * 0.7);
      p.fm.throttle = 0.92;
    }
    this.canopy = 0;
    this.model.setCanopyOpen(0);
    if (this.model.pilot) this.model.pilot.visible = true;
    game.finishIntro(this);
  }

  dispose() {
    this.done = true;
    window.removeEventListener('keydown', this._onKey, true);
    for (const p of this.people) p.dispose();
    for (const o of this.objects) disposeGroup(o);
    this.people.length = 0;
    this.objects.length = 0;
    if (this.el) {
      const el = this.el;
      el.classList.remove('on');
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 700);
      this.el = null;
    }
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
