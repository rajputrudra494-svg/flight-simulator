// On-screen controls for phones and tablets: virtual stick, throttle slider
// and weapon buttons. Writes directly into Input.touch.

export class TouchControls {
  constructor(root, input) {
    this.input = input;
    this.el = document.createElement('div');
    this.el.className = 'touch-ui';
    this.el.innerHTML = `
      <div class="t-stick"><div class="t-stick-knob"></div></div>
      <div class="t-throttle"><div class="t-throttle-fill"></div><div class="t-throttle-knob"></div><span>THR</span></div>
      <div class="t-buttons">
        <button data-b="gun" class="t-btn t-gun">GUN</button>
        <button data-b="missile" class="t-btn t-msl">MSL</button>
        <button data-b="flare" class="t-btn">FLR</button>
        <button data-b="target" class="t-btn">TGT</button>
        <button data-b="camera" class="t-btn">CAM</button>
        <button data-b="gear" class="t-btn t-small">GEAR</button>
        <button data-b="airbrake" class="t-btn t-small">BRK</button>
        <button data-b="reverser" class="t-btn t-small">REV</button>
        <button data-b="radio" class="t-btn t-small">RADIO</button>
      </div>
      <button data-b="pause" class="t-pause">❚❚</button>`;
    root.appendChild(this.el);
    this.stick = this.el.querySelector('.t-stick');
    this.knob = this.el.querySelector('.t-stick-knob');
    this.thr = this.el.querySelector('.t-throttle');
    this.thrFill = this.el.querySelector('.t-throttle-fill');
    this.thrKnob = this.el.querySelector('.t-throttle-knob');
    this.stickId = null;
    this.thrId = null;
    this.throttle = 0.75;
    this._bind();
    this.setThrottle(0.75);
    this.visible = false;
  }

  show(v) {
    this.visible = v;
    this.el.style.display = v ? 'block' : 'none';
  }

  setThrottle(v) {
    this.throttle = Math.max(0, Math.min(1, v));
    this.thrFill.style.height = `${this.throttle * 100}%`;
    this.thrKnob.style.bottom = `calc(${this.throttle * 100}% - 14px)`;
    this.thrFill.classList.toggle('ab', this.throttle > 0.9);
  }

  _bind() {
    const t = this.input.touch;
    const stickMove = (e, touch) => {
      const r = this.stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (touch.clientX - cx) / (r.width / 2), dy = (touch.clientY - cy) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      t.x = dx;
      t.y = dy;
      t.active = true;
      this.knob.style.transform = `translate(${dx * r.width * 0.32}px, ${dy * r.height * 0.32}px)`;
    };
    this.stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      this.stickId = touch.identifier;
      stickMove(e, touch);
    }, { passive: false });
    const thrMove = (touch) => {
      const r = this.thr.getBoundingClientRect();
      const v = 1 - (touch.clientY - r.top) / r.height;
      this.setThrottle(v);
      t.throttle = this.throttle;
    };
    this.thr.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      this.thrId = touch.identifier;
      thrMove(touch);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.stickId) stickMove(e, touch);
        if (touch.identifier === this.thrId) thrMove(touch);
      }
    }, { passive: true });
    const end = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.stickId) {
          this.stickId = null;
          t.active = false;
          t.x = t.y = 0;
          this.knob.style.transform = 'translate(0,0)';
        }
        if (touch.identifier === this.thrId) this.thrId = null;
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    for (const btn of this.el.querySelectorAll('[data-b]')) {
      const b = btn.dataset.b;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        btn.classList.add('down');
        if (b === 'gun') t.gun = true;
        else if (b === 'airbrake') t.buttons.add('airbrake');
        else t.buttons.add(b);
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('down');
        if (b === 'gun') t.gun = false;
        if (b === 'airbrake') t.buttons.delete('airbrake');
      };
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
      // allow mouse clicks for testing on desktop
      btn.addEventListener('mousedown', () => {
        if (b === 'gun') t.gun = true;
        else t.buttons.add(b);
      });
      btn.addEventListener('mouseup', () => {
        if (b === 'gun') t.gun = false;
        if (b === 'airbrake') t.buttons.delete('airbrake');
      });
    }
  }
}
