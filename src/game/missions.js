// Campaign mission definitions. Each mission's setup() receives a context
// object (see Mission.js) used to spawn rings, enemies and objectives.
import * as THREE from 'three';
import { canyonPathZ, highlandRiverZ } from '../world/maps.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A flowing ring course that weaves between islands/terrain.
function tourCourse(ctx, start, heading, count, legLen, clearance, turn = 45) {
  const pts = [];
  let h = heading;
  let p = start.clone();
  for (let i = 0; i < count; i++) {
    h += (ctx.rand() - 0.5) * 2 * turn;
    const rad = THREE.MathUtils.degToRad(h);
    const nx = p.x + Math.sin(rad) * legLen;
    const nz = p.z - Math.cos(rad) * legLen;
    let maxH = ctx.map.waterLevel;
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      maxH = Math.max(maxH, ctx.map.heightAt(p.x + (nx - p.x) * t, p.z + (nz - p.z) * t));
    }
    const y = Math.max(maxH + clearance, ctx.map.waterLevel + 140);
    p = V(nx, y, nz);
    pts.push(p);
  }
  return pts;
}

export const MISSIONS = [
  {
    id: 'm1',
    name: 'First Flight',
    map: 'pacific',
    time: 'morning',
    difficulty: 1,
    type: 'Training',
    briefing:
      'Welcome to the squadron, rookie. Take your jet through the checkpoint course around the atoll. Get a feel for the throttle, the afterburner and how much energy you bleed in hard turns. Fly through every ring in order.',
    tips: ['W/S pitch, A/D roll, Q/E rudder', 'Shift/R and F (or mouse wheel) set the throttle', 'Throttle above 90% engages the afterburner'],
    stars: [1500, 2100],
    par: 240,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const start = V(ab.x - ab.dirX * 3000, ab.elevation + 650, ab.z - ab.dirZ * 3000);
      ctx.startAir(start, ab.heading, 210);
      const rings = tourCourse(ctx, start.clone().add(V(ab.dirX * 1600, 0, ab.dirZ * 1600)), ab.heading, 12, 2100, 240, 50);
      ctx.rings(rings, { radius: 55 });
    },
  },
  {
    id: 'm2',
    name: 'Target Practice',
    map: 'pacific',
    time: 'noon',
    difficulty: 1,
    type: 'Air-to-air',
    briefing:
      'Five target drones are orbiting north of the base. They will not shoot back. Use your gun (Space) and heat-seeking missiles (Enter/X): put the target in the HUD circle and wait for the lock tone before you fire.',
    tips: ['T cycles targets', 'Missiles need a solid lock tone', 'The gun pipper shows where to aim'],
    stars: [1200, 1700],
    par: 240,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const start = V(ab.x, ab.elevation + 1200, ab.z);
      ctx.startAir(start, 0, 230);
      const center = V(ab.x + 1500, 1500, ab.z - 9000);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const p = center.clone().add(V(Math.cos(a) * 2500, (i % 2) * 400, Math.sin(a) * 2500));
        ctx.enemyAir('mig29', p, (i * 72 + 90) % 360, { role: 'drone', skill: 0.1, patrolCenter: center, patrolRadius: 2500 + i * 300, patrolAlt: p.y, cruise: 0.6, aggressive: false, missiles: 0, gunAmmo: 0, healthScale: 0.7 });
      }
      ctx.objectiveDestroy('Destroy the target drones', (e) => e.kind === 'air');
    },
  },
  {
    id: 'm3',
    name: 'Canyon Run',
    map: 'canyon',
    time: 'afternoon',
    difficulty: 2,
    type: 'Low level',
    briefing:
      'Enemy radar covers the high desert. The only way through is down in the river gorge. Thread every checkpoint along the canyon before the clock runs out. Stay low, keep your speed under control and do not clip the walls.',
    tips: ['Use rudder (Q/E) for small heading corrections', 'Pull hard with the wings banked to carve turns', 'Throttle back before tight bends'],
    stars: [1800, 2500],
    par: 150,
    timeLimit: 240,
    setup(ctx) {
      const x0 = -14000;
      const pts = [];
      for (let i = 1; i <= 16; i++) {
        const x = x0 + i * 1300;
        const z = canyonPathZ(x);
        const floor = Math.max(ctx.map.heightAt(x, z), ctx.map.waterLevel);
        pts.push(V(x, floor + 70, z));
      }
      const sz = canyonPathZ(x0);
      const startY = Math.max(ctx.map.heightAt(x0, sz), ctx.map.waterLevel) + 90;
      const dz = canyonPathZ(x0 + 50) - sz;
      const heading = THREE.MathUtils.radToDeg(Math.atan2(50, -dz));
      ctx.startAir(V(x0, startY, sz), heading, 170, 0.75);
      ctx.rings(pts, { radius: 50 });
      ctx.ceiling(ctx.map.heightAt(x0, sz) + 520, 'RADAR DETECTION - GET BACK IN THE CANYON');
    },
  },
  {
    id: 'm4',
    name: 'Desert Viper',
    map: 'canyon',
    time: 'noon',
    difficulty: 2,
    type: 'Strike',
    briefing:
      'An armoured column is refuelling at a forward base guarded by two SAM sites. Take out the SAMs and their radar first, then destroy the vehicles. When the radar warning sounds, drop low behind terrain or pop flares (V) and break hard.',
    tips: ['SAMs cannot track you below ~50 m AGL or behind terrain', 'Flares (V) decoy incoming missiles', 'Line up gun runs with a shallow dive'],
    stars: [1800, 2600],
    par: 300,
    setup(ctx) {
      const ab = ctx.map.airbase;
      ctx.startAir(V(ab.x, ab.elevation + 1400, ab.z), 90, 230);
      const tx = ab.x + 11000, tz = ab.z - 3000;
      ctx.samSite(tx - 1500, tz + 1200);
      ctx.samSite(tx + 1800, tz - 1500);
      ctx.groundAt('radar', tx, tz, 0);
      ctx.convoy(tx + 300, tz + 400, 45, 6);
      ctx.groundAt('fuel', tx - 400, tz - 500, 0);
      ctx.objectiveDestroy('Destroy the forward base', (e) => e.kind === 'ground' && e.isTarget);
    },
  },
  {
    id: 'm5',
    name: 'Mountain Hunters',
    map: 'alps',
    time: 'afternoon',
    difficulty: 2,
    type: 'Dogfight',
    briefing:
      'Enemy fighters are probing the alpine border. Intercept and destroy them. They will fight back, so keep your energy up, watch your six and use flares when the missile warning sounds.',
    tips: ['Corner speed is around 350-450 knots', 'Use the padlock view (L) to keep eyes on a bandit', 'Do not chase into the mountains'],
    stars: [1600, 2400],
    par: 300,
    setup(ctx) {
      const ab = ctx.map.airbase;
      ctx.startAir(V(ab.x, ab.elevation + 2600, ab.z), 0, 240);
      const c = V(ab.x, ab.elevation + 3200, ab.z - 14000);
      ctx.enemyAir('mig29', c.clone().add(V(-500, 0, 0)), 180, { skill: 0.3 });
      ctx.enemyAir('mig29', c.clone().add(V(500, 100, 300)), 180, { skill: 0.3 });
      ctx.wave(() => {
        ctx.radio('Two more bandits inbound from the east!');
        const c2 = V(ab.x + 13000, ab.elevation + 3500, ab.z - 6000);
        ctx.enemyAir('mig29', c2, 270, { skill: 0.4 });
        ctx.enemyAir('mig29', c2.clone().add(V(300, 150, 300)), 270, { skill: 0.4 });
      });
      ctx.objectiveDestroy('Destroy all enemy fighters', (e) => e.kind === 'air');
    },
  },
  {
    id: 'm6',
    name: 'Fjord Strike',
    map: 'arctic',
    time: 'default',
    difficulty: 3,
    type: 'Anti-ship',
    briefing:
      'A naval task group is hiding in the fjords under a low polar sun. Three destroyers, each armed with SAMs and flak, escorted by fighters. Sink the ships. Approach low through the valleys to stay under their radar.',
    tips: ['Ships take several missile hits', 'Use the terrain to break their radar lock', 'Escorts will try to bounce you'],
    stars: [1800, 2800],
    par: 420,
    setup(ctx) {
      const ab = ctx.map.airbase;
      ctx.startAir(V(ab.x, ab.elevation + 1500, ab.z), 120, 230);
      const rand = ctx.rand;
      let placed = 0;
      for (let i = 0; i < 40 && placed < 3; i++) {
        const spot = ctx.map.findWaterSpot(ab.x + 9000 + (rand() - 0.5) * 9000, ab.z + 7000 + (rand() - 0.5) * 9000, 4000, rand, 30);
        if (spot) {
          ctx.groundAt('ship', spot.x, spot.z, rand() * Math.PI * 2, { speed: 4 });
          placed++;
        }
      }
      if (placed === 0) ctx.groundAt('ship', ab.x + 9000, ab.z + 7000, 0);
      const e = V(ab.x + 9000, 2500, ab.z + 7000);
      ctx.enemyAir('mig29', e, 300, { skill: 0.45, patrolCenter: e, patrolRadius: 3000 });
      ctx.enemyAir('mig29', e.clone().add(V(400, 200, 0)), 300, { skill: 0.45, patrolCenter: e, patrolRadius: 3500 });
      ctx.objectiveDestroy('Sink the destroyers', (u) => u.kind === 'ship');
    },
  },
  {
    id: 'm7',
    name: 'Highland Intercept',
    map: 'highlands',
    time: 'default',
    difficulty: 3,
    type: 'Intercept',
    briefing:
      'A strike package is heading for our airbase out of the setting sun. Four attack jets with an escort of two Typhoons. Destroy the strike aircraft before they reach the base. If even one gets through, the mission fails.',
    tips: ['Prioritise the strike jets (marked BOMBER)', 'Escorts will defend them', 'Radar missiles (long range) fire beyond 4 km'],
    stars: [1800, 2700],
    par: 300,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const base = V(ab.x, ab.elevation + 2200, ab.z);
      ctx.startAir(base.clone().add(V(-2000, 0, 0)), 270, 240);
      const from = V(ab.x - 26000, 3000, ab.z + 2000);
      const route = [V(ab.x - 12000, 2800, ab.z + 1000), V(ab.x, ab.elevation + 900, ab.z)];
      const bombers = [];
      for (let i = 0; i < 4; i++) {
        const p = from.clone().add(V((i % 2) * 220 - 110, (i >> 1) * 80, Math.floor(i / 2) * 250));
        bombers.push(ctx.enemyAir('fa18', p, 90, { role: 'bomber', skill: 0.3, aggressive: false, route: route.map((r) => r.clone().add(V(0, 0, (i - 1.5) * 200))), loop: false, cruise: 0.72, missiles: 0, label: 'BOMBER', massScale: 1.2 }));
      }
      ctx.enemyAir('typhoon', from.clone().add(V(-300, 600, -400)), 90, { skill: 0.5, role: 'escort', escortOf: bombers[0] });
      ctx.enemyAir('typhoon', from.clone().add(V(-300, 600, 600)), 90, { skill: 0.5, role: 'escort', escortOf: bombers[2] });
      ctx.objectiveDestroy('Destroy the strike aircraft', (e) => e.role === 'bomber');
      ctx.failIf(() => bombers.some((b) => b.alive && !b.dying && Math.hypot(b.position.x - ab.x, b.position.z - ab.z) < 1500), 'A strike jet reached the airbase');
    },
  },
  {
    id: 'm8',
    name: 'Ace Duel',
    map: 'alps',
    time: 'sunset',
    difficulty: 4,
    type: 'Dogfight',
    briefing:
      'Their best pilot has challenged our squadron to a duel over the glaciers at sunset. One Su-35, flown by an ace. He uses thrust vectoring, he will pop flares and he will not make mistakes. Neither should you.',
    tips: ['Fight in the vertical', 'Missiles are easier to defeat head-on: save them for his six', 'Guns are the surest kill'],
    stars: [1500, 2300],
    par: 240,
    setup(ctx) {
      const ab = ctx.map.airbase;
      ctx.startAir(V(ab.x, ab.elevation + 3200, ab.z), 0, 250);
      ctx.enemyAir('su35', V(ab.x, ab.elevation + 3300, ab.z - 12000), 180, { skill: 0.95, label: 'ACE' });
      ctx.objectiveDestroy('Shoot down the ace', (e) => e.kind === 'air');
    },
  },
  {
    id: 'm9',
    name: 'Homecoming',
    map: 'highlands',
    time: 'sunset',
    difficulty: 2,
    type: 'Landing',
    briefing:
      'Low on fuel after a long patrol. Bring her home: lower the gear (G), slow to about 150 knots, follow the approach path to the runway and touch down gently on the main wheels. Hold B to brake once you are down and come to a full stop.',
    tips: ['Aim for a 3° glide slope: ~300 m height per 6 km', 'Sink rate under 5 m/s at touchdown', 'Gear down adds drag - add throttle'],
    stars: [1200, 1700],
    par: 200,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const dist = 9000;
      const start = V(ab.x - ab.dirX * (dist + ab.length / 2), ab.elevation + 480, ab.z - ab.dirZ * (dist + ab.length / 2));
      ctx.startAir(start, ab.heading, 135, 0.5);
      const glide = [];
      for (let d = 6000; d >= 2000; d -= 2000) {
        glide.push(V(ab.x - ab.dirX * (d + ab.length / 2), ab.elevation + d * 0.052 + 15, ab.z - ab.dirZ * (d + ab.length / 2)));
      }
      ctx.rings(glide, { radius: 60, optional: true });
      ctx.objectiveLand('Land on the runway and stop');
    },
  },
  {
    id: 'm10',
    name: 'Operation Thunder',
    map: 'arctic',
    time: 'dawn',
    difficulty: 5,
    type: 'Campaign finale',
    briefing:
      'This is it. Knock out the enemy air-defence network - two SAM batteries, the early-warning radar and the fuel depot - then deal with their fighters as they scramble. Expect heavy resistance and veteran pilots.',
    tips: ['Kill the radar first to blind the SAMs', 'Conserve missiles for the fighters', 'Rearm by landing at the airbase if needed'],
    stars: [2500, 3800],
    par: 600,
    setup(ctx) {
      const ab = ctx.map.airbase;
      ctx.startAir(V(ab.x, ab.elevation + 1600, ab.z), 90, 240);
      const tx = ab.x + 12000, tz = ab.z + 2000;
      ctx.samSite(tx - 2000, tz - 1000);
      ctx.samSite(tx + 1500, tz + 1800);
      ctx.groundAt('radar', tx, tz, 0);
      ctx.groundAt('fuel', tx + 700, tz - 600, 0);
      ctx.objectiveDestroy('Destroy the air-defence network', (e) => e.kind === 'ground' && e.isTarget);
      let wave = 0;
      ctx.wave(() => {
        wave++;
        ctx.radio('Enemy fighters scrambling!');
        const p = V(tx + 6000, 3000, tz - 4000);
        ctx.enemyAir('su35', p, 270, { skill: 0.6, engaged: true });
        ctx.enemyAir('mig29', p.clone().add(V(400, 200, 300)), 270, { skill: 0.55, engaged: true });
      }, { afterKills: 3 });
      ctx.wave(() => {
        wave++;
        ctx.radio('More bandits! Two Flankers from the north!');
        const p = V(ab.x + 4000, 3500, ab.z - 14000);
        ctx.enemyAir('su35', p, 180, { skill: 0.75, engaged: true });
        ctx.enemyAir('su35', p.clone().add(V(500, 0, 0)), 180, { skill: 0.7, engaged: true });
      }, { afterKills: 7 });
      ctx.objectiveDestroy('Win air superiority', (e) => e.kind === 'air', { minCount: 4 });
      void wave;
    },
  },
  {
    id: 'm11',
    name: 'Skyline Shield',
    map: 'metro',
    time: 'afternoon',
    difficulty: 3,
    type: 'City defence',
    briefing:
      'A strike package is coming over the northern mountains to hit downtown Metro Bay. Four heavy bombers with a fighter escort. The skies are full of airliners, so check your targets: shoot only what the radar marks hostile. If a single bomber reaches the city centre, the mission fails.',
    tips: ['Bombers are marked BOMBER: they are the priority', 'White circles are civil airliners: never fire at them', 'Press Y to lock the bandit you are looking at'],
    stars: [2000, 2900],
    par: 330,
    areaRadius: 34000,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const city = ctx.map.def.city;
      const down = V(city.districts[0].x, 0, city.districts[0].z);
      ctx.startAir(V(ab.x - 4000, 2400, ab.z - 5000), 300, 240);
      ctx.traffic(5, { center: V(city.x, 0, city.z), radius: 15000, altMin: 2500, altMax: 9000 });
      const from = V(-2500, 3300, -26000);
      const route = [V(-1200, 2800, -12000), V(down.x, 1100, down.z)];
      const bombers = [];
      for (let i = 0; i < 4; i++) {
        const p = from.clone().add(V((i % 2) * 260 - 130, (i >> 1) * 90, Math.floor(i / 2) * 300));
        bombers.push(ctx.enemyAir('su35', p, 180, { role: 'bomber', skill: 0.3, aggressive: false, route: route.map((r) => r.clone().add(V((i - 1.5) * 220, 0, 0))), loop: false, cruise: 0.7, missiles: 0, label: 'BOMBER', massScale: 1.3, healthScale: 1.2 }));
      }
      ctx.enemyAir('mig29', from.clone().add(V(-500, 700, -300)), 180, { skill: 0.55, role: 'escort', escortOf: bombers[0] });
      ctx.enemyAir('mig29', from.clone().add(V(500, 700, -300)), 180, { skill: 0.55, role: 'escort', escortOf: bombers[1] });
      ctx.wave(() => {
        ctx.radio('Two Typhoons inbound from the east, they want those bombers through!');
        const p = V(18000, 3500, -6000);
        ctx.enemyAir('typhoon', p, 270, { skill: 0.6, engaged: true });
        ctx.enemyAir('typhoon', p.clone().add(V(400, 150, 300)), 270, { skill: 0.6, engaged: true });
      }, { afterKills: 3 });
      ctx.objectiveDestroy('Destroy the strike bombers', (e) => e.role === 'bomber');
      ctx.objectiveDestroy('Clear the escorts', (e) => e.kind === 'air' && e.team === 'enemy' && e.role !== 'bomber');
      ctx.failIf(() => bombers.some((b) => b.alive && !b.dying && Math.hypot(b.position.x - down.x, b.position.z - down.z) < 1800), 'A bomber reached downtown');
    },
  },
  {
    id: 'm12',
    name: 'Heavy Escort',
    map: 'metro',
    time: 'morning',
    difficulty: 3,
    type: 'Escort',
    briefing:
      'HEAVY 1, a Boeing 777 carrying the evacuated embassy staff, is inbound over the bay to Metro Bay International. Enemy interceptors will try to shoot it down before it lands. Stay with the airliner, kill every interceptor and see it safely onto final approach. If HEAVY 1 goes down, the mission fails.',
    tips: ['The interceptors go for the airliner, not you: cut them off', 'Radar missiles reach targets beyond 4 km', 'Keep HEAVY 1 inside your radar circle'],
    stars: [2200, 3200],
    par: 300,
    areaRadius: 34000,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const L = ab.length / 2;
      // final approach over the bay, landing on the reciprocal heading
      const app = (d, h, speed) => Object.assign(V(ab.x + ab.dirX * (d + L), ab.elevation + h, ab.z + ab.dirZ * (d + L)), { speed });
      const start = V(1500, 3400, 21000);
      const heavy = ctx.friendlyAir('b777', start, 10, {
        role: 'civil', label: 'HEAVY 1', speed: 215, priority: 0.3,
        route: [Object.assign(V(5500, 3000, 12000), { speed: 210 }), app(13000, 1200, 160), app(6000, 340, 125), app(2500, 150, 105)],
      });
      ctx.startAir(start.clone().add(V(350, 250, 500)), 10, 225);
      ctx.radio('HEAVY 1: escort, good to see you. We are counting on you.');
      ctx.wave(() => {
        ctx.radio('Bandits west, two MiGs heading for HEAVY 1!');
        const p = V(-16000, 3000, 14000);
        ctx.enemyAir('mig29', p, 90, { skill: 0.5, engaged: true });
        ctx.enemyAir('mig29', p.clone().add(V(300, 200, 400)), 90, { skill: 0.5, engaged: true });
      }, { delay: 6 });
      ctx.wave(() => {
        ctx.radio('Two Flankers low from the south-west!');
        const p = V(-12000, 1500, 26000);
        ctx.enemyAir('su35', p, 45, { skill: 0.6, engaged: true });
        ctx.enemyAir('su35', p.clone().add(V(400, 100, 300)), 45, { skill: 0.6, engaged: true });
      }, { afterKills: 2 });
      ctx.wave(() => {
        ctx.radio('Last pair, stealth fighters! Protect the heavy!');
        const p = V(16000, 4000, 16000);
        ctx.enemyAir('j20', p, 300, { skill: 0.65, engaged: true });
        ctx.enemyAir('j20', p.clone().add(V(400, 200, 300)), 300, { skill: 0.65, engaged: true });
      }, { afterKills: 4 });
      ctx.objectiveEscort('Get HEAVY 1 to final approach', heavy, (ac) => Math.hypot(ac.position.x - ab.x, ac.position.z - ab.z) < L + 5500 && ac.position.y < ab.elevation + 700);
      ctx.objectiveDestroy('Destroy all interceptors', (e) => e.kind === 'air' && e.team === 'enemy', { minCount: 6 });
    },
  },
  {
    id: 'm13',
    name: 'Urban Strike',
    map: 'desert',
    time: 'dusk',
    difficulty: 4,
    type: 'City strike',
    briefing:
      'Insurgent air defences have been set up inside Desert Metropolis: SAM launchers on the rooftops, flak in the parks and a radar directing them. Fly the street canyons below the rooftops to stay hidden, pop up for the shot and get back down. Two fighters patrol overhead.',
    tips: ['Below roof height the SAM radars cannot see you', 'Rooftop SAMs sit on the tallest blocks downtown', 'Watch the supertall tower: 828 metres of glass'],
    stars: [2400, 3400],
    par: 420,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const city = ctx.map.def.city;
      const d0 = city.districts[0], d1 = city.districts[1];
      ctx.startAir(V(ab.x - 1500, 900, ab.z + 1000), 280, 230);
      ctx.cityTarget('sam', d0.x + 600, d0.z + 400, 'roof', { minH: 40, maxH: 160 });
      ctx.cityTarget('sam', d0.x - 700, d0.z - 500, 'roof', { minH: 40, maxH: 160 });
      ctx.cityTarget('sam', d1.x, d1.z, 'park', { radius: 1600 });
      ctx.cityTarget('radar', d0.x, d0.z, 'park', { radius: 1800 });
      for (let i = 0; i < 4; i++) ctx.cityTarget('aaa', d0.x + (i - 1.5) * 900, d0.z + (i % 2 ? 900 : -900), 'park', { radius: 1200 });
      ctx.cityTarget('aaa', d1.x + 500, d1.z - 600, 'park', { radius: 1200 });
      const c = V(d0.x, 1800, d0.z);
      ctx.enemyAir('mig29', c.clone().add(V(-2000, 0, 0)), 0, { skill: 0.5, patrolCenter: c, patrolRadius: 3000 });
      ctx.enemyAir('mig29', c.clone().add(V(2000, 200, 0)), 180, { skill: 0.5, patrolCenter: c, patrolRadius: 3200 });
      ctx.traffic(3, { center: V(city.x, 0, city.z), radius: 18000, altMin: 4000, altMax: 10000 });
      ctx.objectiveDestroy('Destroy the city air defences', (e) => e.kind === 'ground' && e.isTarget);
      ctx.objectiveDestroy('Shoot down the patrol', (e) => e.kind === 'air' && e.team === 'enemy');
    },
  },
  {
    id: 'm14',
    name: 'Sonic Run',
    map: 'desert',
    time: 'noon',
    difficulty: 3,
    type: 'Speed trial',
    briefing:
      'A test-pilot trial: a ten-gate course low over the Gulf, and every gate only counts if you pass it above Mach 1. Stay below 400 metres or the trial is void. Break the sound barrier, keep the afterburner lit and enjoy the spray.',
    tips: ['Use full afterburner (throttle above 90%) the whole way', 'Gentle corrections only: every turn bleeds speed', 'Fast jets with big engines (F-15, F-22, MiG-21) shine here'],
    stars: [1700, 2300],
    par: 110,
    timeLimit: 150,
    setup(ctx) {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const z = -13000 + i * 2900;
        pts.push(V(-12500 + Math.sin(i * 0.9) * 700, 120 + (i % 3) * 25, z));
      }
      ctx.startAir(V(-12500, 150, -19500), 0, 340, 1);
      ctx.rings(pts, { radius: 70, minMach: 1.0 });
      ctx.objectiveBoom('Break the sound barrier', 1);
      ctx.ceiling(400, 'TOO HIGH - STAY LOW OVER THE WATER');
    },
  },
  {
    id: 'm15',
    name: 'Final Approach',
    map: 'metro',
    time: 'dusk',
    difficulty: 3,
    type: 'Airline',
    aircraft: 'civil',
    briefing:
      'Trade the fighter for an airliner. You are on a long final into Metro Bay International at dusk with the city lights coming on. Gear down (it also lowers the flaps), keep about 140 knots, follow the glide-slope gates and put her down gently on the main wheels, then brake to a full stop.',
    tips: ['Gear down early: flaps come with it', 'Airliners respond slowly: small, early corrections', 'A 3-degree slope is about 50 m of height per kilometre'],
    stars: [1300, 1900],
    par: 260,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const L = ab.length / 2;
      // long final over the bay onto the reciprocal runway heading
      const at = (d, h) => V(ab.x + ab.dirX * (d + L), ab.elevation + h, ab.z + ab.dirZ * (d + L));
      ctx.startAir(at(15000, 820), (ab.heading + 180) % 360, 135, 0.45);
      const glide = [];
      for (const d of [10000, 7000, 4500, 2500]) glide.push(at(d, d * 0.052 + 18));
      ctx.rings(glide, { radius: 75, optional: true });
      ctx.traffic(4, { center: V(ab.x, 0, ab.z), radius: 14000, altMin: 3000, altMax: 9000 });
      ctx.objectiveLand('Land on the runway and stop');
    },
  },
  {
    id: 'm16',
    name: 'Night Hammer',
    map: 'desert',
    time: 'night',
    difficulty: 5,
    type: 'Night strike - HARD',
    briefing:
      'Under a new moon, take down the integrated air-defence system around Desert Metropolis: SAM batteries on the rooftops and in the desert, radar stations, flak and a fuel depot. Two Su-57s guard the city and more will scramble. This one is hard. Use the darkness, the terrain and the towers.',
    tips: ['Kill the radars first: blind SAMs are easy prey', 'The targeting pod (top-right window) finds ground targets in the dark', 'Expect veteran pilots and very little room for error'],
    stars: [3200, 4600],
    par: 600,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const city = ctx.map.def.city;
      const d0 = city.districts[0], d2 = city.districts[2];
      ctx.startAir(V(ab.x + 1500, 1100, ab.z), 270, 235);
      ctx.cityTarget('sam', d0.x + 500, d0.z - 300, 'roof', { minH: 40, maxH: 170 });
      ctx.cityTarget('sam', d0.x - 600, d0.z + 600, 'roof', { minH: 40, maxH: 170 });
      ctx.cityTarget('radar', d0.x, d0.z, 'park', { radius: 1800 });
      ctx.cityTarget('radar', d2.x, d2.z, 'park', { radius: 1500 });
      for (let i = 0; i < 3; i++) ctx.cityTarget('aaa', d0.x + (i - 1) * 1100, d0.z + 800 * (i % 2 ? 1 : -1), 'park', { radius: 1200 });
      ctx.samSite(7200, 4200);
      ctx.samSite(7600, -5200);
      ctx.groundAt('fuel', 8000, 600, 0);
      const c = V(d0.x, 2600, d0.z);
      ctx.enemyAir('su57', c.clone().add(V(-1500, 0, 1500)), 90, { skill: 0.85, patrolCenter: c, patrolRadius: 3500, label: 'FELON' });
      ctx.enemyAir('su57', c.clone().add(V(1500, 200, -1500)), 270, { skill: 0.85, patrolCenter: c, patrolRadius: 3800, label: 'FELON' });
      ctx.wave(() => {
        ctx.radio('Two J-20s scrambling from the north, they are good!');
        const p = V(-2000, 4000, 18000);
        ctx.enemyAir('j20', p, 180, { skill: 0.9, engaged: true, label: 'DRAGON' });
        ctx.enemyAir('j20', p.clone().add(V(500, 0, 300)), 180, { skill: 0.9, engaged: true, label: 'DRAGON' });
      }, { afterKills: 4 });
      ctx.objectiveDestroy('Destroy the air-defence system', (e) => e.kind === 'ground' && e.isTarget);
      ctx.objectiveDestroy('Win air superiority', (e) => e.kind === 'air' && e.team === 'enemy', { minCount: 4 });
    },
  },
  {
    id: 'm17',
    name: "Dragon's Teeth",
    map: 'metro',
    time: 'night',
    difficulty: 5,
    type: 'City defence - HARD',
    briefing:
      'The big one. Three waves of stealth fighters and bombers will hit Metro Bay tonight. If any bomber reaches downtown we lose the city. Civil flights are still airborne and the rules of engagement are strict: shoot down an airliner and you will be relieved of command.',
    tips: ['Bombers first, then the fighters', 'Hostiles are red, airliners are white circles: check before you fire', 'Rearm by landing at the airport if you run dry'],
    stars: [3500, 5000],
    par: 600,
    noCivilianLosses: true,
    areaRadius: 34000,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const city = ctx.map.def.city;
      const down = V(city.districts[0].x, 0, city.districts[0].z);
      ctx.startAir(V(ab.x - 6000, 2800, ab.z - 6000), 300, 245);
      ctx.traffic(3, { center: V(city.x, 0, city.z), radius: 16000, altMin: 3500, altMax: 9500 });
      const bombers = [];
      const raid = (from, heading, n, skill) => {
        const route = [V((from.x + down.x) / 2, 2400, (from.z + down.z) / 2), V(down.x, 1000, down.z)];
        for (let i = 0; i < n; i++) {
          bombers.push(ctx.enemyAir('su35', from.clone().add(V(i * 300 - 150, i * 80, i * 250)), heading, { role: 'bomber', skill, aggressive: false, route: route.map((r) => r.clone().add(V(i * 200, 0, 0))), loop: false, cruise: 0.72, missiles: 0, label: 'BOMBER', massScale: 1.3, healthScale: 1.3 }));
        }
      };
      raid(V(-1000, 3400, -27000), 180, 2, 0.4);
      ctx.enemyAir('j20', V(-1500, 4200, -25000), 180, { skill: 0.85, engaged: true, label: 'DRAGON' });
      ctx.enemyAir('j20', V(-500, 4200, -25000), 180, { skill: 0.85, engaged: true, label: 'DRAGON' });
      ctx.wave(() => {
        ctx.radio('Second wave! Two Felons from the west!');
        const p = V(-26000, 3600, 2000);
        ctx.enemyAir('su57', p, 90, { skill: 0.9, engaged: true, label: 'FELON' });
        ctx.enemyAir('su57', p.clone().add(V(300, 200, 400)), 90, { skill: 0.9, engaged: true, label: 'FELON' });
      }, { afterKills: 3 });
      ctx.wave(() => {
        ctx.radio('Final wave from the east: bombers with an ace escort!');
        raid(V(26000, 3200, 1000), 270, 2, 0.45);
        const p = V(25000, 4200, 0);
        for (let i = 0; i < 3; i++) ctx.enemyAir('su35', p.clone().add(V(i * 300, i * 120, i * 400 - 400)), 270, { skill: 0.95, engaged: true, label: 'ACE' });
      }, { afterKills: 6 });
      ctx.objectiveDestroy('Destroy every raider', (e) => e.kind === 'air' && e.team === 'enemy', { minCount: 11 });
      ctx.failIf(() => bombers.some((b) => b.alive && !b.dying && Math.hypot(b.position.x - down.x, b.position.z - down.z) < 1800), 'A bomber reached downtown');
    },
  },
  {
    id: 'm18',
    name: 'Ace Gauntlet',
    map: 'alps',
    time: 'dusk',
    difficulty: 5,
    type: 'Dogfight - HARD',
    briefing:
      'Three of the best pilots alive, one after another, over the glaciers at last light: an F-22, an Su-57 and finally a pair of Typhoons. You get only four missiles for the whole gauntlet. Make every shot count and win the knife fights with the gun.',
    tips: ['Only 4 missiles: save them for clean rear-aspect shots', 'Thrust-vectoring jets can point their nose at you at low speed: keep your energy', 'Use the mountains to break locks'],
    stars: [2600, 3800],
    par: 480,
    setup(ctx) {
      const ab = ctx.map.airbase;
      ctx.startAir(V(ab.x, ab.elevation + 3400, ab.z), 0, 250);
      ctx.loadout({ missiles: 4 });
      ctx.enemyAir('f22', V(ab.x, ab.elevation + 3500, ab.z - 13000), 180, { skill: 1.0, label: 'RAPTOR ACE' });
      ctx.wave(() => {
        ctx.radio('Raptor down! Next contender: Su-57, north-east.');
        ctx.enemyAir('su57', V(ab.x + 9000, ab.elevation + 3800, ab.z - 9000), 225, { skill: 1.0, label: 'FELON ACE', engaged: true });
      });
      ctx.wave(() => {
        ctx.radio('Final round: two Typhoons from the south!');
        ctx.enemyAir('typhoon', V(ab.x - 500, ab.elevation + 3600, ab.z + 12000), 0, { skill: 0.97, label: 'TYPHOON ACE', engaged: true });
        ctx.enemyAir('typhoon', V(ab.x + 500, ab.elevation + 3700, ab.z + 12400), 0, { skill: 0.95, label: 'TYPHOON ACE', engaged: true });
      });
      ctx.objectiveDestroy('Defeat every ace', (e) => e.kind === 'air' && e.team === 'enemy', { minCount: 4 });
    },
  },
  {
    id: 'm19',
    name: 'Operation Atlas',
    map: 'desert',
    time: 'sunset',
    difficulty: 4,
    type: 'Special operation: heavy airlift',
    aircraft: 'cargo',
    forceJet: 'an124',
    requires: ['m12', 'm15', 'm17'],
    requiresText: 'Complete Heavy Escort, Final Approach and Dragon\'s Teeth',
    briefing:
      'Special operation for veteran crews only. Fly the Antonov An-124 Ruslan at 395 tonnes, with 150 tonnes of relief cargo in the hold. The take-off run uses most of the 3 km runway: full thrust, gear down for flaps, rotate at about 150 knots and wait for her to fly. Then follow the delivery corridor around the coast and bring her back to land and stop.',
    tips: ['Full thrust and patience: lift-off comes at roughly 170 knots after 2.4 km', 'Gear up after take-off to clean up, gear down again for the approach', 'Bank gently: 400 tonnes do not turn quickly'],
    stars: [2000, 2800],
    par: 720,
    areaRadius: 30000,
    setup(ctx) {
      const ab = ctx.map.airbase;
      const L = ab.length / 2;
      ctx.startRunway();
      const at = (d, h) => V(ab.x - ab.dirX * (d + L), ab.elevation + h, ab.z - ab.dirZ * (d + L));
      const ahead = (d, h) => V(ab.x + ab.dirX * (L + d), ab.elevation + h, ab.z + ab.dirZ * (L + d));
      const pts = [
        ahead(9000, 650), V(15500, 1300, 6500), V(8000, 1500, 10500), V(1000, 1600, 8500),
        V(-5800, 1300, 2600), V(-6200, 1400, -5000), V(-5800, 1100, -12500),
        at(12000, 12000 * 0.052 + 20), at(7000, 7000 * 0.052 + 20), at(3500, 3500 * 0.052 + 20),
      ];
      ctx.rings(pts, { radius: 130 });
      ctx.objectiveLand('Land back at the airport and stop');
      ctx.traffic(3, { center: V(ab.x, 0, ab.z), radius: 18000, altMin: 4000, altMax: 10000 });
    },
  },
];

export const RIVER = { highlandRiverZ };
