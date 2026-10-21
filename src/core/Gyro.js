// Tilt-to-fly for phones and tablets. Reads the device orientation, turns it
// into the "up" direction in screen coordinates (so it works in either
// landscape orientation and in portrait), and maps tilt away from a calibrated
// neutral attitude to roll and pitch: rotate the phone like a steering wheel
// to roll, tilt the top edge towards you to pull. Writes into Input.gyro.

const DEG = Math.PI / 180;

export class GyroControl {
  constructor(input) {
    this.input = input;
    this.enabled = false;
    this.sensitivity = 1;
    this.invertPitch = false;
    this.available = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    this.permission = 'unknown'; // unknown | granted | denied
    this.neutral = null; // { roll, pitch } in radians
    this.raw = { roll: 0, pitch: 0 };
    this.filtered = { roll: 0, pitch: 0 };
    this.lastEvent = 0;
    this._wantCalibrate = true;
    this._onOrient = (e) => this._handle(e);
    this._listening = false;
  }

  get needsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  // must be called from a user gesture on iOS
  async requestPermission() {
    if (!this.needsPermission) {
      this.permission = 'granted';
      return true;
    }
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      this.permission = r === 'granted' ? 'granted' : 'denied';
    } catch (e) {
      this.permission = 'denied';
    }
    return this.permission === 'granted';
  }

  setEnabled(on) {
    this.enabled = !!on && this.available;
    if (this.enabled && !this._listening) {
      window.addEventListener('deviceorientation', this._onOrient);
      this._listening = true;
      this._wantCalibrate = true;
    } else if (!this.enabled && this._listening) {
      window.removeEventListener('deviceorientation', this._onOrient);
      this._listening = false;
    }
    if (!this.enabled) {
      const g = this.input.gyro;
      g.active = false;
      g.x = g.y = 0;
    }
  }

  // the current attitude becomes "stick centred"
  calibrate() {
    this._wantCalibrate = true;
  }

  _screenAngle() {
    const so = typeof screen !== 'undefined' && screen.orientation;
    if (so && typeof so.angle === 'number') return so.angle;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }

  _handle(e) {
    if (e.beta === null || e.gamma === null || e.beta === undefined) return;
    this.lastEvent = performance.now();
    const b = e.beta * DEG, g = e.gamma * DEG;
    // world-up expressed in device axes (x right, y top edge, z out of the screen)
    const ux = -Math.sin(g) * Math.cos(b);
    const uy = Math.sin(b);
    const uz = Math.cos(g) * Math.cos(b);
    // rotate into screen axes for the current orientation
    const th = this._screenAngle() * DEG;
    const c = Math.cos(th), s = Math.sin(th);
    const sx = ux * c - uy * s;
    const sy = ux * s + uy * c;
    // steering-wheel angle: screen x axis against the horizon
    const roll = Math.asin(Math.max(-1, Math.min(1, -sx)));
    // how far the screen leans back from upright
    const pitch = Math.atan2(uz, sy);
    this.raw.roll = roll;
    this.raw.pitch = pitch;
    if (this._wantCalibrate || !this.neutral) {
      this.neutral = { roll: 0, pitch };
      this.filtered.roll = roll;
      this.filtered.pitch = pitch;
      this._wantCalibrate = false;
    }
  }

  update(dt) {
    const gi = this.input.gyro;
    if (!this.enabled || !this.neutral || performance.now() - this.lastEvent > 1000) {
      gi.active = false;
      gi.x = gi.y = 0;
      return;
    }
    // light low-pass filter against hand tremor
    const k = Math.min(1, dt * 14);
    this.filtered.roll += (this.raw.roll - this.filtered.roll) * k;
    this.filtered.pitch += (this.raw.pitch - this.filtered.pitch) * k;
    const sens = this.sensitivity;
    const map = (delta, range, dead) => {
      const a = Math.abs(delta);
      if (a < dead) return 0;
      const v = Math.sign(delta) * Math.min(1, ((a - dead) / range) * sens);
      // soft centre, full deflection at the edge of the range
      return v * Math.abs(v) * 0.4 + v * 0.6;
    };
    gi.active = true;
    gi.x = map(this.filtered.roll - this.neutral.roll, 28 * DEG, 1.5 * DEG);
    // top edge towards you (screen more upright) = pull
    let p = -map(this.filtered.pitch - this.neutral.pitch, 22 * DEG, 1.5 * DEG);
    if (this.invertPitch) p = -p;
    gi.y = p;
  }
}
