// Headless flight-model checks (runs in Node, no browser needed).
// Prints a performance table per aircraft and a landing-roll table (stopping
// distance and brake temperature with and without brakes, autobrake,
// reversers and drag chutes); fails on NaNs or absurd values.
import * as THREE from 'three';
import { FlightModel } from '../src/aircraft/FlightModel.js';
import { JETS, JET_ORDER } from '../src/aircraft/jets.js';
import { MAPS, MapRuntime } from '../src/world/maps.js';

const map = new MapRuntime(MAPS.pacific);
const env = {
  groundAt(x, z) {
    const h = map.heightAt(x, z);
    if (h < map.waterLevel) return { h: map.waterLevel, water: true, landable: false, runway: false };
    const runway = map.isOnRunway(x, z);
    return { h, water: false, landable: true, runway, mu: 0.62, condition: 'dry' };
  },
};

function makeFM(jet, alt, speed, heading = 0) {
  const fm = new FlightModel(jet.flight);
  fm.gearHeight = 1.8;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -THREE.MathUtils.degToRad(heading), 0, 'YXZ'));
  // fly over open water well away from terrain
  fm.reset(new THREE.Vector3(-40000, alt, -40000), q, speed);
  return fm;
}

function run(fm, ctrl, seconds, onStep) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    fm.update(dt, ctrl, env);
    if (onStep) onStep(fm, t);
    if (fm.crashed) break;
  }
}

const ctrl = (o = {}) => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0.7, airbrake: false, gear: false, brakes: false, ...o });
let bad = false;
const rows = [];
for (const id of JET_ORDER) {
  const jet = JETS[id];
  const r = { jet: id };
  // 1. level cruise, 60% throttle, hands off
  let fm = makeFM(jet, 3000, 220);
  run(fm, ctrl({ throttle: 0.6 }), 60);
  r.cruiseAltChange = Math.round(fm.position.y - 3000);
  r.cruiseKts = Math.round(fm.airspeed * 1.944);
  r.cruiseAlpha = +THREE.MathUtils.radToDeg(fm.alpha).toFixed(1);
  // 2. full afterburner for 90 s at 9000 m
  fm = makeFM(jet, 9000, 250);
  run(fm, ctrl({ throttle: 1 }), 90);
  r.abMach9km = +fm.mach.toFixed(2);
  fm = makeFM(jet, 300, 220);
  run(fm, ctrl({ throttle: 1 }), 90);
  r.abMachSL = +fm.mach.toFixed(2);
  // 3. max pull at 450 kts
  fm = makeFM(jet, 4000, 232);
  let maxG = 0, maxA = 0;
  run(fm, ctrl({ throttle: 1, pitch: 1 }), 12, (f) => {
    maxG = Math.max(maxG, f.gLoad);
    maxA = Math.max(maxA, THREE.MathUtils.radToDeg(f.alpha));
  });
  r.maxG = +maxG.toFixed(1);
  r.maxAlpha = +maxA.toFixed(1);
  r.speedAfterPull = Math.round(fm.airspeed * 1.944);
  // 4. roll rate
  fm = makeFM(jet, 4000, 230);
  run(fm, ctrl({ roll: 1 }), 1.0);
  r.roll1s = Math.round(fm.attitude().roll);
  // 5. idle glide: does it stall and recover?
  fm = makeFM(jet, 5000, 160);
  let minIas = 999, stalled = false;
  run(fm, ctrl({ throttle: 0, pitch: 0.4 }), 25, (f) => {
    minIas = Math.min(minIas, f.ias);
    stalled = stalled || f.stalled;
  });
  r.minKts = Math.round(minIas * 1.944);
  r.stalled = stalled;
  // 6. takeoff from the runway
  const ab = map.airbase;
  fm = new FlightModel(jet.flight);
  fm.gearHeight = 1.8;
  const p = map.fromAirbaseLocal(-ab.length / 2 + 100, 0);
  fm.reset(new THREE.Vector3(p.x, ab.elevation + 1.8, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -THREE.MathUtils.degToRad(ab.heading), 0, 'YXZ')), 0);
  fm.onGround = true;
  let liftoff = null;
  run(fm, ctrl({ throttle: 1, gear: true }), 40, (f, t) => {
    f.cmd = null;
    if (!f.onGround && liftoff === null) liftoff = { t: +t.toFixed(1), kts: Math.round(f.airspeed * 1.944) };
  });
  // apply back-pressure once rolling
  if (liftoff === null) {
    fm = new FlightModel(jet.flight);
    fm.gearHeight = 1.8;
    fm.reset(new THREE.Vector3(p.x, ab.elevation + 1.8, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -THREE.MathUtils.degToRad(ab.heading), 0, 'YXZ')), 0);
    fm.onGround = true;
    run(fm, ctrl({ throttle: 1, gear: true, pitch: 0.6 }), 75, (f, t) => {
      if (!f.onGround && liftoff === null) liftoff = { t: +t.toFixed(1), kts: Math.round(f.airspeed * 1.944), withPull: true };
    });
  }
  r.takeoff = liftoff ? `${liftoff.t}s @${liftoff.kts}kts${liftoff.withPull ? ' (pull)' : ''}` : 'no liftoff';
  r.takeoffCrash = fm.crashed ? fm.crashReason : '';
  if (!liftoff) { bad = true; console.error('No liftoff for', id); }
  for (const [k, v] of Object.entries(r)) if (typeof v === 'number' && !Number.isFinite(v)) { bad = true; console.error('NaN in', id, k); }
  rows.push(r);
}
console.table(rows);

// ---- landing rolls ---------------------------------------------------------
// Real touchdown 0.6 m above a dry runway at 1.25 x the flaps stall speed,
// idle thrust, then: (a) no brakes, (b) full manual brakes, (c) autobrake MED,
// (d) full brakes + reversers or drag chute.
const ab = map.airbase;
function landingRoll(jet, mode) {
  const fm = new FlightModel(jet.flight);
  fm.gearHeight = 1.8;
  const vTd = Math.min(85, Math.max(60, fm.vSpeeds().vs * 1.25));
  const p = map.fromAirbaseLocal(-ab.length / 2 + 100, 0);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(3), -THREE.MathUtils.degToRad(ab.heading), 0, 'YXZ'));
  fm.reset(new THREE.Vector3(p.x, ab.elevation + 1.8 + 0.6, p.z), q, vTd);
  fm.velocity.y = -1.0;
  fm.throttle = 0;
  if (mode === 'auto') fm.setAutobrake('MED');
  const c = ctrl({ throttle: 0, gear: true, brakes: mode === 'full' || mode === 'max' });
  const start = fm.position.clone();
  let peakT = 15, stopped = false, t = 0, maxDecel = 0;
  const dt = 1 / 60;
  for (; t < 150; t += dt) {
    if (mode === 'max' && fm.onGround) {
      if (fm.reverser.available && fm.reverser.state === 'stowed' && fm.groundSpeed > 20) c.reverse = true;
      if (fm.chute.available && fm.chute.state === 'stowed' && fm.groundSpeed > 20) c.chute = true;
    }
    fm.update(dt, c, env);
    peakT = Math.max(peakT, fm.brakeTemp);
    maxDecel = Math.max(maxDecel, fm.decel);
    if (fm.crashed) break;
    if (fm.onGround && fm.groundSpeed < 0.5 && t > 1) { stopped = true; break; }
  }
  const dist = Math.hypot(fm.position.x - start.x, fm.position.z - start.z);
  return { dist: Math.round(dist), temp: Math.round(peakT), stopped, crashed: fm.crashed ? fm.crashReason : '', vTd, decelG: maxDecel / 9.81, t };
}
const rollRows = [];
for (const id of JET_ORDER) {
  const jet = JETS[id];
  const r = { jet: id };
  const none = landingRoll(jet, 'none');
  const full = landingRoll(jet, 'full');
  const max = landingRoll(jet, 'max');
  const fmTmp = new FlightModel(jet.flight);
  r.tdKts = Math.round(full.vTd * 1.944);
  r.noBrakes = none.stopped ? none.dist : `>${none.dist}`;
  r.fullBrakes = full.stopped ? full.dist : `>${full.dist}`;
  r.fullTempC = full.temp;
  r.fullDecelG = +full.decelG.toFixed(2);
  if (fmTmp.autobrake.available) {
    const auto = landingRoll(jet, 'auto');
    r.autoMED = auto.stopped ? auto.dist : `>${auto.dist}`;
    r.autoTempC = auto.temp;
  } else {
    r.autoMED = '-';
    r.autoTempC = '-';
  }
  r.max = max.stopped ? max.dist : `>${max.dist}`;
  r.maxWith = fmTmp.reverser.available ? 'rev' : fmTmp.chute.available ? 'chute' : 'brakes';
  for (const res of [full, max]) {
    if (!Number.isFinite(res.dist) || !Number.isFinite(res.temp)) { bad = true; console.error('NaN in landing roll', id); }
    if (res.crashed) { bad = true; console.error('Crash on landing roll', id, res.crashed); }
  }
  if (!full.stopped || full.dist > 2900) { bad = true; console.error('Full braking does not stop in time:', id, full.dist); }
  rollRows.push(r);
}
console.table(rollRows);
if (bad) process.exit(1);
