# Strike Horizon — Combat Flight Simulator

A browser combat flight simulator built with [three.js](https://threejs.org). Everything is
generated procedurally at runtime: terrain, sky, clouds, aircraft models, liveries, sound. The
game ships **no art or audio assets**, loads fast and runs anywhere WebGL 2 is available, from
phones to high-end desktops.

## Features

### Aircraft
Six flyable fighters, each with its own geometry, livery, flight characteristics and loadout:

| Aircraft | Role | Highlights |
|---|---|---|
| F-16C Viper | Multirole | Nimble 9 G jet, the starter aircraft |
| F/A-18E Super Hornet | Carrier strike | High-alpha handling, biggest missile load |
| MiG-29 Fulcrum | Frontline fighter | Brutal low-speed agility |
| Eurofighter Typhoon | Air superiority | Canard-delta, huge thrust-to-weight |
| Su-35 Flanker-E | Heavy fighter | Thrust vectoring, super-manoeuvrable |
| F-22A Raptor | Stealth air dominance | The final unlock |

The models are lofted fuselages with airfoil-section wings. Ailerons, stabilators, canards,
rudders and flaps move, and they carry canopies with pilots, pylons with missiles, retracting gear, nav
lights and afterburner flames with shock diamonds.

### Theatres (maps)
- **Pacific Atoll**: turquoise lagoons, beaches and a volcanic island
- **Red Canyon**: desert mesas cut by a deep river gorge
- **Alpine Peaks**: glaciers, knife-edge ridges and lakes
- **Frozen Fjords**: icy channels under a low polar sun
- **Green Highlands**: patchwork farmland, a river and the coast at sunset

Each theatre has an airbase with a textured runway, taxiways, hangars, tower and runway lights.
In free flight you can pick any time of day: dawn, morning, noon, afternoon or sunset.

### Campaign
Ten missions with stars, best scores and aircraft unlocks: training ring course, target drones,
a low-level canyon run, SAM-site strikes, dogfights, a naval strike against destroyers, a bomber
intercept, a duel with an ace, a landing challenge and a combined-arms finale. **Free flight**
lets you explore any map with optional enemies, ground targets and ring courses. Land on the
runway to rearm and repair.

### Simulation
- 6-DOF flight model with a fly-by-wire rate controller, G and AoA limiters, stalls,
  transonic wave drag, afterburner, thrust lapse, gear and air-brake drag, and ground handling.
  Takeoff, landing and braking all work.
- AI pilots fly the same flight model. They avoid terrain, beam and flare incoming missiles,
  break when you are on their six, use lead pursuit for guns and fire IR and radar missiles.
- Weapons: lead-computing gun with tracers, IR and radar missiles with proportional navigation
  and proximity fuses, flares that decoy missiles, SAM launchers, flak and ships that shoot back.
  Terrain masking is modelled: fly low or behind hills to break radar lock.

### Graphics that scale
- Physically based (Preetham) sky with aerial-perspective height fog that matches the horizon
- Quadtree LOD terrain streamed around the camera with a procedural splatting shader: beaches,
  grass, forests, farmland, layered canyon rock, snow and underwater depth tint
- Animated water with Fresnel reflections and sun glitter, billboard cumulus clouds with cloud
  fly-through, instanced forests
- PBR aircraft with image-based lighting, panel-line normal maps and shadows
- Particle explosions, smoke trails, wingtip vortices, contrails, bloom, ACES tone mapping
- **Low / Medium / High / Ultra** presets, GPU auto-detection, and dynamic resolution scaling
  that holds the frame rate on weak devices

### Controls
Keyboard and mouse, gamepad (standard mapping) and touch (virtual stick, throttle and
buttons on phones and tablets).

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Pitch / roll | W S A D or arrow keys | Left stick |
| Rudder | Q / E | Right stick |
| Throttle | Shift / R up, F down, 0–5, mouse wheel | RB / LB |
| Afterburner | Throttle above 90% | |
| Gun | Space | RT |
| Missile | Enter / X | A / LT |
| Flares | V / Z | B |
| Next target | T / Tab | X |
| Camera (chase, cockpit, padlock, cinematic, orbit) | C | Y |
| Padlock view | L | R3 |
| Look around | Right-drag / numpad | |
| Gear / brakes | G / B | Back / L3 |
| Pause | Esc / P | Start |

You can turn on **Mouse flight** (pointer-lock virtual stick) and **Invert pitch** in Settings.

## Running locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Tests

```bash
npm run test:physics          # flight-model performance table for every jet (Node only)
npm run build && npx vite preview --port 4173 &
npx playwright install chromium
npm run test:smoke -- http://localhost:4173/   # boots the game headless and flies missions
```

CI (`.github/workflows/ci.yml`) builds the game, runs both tests on every push, and uploads
screenshots of every mission as an artifact.

## Deploying

`.github/workflows/deploy.yml` publishes the production build to GitHub Pages on every push to
`main`. To turn it on, set **Settings → Pages → Source** to "GitHub Actions". The build uses
relative paths, so `dist/` can also be hosted on any static web server.

## Project layout

```
src/
  core/      Game loop, renderer & post-processing, quality presets, input, audio, saves
  world/     Noise, maps, terrain LOD, atmosphere/fog, sky, water, clouds, trees, airbase
  aircraft/  Jet catalogue, procedural geometry & liveries, flight model, aircraft entity, AI
  combat/    Guns, missiles, flares, ground & naval units
  fx/        Particles, ribbon trails, explosion presets
  game/      Battle runtime, missions, objectives, rings, camera rig, targeting
  ui/        HUD, menus, touch controls
scripts/     Physics and browser smoke tests
```
