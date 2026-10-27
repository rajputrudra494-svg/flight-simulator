// Semi-realistic 6-DOF flight model with a fly-by-wire rate controller.
//  - Lift from angle of attack with stall / post-stall behaviour
//  - Parasitic + induced + transonic wave drag, gear / airbrake drag
//  - Thrust with spool-up lag, afterburner, density lapse and ram effect
//  - G limiter and AoA limiter like a real FBW jet; weathervane stability
//  - Gear, ground roll, nose-wheel steering, rotation, de-rotation and touchdown
//  - Wheel brakes with anti-skid, heat and fade; autobrake (LO/MED/MAX/RTO),
//    ground spoilers, thrust reversers and drag chutes; runway surface friction
import * as THREE from 'three';

const G = 9.81;
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _a = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _lift = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _n = new THREE.Vector3();
const _hd = new THREE.Vector3();
const _hf = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const AUTOBRAKE_ORDER = ['OFF', 'LO', 'MED', 'MAX'];
const AUTOBRAKE_DECEL = { LO: 1.7, MED: 3.0, MAX: 4.5, RTO: 4.5 };

export function airDensity(h) {
  if (h < 11000) return 1.225 * Math.pow(Math.max(0.05, 1 - 2.25577e-5 * h), 4.2559);
  return 0.3639 * Math.exp(-(h - 11000) / 6341.6);
}

export function speedOfSound(h) {
  return Math.max(295, 340.3 - 0.0039 * Math.min(h, 11000));
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class FlightModel {
  constructor(flight) {
    this.f = flight;
    this.mass = flight.mass;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    // body rates: p roll (+right), q pitch (+up), r yaw (+right), rad/s
    this.p = 0;
    this.q = 0;
    this.r = 0;
    this.throttleCmd = 0.7;
    this.throttle = 0.7;
    this.gearDown = false;
    this.airbrake = 0;
    this.brakes = false;
    this.onGround = false;
    this.crashed = false;
    this.crashReason = '';
    this.gearHeight = 1.6;
    this.alpha = 0;
    this.beta = 0;
    this.gLoad = 1;
    this.mach = 0;
    this.airspeed = 0;
    this.ias = 0;
    this.stalled = false;
    this.stallWarn = false;
    this.lastTouchdown = null;
    // wing incidence: the B-52's wing is set at +6 deg, so it lifts off flat and cruises nose-down
    this.incidence = THREE.MathUtils.degToRad(flight.incidence || 0);
    this.alphaStall = THREE.MathUtils.degToRad(flight.maxAoA + 5);
    this.alphaMax = THREE.MathUtils.degToRad(flight.maxAoA);
    this.clMax = Math.min(flight.clAlpha * this.alphaStall * 0.82, flight.maxAoA > 30 ? 2.1 : 1.75);
    this.accum = 0;
    this.thrustN = 0;
    this.dragN = 0;
    this.cmd = { pitch: 0, roll: 0, yaw: 0 };
    // --- braking and deceleration devices
    const b = flight.brakes || {};
    this.bs = {
      mu: b.mu ?? 0.48, heatCap: b.heatCap ?? 5.0, autobrake: !!b.autobrake, spoilers: !!b.spoilers,
      reverser: b.reverser ?? 0, chute: b.chute ?? 0, aeroBrake: b.aeroBrake ?? 0,
    };
    this.brakePressure = 0;
    this.brakeTemp = 15;
    this.antiskid = false;
    this.decel = 0;
    this.groundSpeed = 0;
    this.autobrake = { available: this.bs.autobrake, mode: 'OFF', active: false, decelOk: false };
    this.reverser = { available: this.bs.reverser > 0, deploy: 0, state: 'stowed', power: 0 };
    this.spoilers = 0;
    this.spoilersArmed = false;
    this.chute = { available: this.bs.chute > 0, state: 'stowed', inflate: 0 };
    this.runway = { condition: 'dry', mu: 0.62 };
    this.events = [];
    this._manual = 0;
    this._auto = 0;
    this._abHold = false;
    this._landed = false;
    this._touchT = 0;
    this._rtoFired = false;
    this._spoilerRto = false;
    this._spoilerTarget = 0;
    this._noseDown = true;
  }

  reset(position, quaternion, speed) {
    this.position.copy(position);
    this.quaternion.copy(quaternion);
    _fwd.set(0, 0, -1).applyQuaternion(quaternion);
    this.velocity.copy(_fwd).multiplyScalar(speed);
    this.p = this.q = this.r = 0;
    this.crashed = false;
    this.onGround = false;
    this.groundSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.brakePressure = this._manual = this._auto = 0;
    this.antiskid = false;
    this.decel = 0;
    this.spoilers = 0;
    this._spoilerTarget = 0;
    this.autobrake.active = false;
    this.autobrake.decelOk = false;
    this.reverser.deploy = this.reverser.power = 0;
    this.reverser.state = 'stowed';
    this._landed = this._abHold = this._rtoFired = this._spoilerRto = false;
    this.events.length = 0;
  }

  // ---- deceleration device controls ------------------------------------
  cycleAutobrake() {
    const ab = this.autobrake;
    if (!ab.available) return 'OFF';
    let next;
    if (ab.mode === 'MAX') next = this.onGround && this.groundSpeed < 5 ? 'RTO' : 'OFF';
    else if (ab.mode === 'RTO') next = 'OFF';
    else next = AUTOBRAKE_ORDER[AUTOBRAKE_ORDER.indexOf(ab.mode) + 1] || 'OFF';
    this.setAutobrake(next);
    return ab.mode;
  }

  setAutobrake(mode) {
    const ab = this.autobrake;
    ab.mode = ab.available && AUTOBRAKE_DECEL[mode] ? mode : 'OFF';
    ab.active = false;
    ab.decelOk = false;
    this._rtoFired = false;
  }

  repackChute() {
    this.chute.state = 'stowed';
    this.chute.inflate = 0;
  }

  coolBrakes() {
    this.brakeTemp = 15;
  }

  // Characteristic speeds (IAS, m/s) for the current mass with flaps (gear down)
  vSpeeds() {
    const f = this.f;
    const cl = this.clMax + (f.flapCL || 0);
    const vs = Math.sqrt((2 * this.mass * G) / (1.225 * f.wingArea * cl));
    // the FBW only lets the nose up once dynamic pressure passes ~4 kPa (see _step)
    const vr = Math.max(vs * 1.12, Math.sqrt(8100 / 1.225) * 1.01);
    return { vs, vr, v1: vr - 2.6, vref: vs * 1.23 };
  }

  _event(ev) {
    this.events.push(ev);
    // nobody draining (physics test): keep it bounded
    if (this.events.length > 32) this.events.shift();
  }

  get forward() { return _fwd.set(0, 0, -1).applyQuaternion(this.quaternion); }

  thrustFor(throttle, rho, mach) {
    const f = this.f;
    const idle = 0.06 * f.thrustDry;
    let t;
    // turbofans without reheat use the whole throttle range for dry thrust
    if (f.noAB) t = idle + (f.thrustDry - idle) * throttle;
    else if (throttle <= 0.9) t = idle + (f.thrustDry - idle) * (throttle / 0.9);
    else t = f.thrustDry + (f.thrustAB - f.thrustDry) * ((throttle - 0.9) / 0.1);
    const lapse = Math.pow(rho / 1.225, 0.72);
    // reheated turbojets gain a little ram thrust; high-bypass turbofans lose
    // thrust as airspeed builds (why heavy jets accelerate so slowly). Turbo-
    // ramjets (the SR-71's J58 with its spike inlets) keep gaining past Mach 1.4.
    // Low-bypass reheated engines recover a lot of ram pressure: at Mach 2 and
    // altitude a fighter's engine makes about its sea-level static thrust again,
    // which is what lets it reach its real top speed up high.
    let ram;
    if (f.noAB) ram = 1 - 0.35 * Math.min(mach, 0.9);
    else if (f.ramK) {
      ram = 1 + 0.12 * Math.min(mach, 1.6) + f.ramK * Math.max(0, Math.min(mach, f.ramMach || f.maxMach) - 1.4);
    } else {
      const m = Math.min(mach, f.maxMach + 0.15);
      const ab = Math.max(0, (throttle - 0.9) / 0.1);
      ram = 1 + (0.12 + 0.2 * ab) * m + (0.08 + 0.13 * ab) * m * m;
    }
    return t * 1000 * lapse * ram;
  }

  get afterburner() {
    if (this.f.noAB) return 0;
    return Math.max(0, (this.throttle - 0.9) / 0.1);
  }

  // env: { groundAt(x,z) -> {h, water, runway, normal}, dt }
  update(dt, ctrl, env) {
    if (this.crashed) return;
    this.accum += Math.min(dt, 0.1);
    const h = 1 / 120;
    while (this.accum >= h) {
      this._step(h, ctrl, env);
      this.accum -= h;
      if (this.crashed) break;
    }
  }

  _step(dt, ctrl, env) {
    const f = this.f;
    const m = this.mass;
    const pos = this.position, vel = this.velocity, quat = this.quaternion;

    // Engine spool
    const tgt = ctrl.throttle;
    const spool = tgt > this.throttle ? (this.throttle > 0.88 ? 2.2 : 0.55) : 0.9;
    this.throttle += Math.sign(tgt - this.throttle) * Math.min(Math.abs(tgt - this.throttle), spool * dt);
    this.throttleCmd = tgt;
    this.airbrake += ((ctrl.airbrake ? 1 : 0) - this.airbrake) * Math.min(1, dt * 2.5);
    this.gearDown = ctrl.gear;
    this.brakes = ctrl.brakes;

    _fwd.set(0, 0, -1).applyQuaternion(quat);
    _up.set(0, 1, 0).applyQuaternion(quat);
    _right.set(1, 0, 0).applyQuaternion(quat);

    const V = vel.length();
    const vh = Math.hypot(vel.x, vel.z);
    if (vh > 0.01) _hd.set(vel.x / vh, 0, vel.z / vh);
    else _hd.set(0, 0, 0);
    this._devices(dt, ctrl, vh, V);
    const alt = pos.y;
    const rho = airDensity(alt);
    const a = speedOfSound(alt);
    const mach = V / a;
    const qbar = 0.5 * rho * V * V;
    this.airspeed = V;
    this.ias = V * Math.sqrt(rho / 1.225);
    this.mach = mach;

    // Body-frame velocity -> alpha / beta
    _qi.copy(quat).invert();
    _v.copy(vel).applyQuaternion(_qi);
    const u = -_v.z;
    const alpha = V > 1 ? Math.atan2(-_v.y, Math.max(u, 0.1)) : 0;
    const beta = V > 1 ? Math.atan2(_v.x, Math.max(Math.abs(u), 0.1)) : 0;
    this.alpha = alpha;
    this.beta = beta;

    // Lift coefficient with stall (wing angle = body angle + incidence)
    const aw = alpha + this.incidence;
    const aAbs = Math.abs(aw);
    const clLin = Math.max(-this.clMax, Math.min(this.clMax, f.clAlpha * aw));
    const clPlate = 1.15 * Math.sin(2 * aw);
    const wStall = smoothstep(this.alphaStall, this.alphaStall + 0.15, aAbs);
    let CL = clLin * (1 - wStall) + clPlate * wStall;
    // airliners extend high-lift flaps together with the gear
    if (this.gearDown && f.flapCL) CL += f.flapCL * (1 - wStall);
    // ground spoilers dump most of the lift so the weight goes onto the wheels
    if (this.spoilers > 0) CL *= 1 - 0.75 * this.spoilers;
    this.stalled = !this.onGround && aAbs > this.alphaStall;
    this.stallWarn = !this.onGround && (aAbs > this.alphaMax * 0.95 || (this.ias < 70 && V > 5));

    // Drag
    // transonic drag rise; subsonic airliners (waveDrag > 1) hit a much steeper wall
    const wk = f.waveDrag ?? 1;
    const wave = 1 + 1.5 * wk * smoothstep(0.82, 1.05, mach) - 0.45 * smoothstep(1.2, 2.0, mach);
    const over = Math.max(0, mach - f.maxMach);
    let CD = f.cd0 * wave + f.k * CL * CL + 1.1 * Math.sin(aAbs) * Math.sin(aAbs) * wStall + over * over * 2.5 * wk;
    if (this.gearDown) CD += f.flapCL ? 0.035 : 0.022;
    CD += 0.07 * this.airbrake + 0.08 * this.spoilers;
    if (this.bs.aeroBrake && this.onGround) CD += f.cd0 * this.bs.aeroBrake * this.brakePressure;
    // structural airspeed limit (SR-71: about 450 KEAS): drag climbs steeply past it
    // supersonic fighters without their own figure are held near 800 knots
    // indicated (about Mach 1.2 on the deck), like the real jets
    const maxIas = f.maxIas || (!f.noAB && f.maxMach > 1.1 ? 412 : 0);
    if (maxIas && this.ias > maxIas) CD += ((this.ias - maxIas) / maxIas) ** 2 * 6;
    const S = f.wingArea;

    _f.set(0, -G * m, 0);
    let liftMag = 0;
    if (V > 0.5) {
      _velDir.copy(vel).divideScalar(V);
      _lift.crossVectors(_right, _velDir);
      const ll = _lift.length();
      if (ll > 1e-4) _lift.divideScalar(ll);
      liftMag = qbar * S * CL;
      _f.addScaledVector(_lift, liftMag);
      const drag = qbar * S * CD;
      this.dragN = drag;
      _f.addScaledVector(_velDir, -drag);
      // side force from sideslip
      _f.addScaledVector(_right, -qbar * S * 0.9 * beta);
    }
    // reverser doors block the forward fan stream
    const rv = this.reverser;
    const thrust = this.thrustFor(this.throttle, rho, mach) * (1 - rv.deploy);
    this.thrustN = thrust;
    _f.addScaledVector(_fwd, thrust);
    // reverse thrust (fades out at walking pace so the jet never backs up) and the drag chute
    let revF = 0, chuteF = 0;
    if (rv.deploy > 0 && vh > 0.05) {
      revF = this.bs.reverser * f.thrustDry * 1000 * Math.pow(rho / 1.225, 0.72) * rv.power * rv.deploy * smoothstep(1.5, 14, vh);
      _hf.set(_fwd.x, 0, _fwd.z).normalize();
      _f.addScaledVector(_hf, -revF);
    }
    const ch = this.chute;
    if ((ch.state === 'deploying' || ch.state === 'deployed') && vh > 0.05) {
      chuteF = 0.5 * rho * V * V * 0.85 * this.bs.chute * ch.inflate;
      _f.addScaledVector(_hd, -chuteF);
    }

    // G load felt by the pilot (non-gravitational acceleration along body up)
    _a.copy(_f).divideScalar(m);
    const gLoad = (_a.x * _up.x + (_a.y + G) * _up.y + _a.z * _up.z) / G;

    // --- Fly-by-wire rate controller ------------------------------------
    const eff = Math.max(0.05, Math.min(1, qbar / 9000));
    const tvc = f.tvc ? Math.min(1, 0.35 + this.throttle * 0.4) : 0;
    const pitchEff = Math.max(eff, tvc * 0.55);
    const vSafe = Math.max(V, 40);
    const gRate = (f.maxG * G) / vSafe;
    const negRate = (3.0 * G) / vSafe;
    const maxQ = THREE.MathUtils.degToRad(f.pitchRate) * pitchEff;
    let qCmd = ctrl.pitch >= 0 ? ctrl.pitch * Math.min(maxQ, gRate) : ctrl.pitch * Math.min(maxQ, negRate);
    // AoA limiter: limit pitch rate so alpha stays below the limit
    const gammaDot = V > 5 ? (liftMag / m - G * _lift.y) / V : 0;
    if (!this.onGround) {
      const limitHi = gammaDot + 4 * (this.alphaMax - aw);
      const limitLo = gammaDot + 4 * (-this.alphaMax * 0.45 - aw);
      if (qCmd > limitHi) qCmd = Math.max(limitHi, ctrl.pitch > 0 ? 0 : limitHi);
      if (qCmd < limitLo) qCmd = Math.min(limitLo, 0);
      // nose slices towards the flight path when slow / stalled
      const slow = 1 - eff;
      // (body angle weathercocks; the wing's own angle drives the stall break)
      qCmd -= alpha * 0.6 * slow + aw * 3 * wStall;
    }

    const rollEff = Math.max(0.08, Math.min(1, qbar / 7000)) * (1 - 0.55 * smoothstep(0.25, this.alphaMax, aAbs));
    let pCmd = ctrl.roll * THREE.MathUtils.degToRad(f.rollRate) * rollEff;
    let rCmd = ctrl.yaw * THREE.MathUtils.degToRad(f.yawRate) * Math.max(eff, tvc * 0.5);
    if (!this.onGround) {
      // directional stability and coordinated rolling about the velocity vector
      rCmd += beta * 4.0 * eff + beta * 0.8 * (1 - eff);
      rCmd += this.p * Math.sin(alpha);
    }

    const tauQ = 0.14, tauP = 0.09, tauR = 0.25;
    this.q += (qCmd - this.q) * Math.min(1, dt / tauQ);
    this.p += (pCmd - this.p) * Math.min(1, dt / tauP);
    this.r += (rCmd - this.r) * Math.min(1, dt / tauR);

    // --- Ground interaction ---------------------------------------------
    const ground = env.groundAt(pos.x, pos.z, pos.y);
    const wheelBottom = pos.y - this.gearHeight * Math.max(0.3, _up.y);
    const bodyBottom = pos.y - 1.0;
    // manual toe brakes ramp the pressure up and release it faster
    const man = ctrl.brakes ? 1 : 0;
    this._manual += man > this._manual ? Math.min(3.5 * dt, man - this._manual) : -Math.min(6 * dt, this._manual - man);
    let hold = false;
    this.antiskid = false;
    if (this.onGround) {
      // rolling on the ground
      const N = Math.max(0, m * G - liftMag * _lift.y);
      const surfMu = ground.mu ?? 0.62;
      this.runway.condition = ground.condition || 'dry';
      this.runway.mu = surfMu;
      const muMax = this.bs.mu * (surfMu / 0.62);
      // main gear carries ~90% of the weight; the brakes can out-torque the tyres
      const tyreLimit = muMax * 0.9 * N;
      const capacity = 1.15 * tyreLimit;
      const rollF = (this.runway.condition === 'grass' ? 0.07 : 0.02) * N;
      const aeroRet = V > 0.5 ? this.dragN * (vh / V) : 0;
      this._touchT += dt;
      const auto = this._autobrake(dt, ctrl, vh, capacity, aeroRet + revF + chuteF + rollF);
      this._auto += (auto - this._auto) * Math.min(1, dt / 0.25);
      this.brakePressure = Math.max(this._manual, this._auto);
      let demand = this.brakePressure * capacity;
      if (demand > tyreLimit) {
        // anti-skid modulates the pressure just below the skid point
        demand = 0.93 * tyreLimit;
        this.antiskid = vh > 2;
      }
      const brakeF = vh > 0.05 ? demand * (1 - 0.45 * smoothstep(650, 950, this.brakeTemp)) : 0;
      // friction can stop the jet but never push it backwards within a step
      const fric = Math.min(brakeF + rollF, (m * vh) / dt);
      if (vh > 0.05) _f.addScaledVector(_hd, -fric);
      this.brakeTemp += (Math.min(brakeF, fric) * vh * dt) / (m * this.bs.heatCap);
      // hold the jet still when stopped: brakes set, or thrust below rolling friction
      hold = vh < 0.25 && ((this.brakePressure > 0.3 && thrust < capacity * this.brakePressure) || thrust < rollF);
      // tyres kill sideways motion, up to what the surface allows (snow and ice slide)
      _n.copy(_right);
      _n.y = 0;
      _n.normalize();
      const side = vel.dot(_n);
      let lat = -side * m * 6 * THREE.MathUtils.clamp(surfMu / 0.62, 0.3, 1);
      const latMax = surfMu * 1.2 * N + 0.3 * m;
      if (Math.abs(lat) > latMax) lat = Math.sign(lat) * latMax;
      _f.addScaledVector(_n, lat);
      // nose wheel steering
      const steer = ctrl.yaw * Math.min(1, 8 / Math.max(vh, 1)) * 0.6 * Math.min(1, vh / 3);
      this.r = steer;
      this.p = 0;
      // the nose can only rotate up once there is enough lift
      const canRotate = eff > 0.45;
      if (!canRotate && this.q > 0) this.q = 0;
      // de-rotation: with the stick released the nose settles onto the nose wheel,
      // faster as the speed bleeds off and once the spoilers kill the lift
      if (ctrl.pitch <= 0.05 && _fwd.y > 0.003) {
        const rate = THREE.MathUtils.degToRad(1.5 + 2.5 * (1 - smoothstep(20, 70, vh)) + this.spoilers);
        this.q = Math.min(this.q, -rate);
      }
    } else {
      this.brakePressure = this._manual;
      this.autobrake.active = false;
      this.autobrake.decelOk = false;
    }

    // Integrate translation
    vel.addScaledVector(_f, dt / m);
    if (hold) {
      vel.x = 0;
      vel.z = 0;
    }
    pos.addScaledVector(vel, dt);

    // Integrate rotation (body rates)
    _axis.set(this.q, -this.r, -this.p);
    const ang = _axis.length() * dt;
    if (ang > 1e-9) {
      _axis.normalize();
      _dq.setFromAxisAngle(_axis, ang);
      quat.multiply(_dq).normalize();
    }

    this.gLoad = this.onGround ? 1 : gLoad;

    // Contact resolution
    const gh = ground.h;
    if (this.onGround) {
      pos.y = gh + this.gearHeight;
      if (vel.y < 0) vel.y = 0;
      // keep wings level and limit pitch on the ground
      _fwd.set(0, 0, -1).applyQuaternion(quat);
      const pitch = Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1));
      const heading = Math.atan2(_fwd.x, -_fwd.z);
      const clampedPitch = Math.max(0, Math.min(pitch, THREE.MathUtils.degToRad(16)));
      _e.set(clampedPitch, -heading, 0, 'YXZ');
      quat.setFromEuler(_e);
      if (this._landed && !this._noseDown && clampedPitch < 0.006) {
        this._noseDown = true;
        this._event({ type: 'nosewheel' });
      }
      // lift-off
      if (liftMag * _lift.y > m * G * 1.02 && vel.y >= 0) {
        this.onGround = false;
        pos.y += 0.05;
        this._landed = false;
        this._abHold = false;
        this._spoilerRto = false;
        if (this.autobrake.mode === 'RTO') this.setAutobrake('OFF');
        this.autobrake.active = false;
      }
      if (!ground.landable) this._crash('Left the runway');
    } else {
      if (ground.water && pos.y - 0.5 < gh) {
        this._crash('Ditched in the sea');
        return;
      }
      if (wheelBottom <= gh) {
        // touchdown?
        _fwd.set(0, 0, -1).applyQuaternion(quat);
        const pitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)));
        const rollDeg = THREE.MathUtils.radToDeg(Math.atan2(_right.y, _up.y));
        const vs = vel.y;
        const ok = this.gearDown && ground.landable && vs > -5.5 && Math.abs(rollDeg) < 12 && pitchDeg > -4 && pitchDeg < 18 && V < 135;
        if (ok) {
          this.onGround = true;
          this.lastTouchdown = { vs, pitch: pitchDeg, roll: rollDeg, speed: V, runway: ground.runway, time: performance.now() };
          pos.y = gh + this.gearHeight;
          vel.y = 0;
          this.q = 0;
          this._landed = true;
          this._touchT = 0;
          this._noseDown = pitchDeg < 0.6;
          this._event({ type: 'touchdown', vs, speed: V, firm: vs < -3.0 });
        } else if (bodyBottom <= gh || !this.gearDown || !ground.landable || vs < -5.5) {
          this._crash(ground.building ? 'Crashed into a building' : this.gearDown ? (vs < -5.5 ? 'Hard landing' : 'Crashed on landing') : 'Crashed into terrain');
        }
      } else if (bodyBottom <= gh) {
        this._crash(ground.building ? 'Crashed into a building' : 'Crashed into terrain');
      }
    }

    // brake cooling (slower with the gear tucked away) and measured deceleration
    const tau = this.onGround ? 140 : this.gearDown ? 70 : 260;
    this.brakeTemp -= (this.brakeTemp - 15) * (dt / tau);
    const vhNew = Math.hypot(vel.x, vel.z);
    const raw = this.onGround ? (vh - vhNew) / dt : 0;
    this.decel += (raw - this.decel) * Math.min(1, dt / 0.3);
    this.groundSpeed = vhNew;
  }

  // Reversers, drag chute and ground spoilers: door/canopy/panel state machines
  _devices(dt, ctrl, vh, V) {
    const thr = this.throttleCmd;
    const rv = this.reverser;
    if (rv.available) {
      // weight-on-wheels interlock; auto-stow when slow, airborne or throttle forward
      if (ctrl.reverse && (!this.onGround || thr > 0.3 || vh < 2)) ctrl.reverse = false;
      const want = !!ctrl.reverse && this.onGround && thr <= 0.1;
      const target = want ? 1 : rv.power > 0.12 ? rv.deploy : 0;
      rv.deploy += THREE.MathUtils.clamp(target - rv.deploy, -dt / 1.4, dt / 1.4);
      if (want && rv.deploy >= 1) rv.power = Math.min(1, rv.power + dt / 2.5);
      else rv.power = Math.max(0, rv.power - dt / 1.2);
      const st = rv.deploy <= 0.001 ? 'stowed' : rv.deploy >= 0.999 ? 'deployed' : 'transit';
      if (st !== rv.state && st !== 'transit') this._event({ type: 'reverser', state: st });
      rv.state = st;
    }
    const ch = this.chute;
    if (ch.available) {
      if (ch.state === 'stowed') {
        if (ctrl.chute) {
          if (this.onGround && vh > 15) {
            ch.state = 'deploying';
            ch.inflate = 0;
            this._event({ type: 'chute', state: 'deploying' });
          } else ctrl.chute = false;
        }
      } else if (ch.state === 'deploying' || ch.state === 'deployed') {
        if (V > 95) {
          // deployed too fast: the canopy tears off
          ch.state = 'failed';
          ch.inflate = 0;
          ctrl.chute = false;
          this._event({ type: 'chute', state: 'failed' });
        } else if (!ctrl.chute || vh < 9 || thr > 0.6 || !this.onGround) {
          ch.state = 'jettisoned';
          ctrl.chute = false;
          this._event({ type: 'chute', state: 'jettisoned' });
        } else {
          ch.inflate = Math.min(1, ch.inflate + dt / 0.9);
          if (ch.inflate >= 1) ch.state = 'deployed';
        }
      }
    }
    if (this.bs.spoilers) {
      this.spoilersArmed = this.gearDown;
      let tgt = 0;
      if (this.onGround && vh >= 5 && thr <= 0.3) {
        if (this._spoilerRto || (this.spoilersArmed && this._landed && this._touchT > 0.15 && thr <= 0.1)) tgt = 1;
        else if (this._spoilerTarget > 0) tgt = 1;
      }
      if (tgt > 0 && this._spoilerTarget === 0) this._event({ type: 'spoilers' });
      this._spoilerTarget = tgt;
      this.spoilers += THREE.MathUtils.clamp(tgt - this.spoilers, -dt / 0.8, dt / 0.8);
    }
  }

  // Autobrake: returns the brake pressure it wants this step (0..1)
  _autobrake(dt, ctrl, vh, capacity, otherRet) {
    const ab = this.autobrake;
    const thr = this.throttleCmd;
    ab.decelOk = false;
    if (this._abHold) {
      // holds the jet after an autobrake stop until the pilot moves the throttle
      if (thr > 0.05 || ctrl.brakes) this._abHold = false;
      else return 0.4;
    }
    if (!ab.available || ab.mode === 'OFF') return 0;
    if (ab.mode === 'RTO') {
      if (!ab.active && !this._rtoFired && !this._landed && vh > 43.7 && thr <= 0.05) {
        this._rtoFired = true;
        ab.active = true;
        this._spoilerRto = true;
        this._event({ type: 'rto' });
        this._event({ type: 'autobrake', mode: 'RTO', reason: 'rto' });
      }
    } else if (!ab.active && this._landed && this._touchT >= 0.4 && thr <= 0.05 && vh > 1.5) {
      ab.active = true;
    }
    // disarm: pedals, throttle forward, or stopped
    if ((ab.active || this._landed) && ctrl.brakes) return this._abDisarm('disarm-pedal');
    if ((ab.active || this._landed) && thr > 0.3) return this._abDisarm('disarm-throttle');
    if (!ab.active) return 0;
    if (vh < 1.5) {
      this._abDisarm('stopped');
      this._abHold = true;
      return 0.4;
    }
    const target = AUTOBRAKE_DECEL[ab.mode];
    ab.decelOk = this.decel >= 0.8 * (ab.mode === 'MAX' || ab.mode === 'RTO' ? 3.5 : target);
    if (ab.mode === 'MAX' || ab.mode === 'RTO') return 1;
    // analytic pressure for the target deceleration, given drag, reversers and rolling friction
    const need = this.mass * target - otherRet;
    return THREE.MathUtils.clamp(need / Math.max(capacity, 1), 0, 1);
  }

  _abDisarm(reason) {
    const ab = this.autobrake;
    const mode = ab.mode;
    ab.mode = 'OFF';
    ab.active = false;
    ab.decelOk = false;
    this._event({ type: 'autobrake', mode, reason });
    return 0;
  }

  _crash(reason) {
    this.crashed = true;
    this.crashReason = reason;
  }

  // Convenience attitude values (degrees)
  attitude(out = {}) {
    _fwd.set(0, 0, -1).applyQuaternion(this.quaternion);
    _up.set(0, 1, 0).applyQuaternion(this.quaternion);
    _right.set(1, 0, 0).applyQuaternion(this.quaternion);
    out.pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)));
    out.roll = THREE.MathUtils.radToDeg(Math.atan2(_right.y, _up.y));
    out.heading = (THREE.MathUtils.radToDeg(Math.atan2(_fwd.x, -_fwd.z)) + 360) % 360;
    return out;
  }
}
