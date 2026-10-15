// Semi-realistic 6-DOF flight model with a fly-by-wire rate controller.
//  - Lift from angle of attack with stall / post-stall behaviour
//  - Parasitic + induced + transonic wave drag, gear / airbrake drag
//  - Thrust with spool-up lag, afterburner, density lapse and ram effect
//  - G limiter and AoA limiter like a real FBW jet; weathervane stability
//  - Gear, ground roll, braking, nose-wheel steering, rotation and touchdown
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
    this.alphaStall = THREE.MathUtils.degToRad(flight.maxAoA + 5);
    this.alphaMax = THREE.MathUtils.degToRad(flight.maxAoA);
    this.clMax = Math.min(flight.clAlpha * this.alphaStall * 0.82, flight.maxAoA > 30 ? 2.1 : 1.75);
    this.accum = 0;
    this.thrustN = 0;
    this.dragN = 0;
    this.cmd = { pitch: 0, roll: 0, yaw: 0 };
  }

  reset(position, quaternion, speed) {
    this.position.copy(position);
    this.quaternion.copy(quaternion);
    _fwd.set(0, 0, -1).applyQuaternion(quaternion);
    this.velocity.copy(_fwd).multiplyScalar(speed);
    this.p = this.q = this.r = 0;
    this.crashed = false;
    this.onGround = false;
  }

  get forward() { return _fwd.set(0, 0, -1).applyQuaternion(this.quaternion); }

  thrustFor(throttle, rho, mach) {
    const f = this.f;
    const idle = 0.06 * f.thrustDry;
    let t;
    if (throttle <= 0.9) t = idle + (f.thrustDry - idle) * (throttle / 0.9);
    else t = f.thrustDry + (f.thrustAB - f.thrustDry) * ((throttle - 0.9) / 0.1);
    const lapse = Math.pow(rho / 1.225, 0.72);
    const ram = 1 + 0.12 * Math.min(mach, 1.6);
    return t * 1000 * lapse * ram;
  }

  get afterburner() {
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

    // Lift coefficient with stall
    const aAbs = Math.abs(alpha);
    const clLin = Math.max(-this.clMax, Math.min(this.clMax, f.clAlpha * alpha));
    const clPlate = 1.15 * Math.sin(2 * alpha);
    const wStall = smoothstep(this.alphaStall, this.alphaStall + 0.15, aAbs);
    let CL = clLin * (1 - wStall) + clPlate * wStall;
    if (this.gearDown) CL *= 1.0;
    this.stalled = !this.onGround && aAbs > this.alphaStall;
    this.stallWarn = !this.onGround && (aAbs > this.alphaMax * 0.95 || (this.ias < 70 && V > 5));

    // Drag
    const wave = 1 + 1.5 * smoothstep(0.82, 1.05, mach) - 0.45 * smoothstep(1.2, 2.0, mach);
    const over = Math.max(0, mach - f.maxMach);
    let CD = f.cd0 * wave + f.k * CL * CL + 1.1 * Math.sin(aAbs) * Math.sin(aAbs) * wStall + over * over * 2.5;
    if (this.gearDown) CD += 0.022;
    CD += 0.07 * this.airbrake;
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
    const thrust = this.thrustFor(this.throttle, rho, mach);
    this.thrustN = thrust;
    _f.addScaledVector(_fwd, thrust);

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
      const limitHi = gammaDot + 4 * (this.alphaMax - alpha);
      const limitLo = gammaDot + 4 * (-this.alphaMax * 0.45 - alpha);
      if (qCmd > limitHi) qCmd = Math.max(limitHi, ctrl.pitch > 0 ? 0 : limitHi);
      if (qCmd < limitLo) qCmd = Math.min(limitLo, 0);
      // nose slices towards the flight path when slow / stalled
      const slow = 1 - eff;
      qCmd -= alpha * (0.6 * slow + 3 * wStall);
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
    const ground = env.groundAt(pos.x, pos.z);
    const wheelBottom = pos.y - this.gearHeight * Math.max(0.3, _up.y);
    const bodyBottom = pos.y - 1.0;
    if (this.onGround) {
      // rolling on the ground
      const N = Math.max(0, m * G - liftMag * _lift.y);
      _v.copy(vel);
      _v.y = 0;
      const vh = _v.length();
      if (vh > 0.05) {
        const mu = this.brakes ? 0.55 : 0.025;
        _f.addScaledVector(_v, (-mu * N) / vh);
      }
      // tyres kill sideways motion
      _n.copy(_right);
      _n.y = 0;
      _n.normalize();
      const side = vel.dot(_n);
      _f.addScaledVector(_n, -side * m * 6);
      // nose wheel steering
      const steer = ctrl.yaw * Math.min(1, 8 / Math.max(vh, 1)) * 0.6 * Math.min(1, vh / 3);
      this.r = steer;
      this.p = 0;
      // the nose can only rotate up once there is enough lift
      const canRotate = eff > 0.45;
      if (!canRotate && this.q > 0) this.q = 0;
    }

    // Integrate translation
    vel.addScaledVector(_f, dt / m);
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
      const e = new THREE.Euler(clampedPitch, -heading, 0, 'YXZ');
      quat.setFromEuler(e);
      // lift-off
      if (liftMag * _lift.y > m * G * 1.02 && vel.y >= 0) {
        this.onGround = false;
        pos.y += 0.05;
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
        } else if (bodyBottom <= gh || !this.gearDown || !ground.landable || vs < -5.5) {
          this._crash(this.gearDown ? (vs < -5.5 ? 'Hard landing' : 'Crashed on landing') : 'Crashed into terrain');
        }
      } else if (bodyBottom <= gh) {
        this._crash('Crashed into terrain');
      }
    }
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
