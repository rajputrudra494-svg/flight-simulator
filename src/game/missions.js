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
];

export const RIVER = { highlandRiverZ };
