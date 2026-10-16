// Persistent progress + settings (localStorage, failure-tolerant).
const KEY = 'strike-horizon-save-v1';

export const DEFAULT_SETTINGS = {
  quality: 'auto',
  dynamicRes: true,
  invertPitch: false,
  mouseFlight: false,
  sensitivity: 1,
  volume: 0.8,
  voice: true,
  atc: 'full',
  radioFx: true,
  units: 'imperial',
  difficulty: 1,
  showFps: false,
  cameraShake: true,
  touchControls: 'auto',
  unlockAll: false,
  lockAssist: true,
  targetCam: true,
  weaponCam: false,
};

export class Save {
  constructor() {
    this.data = { completed: {}, settings: { ...DEFAULT_SETTINGS }, jet: 'f16' };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data.completed = d.completed || {};
        this.data.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
        this.data.jet = d.jet || 'f16';
      }
    } catch (e) {
      /* storage unavailable */
    }
  }

  get settings() {
    return this.data.settings;
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      /* ignore */
    }
  }

  completedCount() {
    return Object.values(this.data.completed).filter((c) => c && c.stars > 0).length;
  }

  isCompleted(id) {
    const c = this.data.completed[id];
    return !!(c && c.stars > 0);
  }

  // Special operations list the exact missions they need; "unlock all" does
  // not open them.
  isMissionUnlocked(index, missions) {
    const m = missions[index];
    if (m && m.requires) return m.requires.every((id) => this.isCompleted(id));
    if (this.settings.unlockAll || index === 0) return true;
    const prev = missions[index - 1];
    return this.isCompleted(prev.id);
  }

  isJetUnlocked(jet) {
    if (jet.requires) return jet.requires.every((id) => this.isCompleted(id)) && (jet.exclusive || this.settings.unlockAll || this.completedCount() >= jet.unlock);
    return this.settings.unlockAll || this.completedCount() >= jet.unlock;
  }

  recordResult(res) {
    if (!res.success) return { newBest: false };
    const prev = this.data.completed[res.missionId] || { stars: 0, best: 0 };
    const out = {
      stars: Math.max(prev.stars, res.stars),
      best: Math.max(prev.best, res.score),
    };
    this.data.completed[res.missionId] = out;
    this.write();
    return { newBest: res.score > prev.best };
  }

  reset() {
    this.data.completed = {};
    this.write();
  }
}
