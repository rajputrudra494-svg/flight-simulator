// Browser smoke test: boots the built game in headless Chromium (SwiftShader
// WebGL), walks through the menus, flies missions (including the city maps,
// an airliner and the An-124) with scripted
// inputs and reports runtime errors plus flight / AI telemetry.
//   usage: node scripts/smoke-test.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4173/';
const outDir = 'smoke-screenshots';
fs.mkdirSync(outDir, { recursive: true });

async function waitForServer(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (e) {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start: ' + url);
}

await waitForServer(base);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const quality = process.env.SMOKE_QUALITY || 'low';
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
  if (m.type() === 'warning' && !/GPU stall|swiftshader|WebGL|deprecated/i.test(m.text())) console.log('  warn:', m.text().slice(0, 200));
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 8).join('\n')));
await page.addInitScript((q) => {
  localStorage.setItem('strike-horizon-save-v1', JSON.stringify({ completed: {}, settings: { quality: q, unlockAll: true, showFps: true, dynamicRes: false, voice: false }, jet: 'f16' }));
}, quality);

const t0 = Date.now();
await page.goto(base);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 240000 });
console.log(`menu ready after ${Date.now() - t0} ms (quality ${quality})`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/00-title.png` });
for (const s of ['campaign', 'free', 'hangar', 'settings', 'controls']) {
  await page.evaluate((screen) => window.__game.menus.show(screen), s);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/01-${s}.png` });
}
await page.evaluate(() => { window.__game.menus.selectedMission = 3; window.__game.menus.show('briefing'); });
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/02-briefing.png` });

const telemetry = () => {
  const g = window.__game;
  const b = g.battle;
  if (!b) return { state: g.state };
  const p = b.player;
  const fm = p.fm;
  const att = fm.attitude();
  return {
    state: g.state,
    mission: g.mission.status,
    reason: g.mission.failReason,
    t: +g.mission.time.toFixed(1),
    fps: +g.fps.toFixed(1),
    draws: g.renderer.info.render.calls,
    player: {
      alt: Math.round(p.position.y),
      kts: Math.round(fm.ias * 1.944),
      mach: +fm.mach.toFixed(2),
      g: +fm.gLoad.toFixed(1),
      pitch: Math.round(att.pitch),
      roll: Math.round(att.roll),
      thr: +fm.throttle.toFixed(2),
      hp: Math.round(p.health),
      msl: p.missiles,
      gun: p.gunAmmo,
      alive: p.alive,
      crashed: fm.crashed ? fm.crashReason : '',
    },
    target: g.targeting.target ? (g.targeting.target.label || g.targeting.target.name) : null,
    lock: +g.targeting.lock.toFixed(2),
    ai: b.aircraft.filter((a) => !a.isPlayer).map((a) => ({
      mode: a.ai ? a.ai.mode : '-', alt: Math.round(a.position.y), kts: Math.round(a.fm.ias * 1.944),
      dist: Math.round(a.position.distanceTo(p.position)), hp: Math.round(a.health), alive: a.alive && !a.dying,
    })),
    ground: `${b.ground.filter((x) => x.alive).length}/${b.ground.length}`,
    missiles: b.weapons.missiles.length,
    bullets: b.weapons.bullets.length,
    objectives: g.mission.objectiveLines().map((o) => `${o.text} ${o.progress}${o.done ? ' (done)' : ''}`),
    score: g.mission.score,
  };
};

const runs = [
  { key: '0', jet: 'f16', label: 'm1-rings' },
  { key: '1', jet: 'fa18', label: 'm2-drones' },
  { key: '2', jet: 'mig29', label: 'm3-canyon' },
  { key: '3', jet: 'typhoon', label: 'm4-strike' },
  { key: '4', jet: 'su35', label: 'm5-dogfight' },
  { key: '5', jet: 'f22', label: 'm6-ships' },
  { key: '6', jet: 'f16', label: 'm7-intercept' },
  { key: '8', jet: 'fa18', label: 'm9-landing' },
  { key: 'free', jet: 'f16', label: 'free-runway', free: { map: 'highlands', time: 'sunset', enemies: 'few', ground: true, rings: false, start: 'runway' } },
  { key: '10', jet: 'f15', label: 'm11-city-defence' },
  { key: '12', jet: 'a10', label: 'm13-urban-strike' },
  { key: '14', jet: 'a320', label: 'm15-airliner' },
  { key: '18', jet: 'an124', label: 'm19-an124-airlift' },
  { key: 'free', jet: 'concorde', label: 'free-night-metro', free: { map: 'metro', time: 'night', enemies: 'few', ground: false, rings: false, start: 'air', traffic: 'light' } },
];

for (const run of runs) {
  const errBefore = errors.length;
  const tl = Date.now();
  await page.evaluate(([key, jet, free]) => {
    const g = window.__game;
    if (key === 'free') g.startFree(free, jet);
    else g.startMission(window.__missions[Number(key)], jet);
  }, [run.key, run.jet, run.free || null]);
  try {
    await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 240000 });
  } catch (e) {
    errors.push(`${run.label}: never reached playing state`);
    continue;
  }
  console.log(`\n=== ${run.label} (${run.jet}) loaded in ${Date.now() - tl} ms`);
  const script = [
    ['down', 'KeyR'], ['wait', 1200], ['up', 'KeyR'],
    ['down', 'KeyS'], ['wait', 900], ['up', 'KeyS'],
    ['down', 'KeyD'], ['wait', 500], ['up', 'KeyD'],
    ['press', 'KeyT'], ['down', 'Space'], ['wait', 1500], ['up', 'Space'],
    ['press', 'KeyX'], ['press', 'KeyV'], ['press', 'KeyY'], ['press', 'KeyC'], ['wait', 1500], ['press', 'KeyC'], ['press', 'KeyC'],
    ['wait', 1500], ['press', 'KeyC'], ['press', 'KeyC'],
  ];
  if (run.free && run.free.start === 'runway') {
    script.unshift(['down', 'KeyR'], ['wait', 4000], ['down', 'KeyS'], ['wait', 5000], ['up', 'KeyS'], ['press', 'KeyG']);
  }
  let i = 0;
  for (const [op, arg] of script) {
    if (op === 'down') await page.keyboard.down(arg);
    else if (op === 'up') await page.keyboard.up(arg);
    else if (op === 'press') await page.keyboard.press(arg);
    else await page.waitForTimeout(arg);
    if (++i % 6 === 0) console.log(JSON.stringify(await page.evaluate(telemetry)));
  }
  await page.waitForTimeout(2500);
  const tel = await page.evaluate(telemetry);
  console.log(JSON.stringify(tel));
  await page.screenshot({ path: `${outDir}/${run.label}.png` });
  if (errors.length > errBefore) console.log(`!! ${errors.length - errBefore} error(s) during ${run.label}`);
}

// pause / resume / quit
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const paused = await page.evaluate(() => window.__game.state);
console.log('after Escape state =', paused);
await page.evaluate(() => window.__game.quitToMenu());
await page.waitForFunction(() => window.__game.state === 'menu', null, { timeout: 240000 });
console.log('returned to menu');

await browser.close();
if (errors.length) {
  console.log('\nERRORS:\n' + errors.slice(0, 40).join('\n'));
  process.exit(1);
}
console.log('\nSmoke test passed without runtime errors.');
