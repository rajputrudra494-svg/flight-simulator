// Top-level game: owns the renderer, input, audio, menus and the active
// world / battle / mission, and runs the main loop.
import * as THREE from 'three';
import { installAtmosphere } from '../world/atmosphere.js';
import { PRESETS, detectQuality, isMobileDevice } from './Quality.js';
import { GameRenderer } from './Renderer.js';
import { Input } from './Input.js';
import { AudioEngine } from './Audio.js';
import { Save } from './Save.js';
import { World } from '../world/World.js';
import { Battle } from '../game/Battle.js';
import { Mission } from '../game/Mission.js';
import { MISSIONS } from '../game/missions.js';
import { CameraRig } from '../game/CameraRig.js';
import { Targeting } from '../game/Targeting.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';
import { TouchControls } from '../ui/TouchControls.js';
import { JETS, JET_ORDER } from '../aircraft/jets.js';
import { JetModel } from '../aircraft/JetBuilder.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const TIPS = [
  'Keep your speed between 350 and 450 knots for the tightest sustained turns.',
  'SAM sites cannot see you below about 50 m or behind a mountain.',
  'Flares are most effective when released early and combined with a hard break turn.',
  'The flight path marker shows where the jet is actually going, not where the nose points.',
  'Afterburner burns hot: heat-seeking missiles love it. Throttle back when defending.',
  'Land on the runway in free flight to rearm and repair.',
  'Lower the gear and slow down before landing; touch down under 5 m/s sink rate.',
  'Pull too hard for too long and you will start to black out.',
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
    this.hud = new HUD(this.dom.hud);
    this.input = new Input(this.dom.gl);
    this._applyInputSettings();
    this.audio = new AudioEngine();
    this.audio.volume = this.settings.volume;
    this.audio.voice = this.settings.voice;
    this.menus = new Menus(this.dom.ui, this);
    this.touch = new TouchControls(this.dom.touchRoot, this.input);
    this.touch.show(false);
    window.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.state === 'paused' && this.menus.screen === 'pause') {
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
    this.input.settings.invertPitch = s.invertPitch;
    this.input.settings.mouseFlight = s.mouseFlight;
    this.input.settings.sensitivity = s.sensitivity;
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
    if (['invertPitch', 'mouseFlight', 'sensitivity'].includes(key)) this._applyInputSettings();
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
    this.camera.far = this.quality.viewDistance * 1.6;
    this.camera.updateProjectionMatrix();
    this.world = world;
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
    const len = sc.length;
    const orbitA = t * (hangar ? 0.25 : 0.12) + 0.6;
    const dist = hangar ? len * 1.35 + 6 : len * 2.1 + 12;
    const up = hangar ? 0.22 : 0.18 + Math.sin(t * 0.17) * 0.12;
    const local = new THREE.Vector3(Math.sin(orbitA) * dist, Math.sin(up) * dist, Math.cos(orbitA) * dist);
    local.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0)));
    this.camera.position.copy(pos).add(local);
    this.camera.up.set(0, 1, 0);
    const look = pos.clone();
    if (hangar) look.add(new THREE.Vector3(Math.cos(orbitA) * len * 0.25, 0, 0));
    this.camera.lookAt(look);
    if (this.camera.fov !== 50 || this.camera.near !== 0.5) {
      this.camera.fov = 50;
      this.camera.near = 0.5;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.menuFocus = pos;
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
    });
    battle.on('missileLaunched', (m) => {
      if (m.target === battle.player) this.audio.speak('Missile! Missile!', 'missile', 4);
    });
    battle.on('aircraftCrashed', (ac) => {
      if (ac.isPlayer) this.hud.showCenter(ac.fm.crashReason || 'CRASHED', 3);
    });
    mission.setup(battle);
    this.targeting = new Targeting(battle);
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
    this.state = 'playing';
    this.hud.showCenter(free ? 'FREE FLIGHT' : def.name.toUpperCase(), 3);
    if (!free) mission.radio(def.type === 'Training' ? 'Tower: cleared for the course, good luck rookie.' : 'AWACS: you are cleared hot. Good hunting.');
  }

  onPlayerSpawned(ac) {
    if (this.rig) this.rig.setTarget(ac);
    if (this.targeting) this.targeting.target = null;
  }

  onMissionEnd(result) {
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
    this.gr.render(this.world.scene, this.camera, dt);
    if (dt > 0 && this.state !== 'loading') this.gr.adapt(dt * 1000);
  }

  _updatePlaying(dt) {
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
      if (input.gear) {
        c.gear = !c.gear;
        this.hud.showCenter(c.gear ? 'GEAR DOWN' : 'GEAR UP', 1.2);
      }
      if (input.missile) {
        if (p.missiles <= 0) this.hud.showCenter('NO MISSILES', 1);
        else if (p.missileCooldown <= 0) {
          const locked = this.targeting.fire();
          const call = this.targeting.missileType === 'radar' ? 'FOX 3!' : 'FOX 2!';
          this.hud.showCenter(locked ? call : 'NO LOCK - UNGUIDED', 1);
          if (locked) this.audio.speak(this.targeting.missileType === 'radar' ? 'Fox three' : 'Fox two', 'fox', 2);
        }
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
    this.rig.lookTarget = this.targeting.target;

    battle.update(dt);
    mission.update(dt);
    if (this.state !== 'playing') return;

    // camera + world
    const shake = this.settings.cameraShake ? battle.effects.shake : 0;
    this.rig.update(dt, input, this.world.map, shake);
    const focus = battle.player ? battle.player.position : this.camera.position;
    this.world.update(dt, this.camera, focus);

    // audio
    const cockpit = this.rig.mode === 'cockpit';
    if (p) {
      this.audio.setListener(this.camera.position, new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion));
      this.audio.updateEngine({
        active: p.alive, throttle: p.fm.throttle, ab: p.fm.afterburner, speed: p.fm.airspeed, cockpit,
        gLoad: p.fm.gLoad, airbrake: p.controls.airbrake, gunFiring: p.gunFiring, gunRate: p.spec.weapons.gunRate,
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

    this._render(dt);
    this.hud.draw(dt, { camera: this.camera, battle, mission, targeting: this.targeting, cameraMode: this.rig.mode, settings: this.settings });
    if (p && p.alive) {
      this.audio.updateWarnings({ seeker: this.targeting.seeker, ...this.hud.warnings }, dt);
      if (this.hud.warnings.pullup) this.audio.speak('Pull up! Pull up!', 'pullup', 3);
    } else this.audio.updateWarnings({ seeker: 'none' }, dt);
  }
}
