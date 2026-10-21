// Top-level game: owns the renderer, input, audio, menus and the active
// world / battle / mission, and runs the main loop.
import * as THREE from 'three';
import { installAtmosphere } from '../world/atmosphere.js';
import { PRESETS, detectQuality, isMobileDevice } from './Quality.js';
import { GameRenderer } from './Renderer.js';
import { Input } from './Input.js';
import { GyroControl } from './Gyro.js';
import { AudioEngine } from './Audio.js';
import { Radio } from './Radio.js';
import { Save } from './Save.js';
import { World } from '../world/World.js';
import { Battle } from '../game/Battle.js';
import { Mission } from '../game/Mission.js';
import { ATC } from '../game/ATC.js';
import { MISSIONS } from '../game/missions.js';
import { CameraRig } from '../game/CameraRig.js';
import { Targeting } from '../game/Targeting.js';
import { TargetCam } from '../game/TargetCam.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';
import { TouchControls } from '../ui/TouchControls.js';
import { JETS, JET_ORDER } from '../aircraft/jets.js';
import { JetModel } from '../aircraft/JetBuilder.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// title screen camera: rear quarter, side profile, low front quarter, high
// three-quarter (azimuth 0 = behind, pi = ahead; distance in aircraft lengths)
const TITLE_SHOTS = [
  { az: 0.55, el: 0.14, d: 2.0 },
  { az: 1.55, el: 0.04, d: 1.75 },
  { az: 2.5, el: -0.07, d: 1.9 },
  { az: 1.15, el: 0.42, d: 2.3 },
];
const SHOT_TIME = 9;

const TIPS = [
  'Keep your speed between 350 and 450 knots for the tightest sustained turns.',
  'SAM sites cannot see you below about 50 m or behind a mountain.',
  'Flares are most effective when released early and combined with a hard break turn.',
  'The flight path marker shows where the jet is actually going, not where the nose points.',
  'Afterburner burns hot: heat-seeking missiles love it. Throttle back when defending.',
  'Land on the runway in free flight to rearm and repair.',
  'Lower the gear and slow down before landing; touch down under 5 m/s sink rate.',
  'Pull too hard for too long and you will start to black out.',
  'Press Y to lock whatever you are looking at: works in padlock and free-look too.',
  'Break Mach 1 low over the sea for a sonic boom and a rooster tail of spray.',
  'Heavy jets need flaps (gear down) and patience: rotate at about 150 knots.',
  'Fly low between the skyscrapers to stay under enemy radar in the city.',
  'Press M to talk to ATC: ask for take-off clearance, vectors to the ILS or a bogey dope from AWACS.',
  'Airliners: set the autobrake with U before landing and press J after touchdown for reverse thrust.',
  'Fighters with a drag chute (MiG-29, Su-35, Typhoon...) pop it with J on the landing roll.',
  'Brakes get hot: on a snowy or wet runway let the reversers and chute do more of the work.',
  'Every aircraft is unlocked in Free Flight. The campaign still unlocks them for missions.',
  'Remap any key, mouse button or gamepad button in Controls. Joysticks and HOTAS throttles work too.',
  'Bombers: designate a ground target, fly towards it and release inside the range cue. The JDAM glides the rest of the way.',
  'The SR-71 is held to 450 knots down low. Climb above 20 km before you light the burners and run for Mach 3.',
  'The B-52 wing is set at +6 degrees: it lifts off almost flat and cruises nose-down.',
  'On a phone, switch on tilt steering in Controls and tap TILT to recentre the neutral attitude.',
  'Too much glare? Lower the scene brightness in Settings.',
];

export class Game {
  constructor() {
    this.save = new Save();
    this.settings = this.save.settings;
    this.state = 'boot';
    this.lastResult = null;
    this.newlyUnlocked = [];
    this.flareProgram = 0;
    this.gStress = 0;
    this.damageFlash = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.fps = 0;
    this.menuTime = 0;
  }

  async init() {
    installAtmosphere();
    this.dom = {
      gl: document.getElementById('gl'),
      hud: document.getElementById('hud'),
      ui: document.getElementById('ui'),
      loading: document.getElementById('loading'),
      loadingText: document.getElementById('loading-text'),
      loadingBar: document.getElementById('loading-bar'),
      loadingTip: document.getElementById('loading-tip'),
      fps: document.getElementById('fps'),
      fxBlack: document.getElementById('fx-black'),
      fxRed: document.getElementById('fx-red'),
      fxWhite: document.getElementById('fx-white'),
      touchRoot: document.getElementById('touch'),
    };
    this.gr = new GameRenderer(this.dom.gl);
    // probe GPU for auto quality
    const probe = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!probe) {
      this._fatal('WebGL is not available in this browser. Please enable hardware acceleration or try a different browser.');
      return;
    }
    this.detected = detectQuality(probe);
    this.qualityKey = this.settings.quality === 'auto' ? this.detected.tier : this.settings.quality;
    this.quality = PRESETS[this.qualityKey];
    try {
      this.gr.init(this.quality);
    } catch (e) {
      this._fatal('Could not start WebGL 2. Your browser or GPU may not support it.');
      return;
    }
    this.gr.dynamic.enabled = this.settings.dynamicRes;
    this.renderer = this.gr.renderer;
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.8, this.quality.viewDistance * 1.6);
    this.rig = new CameraRig(this.camera);
    this.targetCam = new TargetCam(this.renderer);
    this.hud = new HUD(this.dom.hud);
    this.input = new Input(this.dom.gl);
    this.gyro = new GyroControl(this.input);
    this.audio = new AudioEngine();
    this.audio.volume = this.settings.volume;
    this.audio.voice = this.settings.voice;
    this.radio = new Radio(this.audio);
    this._syncRadioSettings();
    this.atc = null;
    this.atcMenu = null;
    this.menus = new Menus(this.dom.ui, this);
    this.touch = new TouchControls(this.dom.touchRoot, this.input);
    this.touch.show(false);
    this.touch.onLayoutChange = (layout) => {
      this.settings.touchLayout = JSON.parse(JSON.stringify(layout));
      this.save.write();
    };
    this.touch.onGyroButton = () => {
      if (!this.settings.gyro) return;
      // first tap after a reload on iOS: ask for motion access
      if (this.gyro.needsPermission && this.gyro.permission === 'unknown') this._enableGyro(true);
      this.gyro.calibrate();
      this.hud.showCenter('TILT CENTRED', 1);
    };
    this.touch.haptic = (ms) => this.haptic(ms);
    this.touch.onEditDone = () => {
      this.touch.show(this.state === 'playing' && this._touchWanted());
      this.menus.show('controls', false);
    };
    this._applyInputSettings();
    window.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || this.input.isBound('pause', e.code)) && this.state === 'paused' && this.menus.screen === 'pause') {
        e.preventDefault();
        this.resume();
      }
    });
    this._resize();
    this.clock = new THREE.Clock();
    requestAnimationFrame(() => this._loop());
    await this._loadMenuWorld();
    this.menus.show('title');
  }

  _fatal(msg) {
    this.dom.loading.style.display = 'flex';
    this.dom.loadingText.textContent = msg;
    this.dom.loadingBar.parentElement.style.display = 'none';
  }

  _applyInputSettings() {
    const s = this.settings;
    // tilt steering defaults to on for phones and tablets only
    if (s.gyro === null || s.gyro === undefined) s.gyro = isMobileDevice() && this.gyro.available;
    this.input.settings.invertPitch = s.invertPitch;
    this.input.settings.mouseFlight = s.mouseFlight;
    this.input.settings.sensitivity = s.sensitivity;
    this.input.setControls(s.controls);
    this.gyro.sensitivity = s.gyroSensitivity;
    this.gyro.invertPitch = s.gyroInvertPitch;
    // listen straight away (Android delivers motion data without a prompt); iOS
    // only starts sending it once a tap has granted access (see Menus / TILT)
    this.gyro.setEnabled(!!s.gyro);
    this.touch.setLayout(s.touchLayout);
    this.touch.setGyro(s.gyro);
  }

  // tilt steering needs motion-sensor permission on iOS (asked from the tap that enabled it)
  async _enableGyro(on) {
    if (!on) {
      this.gyro.setEnabled(false);
      this.touch.setGyro(false);
      return;
    }
    const ok = await this.gyro.requestPermission();
    if (!ok || !this.gyro.available) {
      this.settings.gyro = false;
      this.save.write();
      this.gyro.setEnabled(false);
    } else {
      this.gyro.setEnabled(true);
      this.gyro.calibrate();
    }
    this.touch.setGyro(this.settings.gyro);
    if (this.menus.screen === 'controls' || this.menus.screen === 'settings') this.menus.show(this.menus.screen, false);
  }

  haptic(pattern) {
    if (!this.settings.haptics || !navigator.vibrate || !this._touchWanted()) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      /* not allowed */
    }
  }

  // layout editor for the on-screen controls (opened from the Controls screen)
  editTouchLayout() {
    this.menus.hide();
    this.touch.edit(true);
  }

  // scene exposure: the map / time-of-day value scaled by the player's brightness
  _applyBrightness() {
    if (!this.world) return;
    this.renderer.toneMappingExposure = this.world.lighting.exposure * (this.settings.brightness ?? 0.8);
  }

  _syncRadioSettings() {
    const s = this.settings;
    this.radio.settings = { voice: s.voice !== false, chatter: s.atc || 'full', fx: s.radioFx !== false };
  }

  _touchWanted() {
    const t = this.settings.touchControls;
    return t === 'on' || (t === 'auto' && isMobileDevice());
  }

  _resize() {
    this.gr.resize();
    this.hud.resize(this.quality.maxPixelRatio);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  applySetting(key, val) {
    this.settings[key] = val;
    this.save.write();
    if (key === 'quality') {
      this.qualityKey = val === 'auto' ? this.detected.tier : val;
      this.quality = PRESETS[this.qualityKey];
      this.gr.applyPreset(this.quality);
      this.hud.resize(this.quality.maxPixelRatio);
    }
    if (key === 'dynamicRes') {
      this.gr.dynamic.enabled = val;
      if (!val) { this.gr.dynamic.scale = 1; this.gr.resize(); }
    }
    if (key === 'volume') this.audio.setVolume(val);
    if (key === 'voice') this.audio.voice = val;
    if (['voice', 'atc', 'radioFx'].includes(key)) this._syncRadioSettings();
    if (['invertPitch', 'mouseFlight', 'sensitivity', 'controls', 'gyroSensitivity', 'gyroInvertPitch'].includes(key)) this._applyInputSettings();
    if (key === 'gyro') this._enableGyro(val);
    if (key === 'brightness') this._applyBrightness();
    if (key === 'touchControls' && this.state === 'playing') this.touch.show(this._touchWanted());
    if (key === 'unlockAll' && this.menus.screen === 'settings') this.menus.show('settings', false);
  }

  // ---------------------------------------------------------------- loading
  _setLoading(on, text = '', progress = 0) {
    this.dom.loading.style.display = on ? 'flex' : 'none';
    if (on) {
      this.dom.loadingText.textContent = text;
      this.dom.loadingBar.style.width = `${Math.round(progress * 100)}%`;
    }
  }

  async _buildWorld(mapId, time, weather = 1, focus = null) {
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    if (this.mission) { this.mission.dispose(); this.mission = null; }
    if (this.showcase) { this.world?.scene.remove(this.showcase.root); this.showcase.dispose(); this.showcase = null; }
    if (this.world) { this.world.dispose(); this.world = null; }
    this.renderer.renderLists.dispose();
    this._setLoading(true, 'Generating terrain…', 0.15);
    this.dom.loadingTip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    await nextFrame();
    const world = new World(this.renderer, this.quality, mapId, time, weather);
    this._setLoading(true, 'Building atmosphere…', 0.35);
    await nextFrame();
    world.build();
    this.world = world;
    this._applyBrightness();
    this.camera.far = this.quality.viewDistance * 1.6;
    this.camera.updateProjectionMatrix();
    if (focus) {
      this.camera.position.copy(focus);
      this.camera.updateMatrixWorld();
    }
    return world;
  }

  async _loadMenuWorld() {
    this.state = 'loading';
    const world = await this._buildWorld('pacific', 'default', 1);
    const ab = world.map.airbase;
    this.menuCenter = new THREE.Vector3(ab.x, ab.elevation + 700, ab.z);
    this._setShowcase(this.save.data.jet);
    this._setLoading(true, 'Preparing airspace…', 0.7);
    await nextFrame();
    this._updateMenuCamera(0);
    world.warmup(this.camera);
    this._setLoading(false);
    this.state = 'menu';
  }

  _setShowcase(jetId) {
    if (!this.world) return;
    if (this.showcase) {
      this.world.scene.remove(this.showcase.root);
      this.showcase.dispose();
    }
    this.showcase = new JetModel(JETS[jetId] || JETS.f16, this.quality, { gear: false });
    this.world.scene.add(this.showcase.root);
  }

  onJetSelected(id) {
    if (this.state === 'menu') this._setShowcase(id);
  }

  onMenuScreen(screen) {
    this.menuScreen = screen;
    if (screen === 'pause' || screen === 'results') return;
    if (this.state === 'paused' && (screen === 'settings' || screen === 'controls')) return;
  }

  _updateMenuCamera(dt) {
    this.menuTime += dt;
    const t = this.menuTime;
    const sc = this.showcase;
    if (!sc) return;
    const hangar = this.menuScreen === 'hangar';
    // jet flies a slow circle above the islands
    const R = 4200;
    const w = hangar ? 0.0 : 0.045;
    const ang = t * w;
    const c = this.menuCenter;
    const pos = new THREE.Vector3(c.x + Math.cos(ang) * R, c.y + Math.sin(t * 0.3) * 6, c.z + Math.sin(ang) * R);
    sc.root.position.copy(pos);
    const heading = -ang - Math.PI; // tangent direction
    const bank = hangar ? 0.0 : -0.32;
    sc.root.rotation.set(0, 0, 0);
    sc.root.rotation.order = 'YXZ';
    sc.root.rotation.y = heading;
    sc.root.rotation.z = bank + Math.sin(t * 0.7) * 0.03;
    sc.root.rotation.x = Math.sin(t * 0.4) * 0.02;
    sc.animate(dt, { pitch: Math.sin(t * 0.5) * 0.1, roll: 0, yaw: 0, throttle: 0.8, ab: hangar ? 0 : 0.6 + 0.4 * Math.sin(t * 0.25) ** 2, gear: false });
    // frame by the bigger of length and span (flying wings are 2.5x wider than long)
    const len = Math.max(sc.length, sc.span * 0.8);
    let orbitA, dist, up;
    if (hangar) {
      orbitA = t * 0.25 + 0.6;
      dist = len * 1.35 + 6;
      up = 0.22;
    } else {
      // title: a slow sequence of cinematic shots that blend into one another
      const k = Math.floor(t / SHOT_TIME);
      const a = TITLE_SHOTS[k % TITLE_SHOTS.length], b = TITLE_SHOTS[(k + 1) % TITLE_SHOTS.length];
      const f = THREE.MathUtils.smoothstep((t % SHOT_TIME) / SHOT_TIME, 0.62, 1);
      orbitA = a.az + (b.az - a.az) * f + Math.sin(t * 0.09) * 0.12;
      up = a.el + (b.el - a.el) * f + Math.sin(t * 0.17) * 0.04;
      dist = (len * (a.d + (b.d - a.d) * f) + 10);
    }
    const local = new THREE.Vector3(Math.sin(orbitA) * dist, Math.sin(up) * dist, Math.cos(orbitA) * dist);
    local.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0)));
    const cam = this.camera;
    cam.position.copy(pos).add(local);
    cam.up.set(0, 1, 0);
    const look = pos.clone();
    if (hangar) look.add(new THREE.Vector3(Math.cos(orbitA) * len * 0.25, 0, 0));
    else if (window.innerWidth > window.innerHeight * 1.2 && window.innerWidth > 760) {
      // wide screens: hold the aircraft in the right half, clear of the menu
      const right = new THREE.Vector3().subVectors(pos, cam.position).normalize().cross(cam.up).normalize();
      look.addScaledVector(right, -dist * 0.3);
    }
    cam.lookAt(look);
    if (cam.fov !== 50 || cam.near !== 0.5) {
      cam.fov = 50;
      cam.near = 0.5;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    this.menuFocus = pos;
    this._titleReticle(sc, pos, t);
  }

  // target box that tracks the showcase aircraft on the title screen
  _titleReticle(sc, pos, t) {
    const el = this.menuScreen === 'title' ? document.getElementById('ts-reticle') : null;
    if (!el) return;
    const cam = this.camera;
    const p = pos.clone().project(cam);
    const w = window.innerWidth, h = window.innerHeight;
    if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) {
      el.classList.remove('on');
      return;
    }
    // apparent size from the aircraft's bounding radius at its distance
    const d = cam.position.distanceTo(pos);
    const px = (sc.radius / (d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) * (h / 2);
    const bw = Math.max(70, px * 2.1), bh = Math.max(46, px * 1.15);
    const x = (p.x * 0.5 + 0.5) * w - bw / 2, y = (-p.y * 0.5 + 0.5) * h - bh / 2;
    el.style.width = `${bw.toFixed(0)}px`;
    el.style.height = `${bh.toFixed(0)}px`;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.classList.add('on');
    // live readout like a targeting pod: speed, altitude, range
    if (!this._retT || t - this._retT > 0.25) {
      this._retT = t;
      const data = document.getElementById('ts-ret-data');
      const spec = sc.spec;
      const kts = Math.round((spec.civil ? 250 : 420) + Math.sin(t * 0.21) * 12);
      if (data) data.textContent = `${kts} KT  ${Math.round(pos.y * 3.281)} FT  RNG ${(d / 1852).toFixed(2)} NM`;
    }
  }

  // ---------------------------------------------------------------- missions
  startMission(def, jetId) {
    this.audio.init();
    this.currentMission = { def, jetId, free: false };
    this._launch();
  }

  startFree(opts, jetId) {
    this.audio.init();
    const def = { id: 'free', name: 'Free Flight', map: opts.map, time: opts.time, par: 0, setup() {} };
    this.currentMission = { def, jetId, free: true, opts };
    this._launch();
  }

  async _launch() {
    const { def, jetId, free, opts } = this.currentMission;
    this.menus.hide();
    this.state = 'loading';
    this.hud.clear();
    this.radio.reset();
    this._closeAtcMenu();
    if (this.atc) { this.atc.dispose(); this.atc = null; }
    const world = await this._buildWorld(def.map, def.time || 'default', 1);
    this._setLoading(true, 'Deploying forces…', 0.6);
    await nextFrame();
    const battle = new Battle(this, world);
    this.battle = battle;
    const mission = new Mission(this, def, { jetId, free, ...(opts || {}) });
    this.mission = mission;
    battle.on('aircraftKilled', (ac, src) => mission.onKill(ac, src));
    battle.on('groundKilled', (u, src) => mission.onKill(u, src));
    battle.on('playerHit', () => { this.hud.hitMarker = 0.25; });
    battle.on('playerDamaged', (amt) => {
      this.damageFlash = Math.min(1, this.damageFlash + amt / 40);
      this.rig.shake = Math.max(this.rig.shake, 0.6);
      this.atc?.onPlayerHit(amt);
      this.haptic(Math.min(140, 30 + amt * 2));
    });
    battle.on('aircraftKilled', (ac) => { if (ac.isPlayer) this.haptic([90, 50, 160]); });
    battle.on('missileLaunched', (m) => this.atc?.onMissileLaunched(m));
    battle.on('playerLocked', (by, t) => this.atc?.onLocked(by, t));
    battle.on('aircraftEvent', (ac, ev) => this._onAircraftEvent(ac, ev));
    battle.on('aircraftCrashed', (ac) => {
      if (ac.isPlayer) {
        this.hud.showCenter(ac.fm.crashReason || 'CRASHED', 3);
        this.haptic([140, 60, 260]);
      }
    });
    battle.on('sonicBoom', (ac) => {
      if (ac.isPlayer) {
        this.hud.showFlash('MACH 1  -  SOUND BARRIER', 2.4);
        mission.onSonicBoom?.(ac);
        this.atc?.onSonicBoom(ac);
      }
    });
    mission.setup(battle);
    this.targeting = new Targeting(battle, this.settings);
    this.atc = new ATC(this, battle, mission, this.radio);
    this._setLoading(true, 'Streaming terrain…', 0.8);
    await nextFrame();
    this.rig.setMode('chase');
    this.rig.setTarget(battle.player);
    this.rig.update(0.016, null, world.map);
    world.warmup(this.camera);
    this._setLoading(false);
    this.hud.maxG = 1;
    this.gStress = 0;
    this.damageFlash = 0;
    this.flareProgram = 0;
    this.touch.show(this._touchWanted());
    this.input.pressed.clear();
    this.gyro.calibrate();
    if (this._touchWanted() && window.innerHeight > window.innerWidth) this.hud.showFlash('TURN YOUR DEVICE SIDEWAYS', 3);
    else if (this._touchWanted() && this.settings.gyro && !this.gyro.lastEvent) this.hud.showFlash('TAP TILT TO START TILT STEERING', 3);
    this.state = 'playing';
    this.hud.showCenter(free ? 'FREE FLIGHT' : def.name.toUpperCase(), 3);
    this.atc.start();
    for (const text of mission.pendingRadio) this.atc.missionRadio(text);
    mission.pendingRadio.length = 0;
  }

  // Flight-model events (touchdown, reversers, chute, autobrake...) for the HUD and ATC
  _onAircraftEvent(ac, ev) {
    if (ac.isPlayer && this.state === 'playing') {
      if (ev.type === 'chute' && ev.state === 'failed') this.hud.showCenter('CHUTE FAILED - DEPLOYED TOO FAST', 2);
      else if (ev.type === 'autobrake' && ev.reason && ev.reason.startsWith('disarm')) this.hud.showCenter('AUTOBRAKE DISARM', 1.4);
      else if (ev.type === 'rto') this.hud.showCenter('REJECTED TAKEOFF - MAX BRAKING', 2);
      else if (ev.type === 'touchdown' && ev.firm) this.rig.shake = Math.max(this.rig.shake, Math.min(1, 0.3 - ev.vs * 0.08));
    }
    this.atc?.onAircraftEvent(ac, ev);
  }

  // M: the ATC request menu; 1-6 pick, M or Backspace close
  _toggleAtcMenu() {
    if (this.atcMenu) return this._closeAtcMenu();
    const options = this.atc ? this.atc.menuOptions() : [];
    if (!options.length) return;
    this.atcMenu = { options, t: 10 };
    this.input.menuMode = true;
    this.audio.click();
  }

  _closeAtcMenu() {
    this.atcMenu = null;
    this.input.menuMode = false;
  }

  _cycleAutobrake(p) {
    const fm = p.fm;
    if (!fm.autobrake || !fm.autobrake.available) {
      this.hud.showCenter('NO AUTOBRAKE - USE B TO BRAKE', 1.2);
      return;
    }
    const mode = fm.cycleAutobrake();
    this.hud.showCenter(`AUTOBRAKE ${mode}`, 1.2);
    this.audio.click();
  }

  // J: thrust reversers on airliners, drag chute on fighters that carry one
  _toggleDecelDevice(p) {
    const fm = p.fm, c = p.controls;
    if (fm.reverser && fm.reverser.available) {
      if (!fm.onGround) {
        this.hud.showCenter('REVERSE INHIBITED - WEIGHT ON WHEELS', 1.4);
        c.reverse = false;
        return;
      }
      if (!c.reverse && fm.groundSpeed < 2) {
        this.hud.showCenter('REVERSE INHIBITED - TOO SLOW', 1.2);
        return;
      }
      c.reverse = !c.reverse;
      if (c.reverse && c.throttle > 0.1) c.throttle = 0;
      this.hud.showCenter(c.reverse ? 'REVERSE THRUST' : 'REVERSERS STOWED', 1);
      return;
    }
    if (fm.chute && fm.chute.available) {
      const st = fm.chute.state;
      if (st === 'deploying' || st === 'deployed') {
        c.chute = false;
        this.hud.showCenter('CHUTE JETTISON', 1);
      } else if (st !== 'stowed') {
        this.hud.showCenter('CHUTE ALREADY USED', 1.2);
      } else if (!fm.onGround) {
        this.hud.showCenter('CHUTE: ON THE LANDING ROLL ONLY', 1.4);
      } else {
        c.chute = true;
        this.hud.showCenter('DRAG CHUTE', 1);
      }
      return;
    }
    this.hud.showCenter('NO REVERSERS OR CHUTE - USE B TO BRAKE', 1.4);
  }

  onPlayerSpawned(ac) {
    if (this.rig) this.rig.setTarget(ac);
    if (this.targeting) this.targeting.target = null;
  }

  onMissionEnd(result) {
    this._closeAtcMenu();
    this.lastResult = result;
    const before = JET_ORDER.filter((id) => this.save.isJetUnlocked(JETS[id]));
    if (!this.currentMission.free) this.save.recordResult(result);
    const after = JET_ORDER.filter((id) => this.save.isJetUnlocked(JETS[id]));
    this.newlyUnlocked = after.filter((id) => !before.includes(id));
    this.state = 'results';
    this.input.releasePointer();
    this.audio.silence();
    this.touch.show(false);
    this.menus.show('results', false);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releasePointer();
    this.audio.silence();
    this.radio.pause();
    this._closeAtcMenu();
    this.touch.show(false);
    this.menus.history = [];
    this.menus.show('pause', false);
  }

  resume() {
    this.menus.hide();
    this.input.pressed.clear();
    this.state = 'playing';
    this.touch.show(this._touchWanted());
    this.clock.getDelta();
  }

  restart() {
    this.menus.hide();
    this._launch();
  }

  nextMission() {
    const i = MISSIONS.findIndex((m) => m.id === this.currentMission.def.id);
    if (i >= 0 && i < MISSIONS.length - 1) {
      this.menus.selectedMission = i + 1;
      this.menus.history = ['title', 'campaign'];
      this.menus.show('briefing', false);
      this.state = 'results';
    }
  }

  async quitToMenu() {
    this.menus.hide();
    this.touch.show(false);
    this.audio.silence();
    this.radio.reset();
    if (this.atc) { this.atc.dispose(); this.atc = null; }
    this.hud.clear();
    await this._loadMenuWorld();
    this.menus.history = [];
    this.menus.show('title', false);
  }

  // ---------------------------------------------------------------- loop
  _loop() {
    requestAnimationFrame(() => this._loop());
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.fpsFrames++;
    this.fpsTime += rawDt;
    if (this.fpsTime > 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      if (this.settings.showFps) {
        const info = this.renderer.info.render;
        this.dom.fps.textContent = `${this.fps.toFixed(0)} fps · ${Math.round(this.gr.dynamic.scale * 100)}% res · ${info.calls} draws`;
      }
      this.dom.fps.style.display = this.settings.showFps ? 'block' : 'none';
    }
    if (this.state === 'boot' || !this.world) return;
    // the radio keeps talking through the results screen; it is reset on launch/quit
    if (this.state === 'playing' || this.state === 'results') this.radio.update(dt);
    if (this.state === 'menu' || ((this.state === 'results' || this.state === 'paused') && !this.battle)) {
      this._updateMenuCamera(dt);
      this.world.update(dt, this.camera, this.menuFocus);
      this._render(dt);
      return;
    }
    if (this.state === 'playing') this._updatePlaying(dt);
    else if (this.state === 'results' && this.battle) {
      // keep the world animating behind the results screen
      this.battle.update(dt * 0.5);
      this.rig.update(dt * 0.5, null, this.world.map);
      this.world.update(dt, this.camera, this.battle.player?.position);
      this._render(dt);
    } else if (this.state === 'paused') {
      this._render(0);
    }
  }

  _render(dt) {
    this.renderer.info.reset();
    this.renderer.info.autoReset = false;
    // cockpit interior: an overlay that follows the player's airframe
    const model = this.battle && this.rig.mode === 'cockpit' ? this.battle.player?.model : null;
    const cockpit = model && model.cockpitOn ? model.cockpit : null;
    if (cockpit) cockpit.syncTransform();
    this.gr.setOverlay(cockpit ? cockpit.holder : null);
    this.gr.render(this.world.scene, this.camera, dt);
    if (dt > 0 && this.state !== 'loading') this.gr.adapt(dt * 1000);
  }

  _updatePlaying(dt) {
    this.gyro.update(dt);
    const input = this.input.update(dt);
    const battle = this.battle;
    const mission = this.mission;
    const p = battle.player;
    if (input.pause) {
      this.pause();
      return;
    }
    // player controls
    if (p && p.alive && !p.dying) {
      const c = p.controls;
      c.pitch = input.pitch;
      c.roll = input.roll;
      c.yaw = input.yaw;
      if (input.throttleAbs !== null) c.throttle = input.throttleAbs;
      c.throttle = THREE.MathUtils.clamp(c.throttle + input.throttleRate * dt * 0.55, 0, 1);
      if (input.throttleRate !== 0 && this.touch.visible) this.touch.setThrottle(c.throttle);
      c.gun = input.gun;
      c.airbrake = input.airbrake;
      c.brakes = input.brakes;
      if (input.autobrake) this._cycleAutobrake(p);
      if (input.reverser) this._toggleDecelDevice(p);
      if (input.radioQuick && this.atc) this.atc.request();
      if (input.radio && this.atc) this._toggleAtcMenu();
      if (this.atcMenu) {
        this.atcMenu.t -= dt;
        const pick = input.menuPick ? this.atcMenu.options[input.menuPick - 1] : null;
        if (pick) this.atc.command(pick.id);
        if (pick || input.menuClose || this.atcMenu.t <= 0) this._closeAtcMenu();
      }
      if (input.gear) {
        c.gear = !c.gear;
        this.hud.showCenter(c.gear ? 'GEAR DOWN' : 'GEAR UP', 1.2);
      }
      if (input.missile) {
        if (p.civil || p.unarmed) this.hud.showCenter('UNARMED AIRCRAFT', 1);
        else if (this.targeting.weaponMode === 'bomb') {
          if (p.bombs <= 0) this.hud.showCenter('NO BOMBS', 1);
          else if (p.missileCooldown <= 0) {
            const guided = this.targeting.fire();
            this.hud.showCenter(guided ? 'BOMB AWAY - GUIDED' : 'BOMB AWAY - BALLISTIC', 1);
            this.haptic(20);
          }
        } else if (p.missiles <= 0) this.hud.showCenter('NO MISSILES', 1);
        else if (p.missileCooldown <= 0) {
          const locked = this.targeting.fire();
          const call = this.targeting.missileType === 'radar' ? 'FOX 3!' : 'FOX 2!';
          this.hud.showCenter(locked ? call : 'NO LOCK - UNGUIDED', 1);
          if (locked) this.atc?.onFox(this.targeting.missileType);
          this.haptic(30);
        }
      }
      if (input.lockView && !p.civil) {
        if (this.targeting.selectInView(this.camera)) this.hud.showCenter('TARGET DESIGNATED', 0.8);
      }
      if (input.flare && p.flares > 0) this.flareProgram = 3;
      c.flare = false;
      if (this.flareProgram > 0 && p.flareCooldown <= 0) {
        c.flare = true;
        this.flareProgram--;
      }
      if (input.target) this.targeting.cycle();
    }
    if (input.camera) {
      this.hud.modeText = this.rig.cycle();
      this.hud.modeTimer = 1.5;
    }
    if (input.view) {
      this.hud.modeText = this.rig.setMode(this.rig.mode === 'padlock' ? 'chase' : 'padlock');
      this.hud.modeTimer = 1.5;
    }
    this.targeting.update(dt);
    if (this.targeting.newLock) this.audio.click();
    this.rig.lookTarget = this.targeting.target;

    battle.update(dt);
    mission.update(dt);
    if (this.state !== 'playing') return;
    this.atc?.update(dt);
    // destroyed: cut to the crash camera over the wreckage
    if (p && !p.alive && this.rig.mode !== 'crash' && battle.player === p) this.rig.crashView(p.wreckFocus || p.position.clone());

    // camera + world
    const shake = this.settings.cameraShake ? battle.effects.shake : 0;
    this.rig.update(dt, input, this.world.map, shake);
    const focus = battle.player ? battle.player.position : this.camera.position;
    this.world.update(dt, this.camera, focus);

    // audio
    const cockpit = this.rig.mode === 'cockpit';
    if (p) {
      this.audio.setListener(this.camera.position, new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion));
      const rev = p.fm.reverser;
      this.audio.updateEngine({
        // reverse thrust spools the engines up even with the levers at idle
        active: p.alive, throttle: Math.max(p.fm.throttle, rev ? (rev.power || 0) * 0.8 : 0), ab: p.fm.afterburner, speed: p.fm.airspeed, cockpit,
        gLoad: p.fm.gLoad, airbrake: p.controls.airbrake, gunFiring: p.gunFiring, gunRate: p.spec.weapons.gunRate,
        turbofan: !!p.spec.flight.noAB, supersonicExternal: p.fm.mach > 1.0 && !cockpit,
      });
      this.audio.updateGround?.({
        onGround: p.alive && p.fm.onGround, speed: p.fm.groundSpeed ?? p.fm.airspeed, brake: p.fm.brakePressure || 0,
        antiskid: !!p.fm.antiskid, reverser: rev ? rev.power || 0 : 0, spoilers: p.fm.spoilers || 0, cockpit,
      });
    }

    // screen effects: G blackout, damage, cloud whiteout
    if (p && p.alive) {
      const g = p.fm.gLoad;
      if (g > 7.8) this.gStress += (g - 7.8) * dt * 0.32;
      else if (g < -2.6) this.gStress += (-2.6 - g) * dt * 0.5;
      else this.gStress = Math.max(0, this.gStress - dt * 0.35);
      this.gStress = Math.min(this.gStress, 1.6);
    } else this.gStress = Math.max(0, this.gStress - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.2);
    const black = THREE.MathUtils.smoothstep(this.gStress, 0.35, 1.4) * 0.9;
    const cloud = this.world.clouds.densityAt(this.camera.position) * (cockpit ? 0.9 : 0.75);
    this.dom.fxBlack.style.opacity = black.toFixed(3);
    this.dom.fxRed.style.opacity = this.damageFlash.toFixed(3);
    this.dom.fxWhite.style.opacity = cloud.toFixed(3);

    // targeting pod: zoomed video of the target (PiP outside, MFD in the cockpit)
    const tc = this.targetCam;
    const wantPod = p && p.alive && !p.civil && this.settings.targetCam !== false && this.qualityKey !== 'low' && this.targeting.target;
    if (wantPod) tc.update(dt, this.world.scene, p, this.targeting.target, this.camera);
    else tc.active = false;
    if (cockpit && p && p.model.cockpit) {
      p.model.cockpit.update(dt, {
        ac: p, battle, targeting: this.targeting, warnings: this.hud.warnings, tgpTexture: tc.texture,
        camera: this.camera, world: this.world, exposure: this.renderer.toneMappingExposure,
      });
    }
    this._render(dt);
    if (tc.active && !cockpit) {
      const w = Math.round(Math.min(300, window.innerWidth * 0.22)), h = Math.round(w * 0.75);
      tc.present({ x: window.innerWidth - w - 18, y: 70, w, h });
    } else tc.rect = null;
    this.hud.draw(dt, { camera: this.camera, battle, mission, targeting: this.targeting, cameraMode: this.rig.mode, settings: this.settings, targetCam: tc.rect ? tc : null, radio: this.radio, atcMenu: this.atcMenu });
    if (p && p.alive) {
      this.audio.updateWarnings({ seeker: this.targeting.seeker, ...this.hud.warnings }, dt);
      if (this.hud.warnings.pullup) this.radio.warn('Pull up, pull up', 'pullup', 3);
    } else this.audio.updateWarnings({ seeker: 'none' }, dt);
  }
}
