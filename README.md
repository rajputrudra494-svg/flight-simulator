# Strike Horizon — Combat Flight Simulator

A browser combat flight simulator built with [three.js](https://threejs.org). Everything is
generated procedurally at runtime: terrain, cities, sky, clouds, aircraft models, liveries,
cockpits and sound. The game ships **no art or audio assets**, loads fast and runs anywhere
WebGL 2 is available, from phones to high-end desktops.

## Features

### Aircraft (24)
Every aircraft has its own geometry, livery, flight model and loadout, built from real-world
dimensions, wing areas, weights and engine thrust.

**Military jets (17)**

| Aircraft | Role | Highlights |
|---|---|---|
| F-16C Viper | Multirole | Nimble 9 G jet, the starter aircraft |
| HAL Tejas | Light combat aircraft | Tailless compound delta, superb roll rate |
| MiG-21 Fishbed | Cold War interceptor | Shock-cone nose intake, natural-metal finish |
| A-10C Thunderbolt II | Close air support | Podded turbofans, armoured, 30 mm GAU-8 |
| JAS 39 Gripen | Light multirole | Close-coupled canards, fastest roll in the hangar |
| F/A-18E Super Hornet | Carrier strike | High-alpha handling, biggest missile load |
| Mirage 2000 | Interceptor | Pure delta, fast climb |
| MiG-29 Fulcrum | Frontline fighter | Brutal low-speed agility |
| Dassault Rafale | Omnirole | Canard delta, 30 mm cannon |
| F-15C Eagle | Air superiority | Mach 2.5, eight missiles |
| Eurofighter Typhoon | Air superiority | Canard-delta, huge thrust-to-weight |
| F-14 Tomcat | Fleet interceptor | **Variable-sweep wings** that fold back with Mach |
| Su-35 Flanker-E | Heavy fighter | Thrust vectoring, super-manoeuvrable |
| F-35A Lightning II | Stealth multirole | Internal weapons bays |
| J-20 Mighty Dragon | Stealth interceptor | Long canard delta, internal bays |
| Su-57 Felon | Stealth super-manoeuvrable | 3D thrust vectoring, LEVCONs |
| F-22A Raptor | Stealth air dominance | The final unlock |

**Airliners & cargo (7)** — Airbus A320neo, Boeing 737 MAX 8, Boeing 777-300ER, Boeing 747-8
(upper-deck hump), Airbus A380 (two window decks), Concorde (droop nose, reheat, Mach 2) and the
**Antonov An-124 Ruslan**.

Airliners have turbofan pods on pylons, winglets/sharklets, multi-axle bogie gear, glossy
clear-coated liveries with painted cabin windows, doors, cheatlines and tail logos (fictional
airlines), and flaps that come down with the gear.

**Antonov An-124 Ruslan** — 69.1 m long, 73.3 m span, 21 m tall, 628 m² anhedral high wing, four
Progress D-18T turbofans of 229.5 kN, 24-wheel gear in fuselage sponsons, flown at 395 t with a full
hold. High-bypass turbofans lose thrust as speed builds, so the take-off run takes about 50 s and
2.4 km of runway and lift-off comes at roughly 170 kt. It is an exclusive aircraft: it stays
locked (even with *Unlock all*) until you complete **Heavy Escort**, **Final Approach** and
**Dragon's Teeth**, which also opens its own special operation, **Operation Atlas**.

### Cockpits
Press **C** for the cockpit view. Every aircraft has its own cockpit layout, lit like a real one:
sunlight only gets in through the windows (it moves across the panels as you turn), the panel
legends and gauge markings glow with the integral lighting as the light fades, and a dim flood
light fills the cockpit after dark.

- **Fighters**: the type's own instrument panel: multi-function displays (radar scope, stores,
  situation and engine pages) with the **targeting-pod video**, the F-35's and J-20's panoramic
  screen, or analogue instruments around a radar scope on the older jets (MiG-21, MiG-29, F-14,
  F-15, Mirage), plus the glare-shield coaming, HUD combiner, windscreen bow and mirrors on framed
  canopies, tinted canopy glass, side consoles, a moving stick (side-stick on the F-16, F-22, F-35
  and Rafale) and throttle.
- **Airliners**: a flight deck with each type's real window layout and frames, V-shaped glare shield
  with the autopilot panel, live PFD, ND, engine and system displays (plus the A380's onboard
  information screens), Concorde's and the An-124's analogue instruments, a backlit overhead panel,
  the centre pedestal with CDUs and moving thrust levers, yokes, ram's-horn or side-sticks and the
  first officer's seat. Airliners are flown off the PFD, so the green head-up symbology is hidden
  in their cockpit view.

### Theatres (maps)
- **Pacific Atoll**, **Red Canyon**, **Alpine Peaks**, **Frozen Fjords**, **Green Highlands**
- **Metro Bay** (city): a megacity on a river estuary with a skyscraper downtown, an observation
  needle, twin towers, a red suspension bridge you can fly under, a stadium, a container port with
  cranes, parks and an international airport linked by highway
- **Desert Metropolis** (city): a supertall 828 m tower, gulf-style glass and stone towers, a
  palm-shaped island offshore and dunes inland, at dusk by default

Cities are tens of thousands of instanced buildings with a procedural facade shader (glass
curtain walls, ribbon windows, punched windows), streets with lane markings, parks and docks.
Buildings are solid: aircraft, bullets, missiles and the camera all collide with them, and SAMs can
sit on rooftops. Free flight offers dawn to sunset plus **dusk** and **night**: windows, street
lights, moving car lights, bridge and aviation obstruction lights come on, and night is lit by the
moon under a starry sky.

### Campaign
Nineteen missions with stars, best scores and aircraft unlocks: training, target drones, a canyon
run, SAM strikes, dogfights, anti-ship strikes, intercepts, a landing, then the city campaign:

| # | Mission | Notes |
|---|---|---|
| 11 | Skyline Shield | Stop a bomber raid on Metro Bay among civil traffic |
| 12 | Heavy Escort | Protect a 777 to final approach against three waves |
| 13 | Urban Strike | Rooftop SAMs and park flak in Desert Metropolis at dusk |
| 14 | Sonic Run | Gates only count above Mach 1, below 400 m over the sea |
| 15 | Final Approach | Fly an airliner onto the runway at dusk |
| 16 | Night Hammer | **HARD** night strike against an integrated air defence system |
| 17 | Dragon's Teeth | **HARD** three waves of stealth fighters and bombers; strict rules of engagement |
| 18 | Ace Gauntlet | **HARD** four aces back to back with only four missiles |
| 19 | Operation Atlas | **Special operation**: An-124 heavy airlift; locked until 12, 15 and 17 are done |

Civil airliners fly as background traffic; shooting one (or a friendly) costs 1500 points and in
some missions ends it. **Free flight** lets you explore any map with optional enemies, ground
targets, ring courses and air traffic. Land on the runway to rearm and repair.

### Combat and targeting
- **Lock-on assist** (Settings, on by default): the radar picks the target nearest your nose,
  switches to a bandit you point at, the seeker locks faster through a wider cone and holds the lock
  through a wide gimbal. **Y** (or middle mouse) designates whatever is in the centre of your view,
  including in padlock or free-look.
- Military HUD: corner-bracket target designator that closes in while locking, *LOCKING %*, *LOCK*
  and *SHOOT* cues, target data block (type, range, altitude, speed, aspect, closure), RWR threat
  scope, bank-angle scale, master-arm/weapon block, sweeping radar.
- **Targeting pod**: a zoomed, stabilised TV picture of your target in a window (and on the cockpit
  centre display).
- **Weapon camera** (**K**): ride along behind your missile to impact.
- Ground vehicles drive looping routes, ships zig-zag and drones keep changing course.

### Simulation
- 6-DOF flight model with a fly-by-wire rate controller, G and AoA limiters, stalls, transonic wave
  drag (much steeper for subsonic airliners), afterburner, density thrust lapse, ram effect for
  turbojets and speed lapse for turbofans, flaps, gear and air-brake drag, and ground handling.
- **Sonic boom system**: a transonic vapour cone forms around the airframe near Mach 1; breaking
  the barrier sheds a condensation collar and a shock ring, the HUD calls *MACH 1*, and the boom (a
  double N-wave crack and rumble) is heard when the Mach cone sweeps over the camera. Outside the
  jet the engine noise is left behind at supersonic speed, and a low supersonic pass over water
  throws up a rooster tail of spray. High-G pulls pull vapour over the wings.
- AI pilots fly the same flight model; airliners use a bank-limited autopilot.
- Weapons: lead-computing gun with tracers, IR and radar missiles with proportional navigation and
  proximity fuses, flares, SAMs, flak and ships. Terrain and buildings mask radar.

### ATC, AWACS and crew radio
A situational radio that reacts to what you are doing, with real phraseology (runways, headings and
frequencies read digit by digit, "niner", flight levels, altimeter or QNH) and a different voice
per speaker. Speech uses the browser's speech synthesis; every call also appears in the radio
transcript on the HUD with the station tag and frequency.
- **Tower, Ground, Approach and Departure** per airfield (Atoll, Red Rock, Alpine, Fjord,
  Highland, Metro Bay International, Desert City International) with a consistent wind and QNH:
  take-off clearance with braking-action reports on wet or snowy runways, departure or AWACS
  hand-off, approach check-in, vectors onto the ILS, hand-off to the tower, landing clearance,
  glide-path *low altitude alert*, *check wheels down*, *go around*, vacate and taxi instructions,
  and crash calls. Your own read-backs are spoken too.
- **AWACS "Overlord"**: check-in picture with BRAA (bearing, range, altitude, hot/cold/flanking/
  beaming), new-group calls, splash and good-effects confirmations, cease-fire calls, nearest-field
  steers when you are hit, leaving-the-area and radar-detection warnings, and the mission story lines.
- **Crew and aircraft voices** in airliners: *Thrust set, eighty knots, V1, rotate, positive rate*,
  radio-altimeter callouts down to *retard* on Airbus types, *Spoilers, reverse green, decel,
  seventy knots*, GPWS (*sink rate, bank angle, too low gear*) and **TCAS** (*traffic, climb/descend,
  clear of conflict*). Missile launch warnings call the clock position.
- Traffic advisories for nearby airliners and background chatter between the controllers and the
  AI traffic (or other AWACS flights in combat) when the frequency is quiet.
- **M** opens the ATC menu of transmissions that fit the moment (pick with 1-6): take-off clearance,
  the ATIS, a radio check, a picture or bogey dope, the nearest target, ILS vectors, RTB, MAYDAY and
  *say again*; the COM1 head on the HUD shows active and standby frequencies, TX/RX and signal strength.
- Settings: ATC level (full, essential clearances, mission calls only) and radio static on/off.

### Brakes and the landing roll
- Wheel brakes with **anti-skid** (pressure is modulated just below the skid point), brake **heat**
  and **fade**, cooling on the ground and in the air, and hot-brake smoke.
- **Autobrake** on airliners (U): LO, MED, MAX and RTO. It activates after main-gear touchdown with
  the thrust at idle, holds a target deceleration, disarms on pedal braking or throttle, fires max
  braking on a rejected take-off above 85 knots and holds the aircraft once stopped.
- **Ground spoilers** that dump the lift at touchdown and double as speedbrakes in flight,
  **thrust reversers** with a weight-on-wheels interlock and animated sleeves (J), and **drag
  chutes** on the MiG-21, Tejas, Mirage 2000, MiG-29, Typhoon, Su-35, Su-57 and J-20 (J: deploy,
  J again to jettison; deployed too fast it tears off).
- Runway surface per map (dry, wet in the Alps and the Highlands, snow on the fjords) and slippery
  grass; the nose settles onto the nose wheel by itself after touchdown.
- Tyre smoke and chirp at touchdown, runway rumble, brake squeal and anti-skid chatter, and a
  deceleration panel on the HUD (autobrake, DECEL, spoilers, reversers, chute, ground speed,
  deceleration, brake pressure and temperature).

### Graphics that scale
- Physically based sky with aerial-perspective fog, a night sky with moon, stars and city glow
- Quadtree LOD terrain with procedural splatting, city streets and night lighting
- Animated water, billboard clouds, instanced forests and city parks
- PBR aircraft with image-based lighting, panel-line normal maps, clear-coat airline paint, shock
  diamonds in the afterburners, nav lights, strobes and beacons with glow
- Particle explosions, smoke trails, wingtip vortices, contrails, bloom, ACES tone mapping
- **Low / Medium / High / Ultra** presets, GPU auto-detection and dynamic resolution scaling;
  low-rise city blocks are tiled and drawn only near the camera

### Controls
Keyboard and mouse, gamepad (standard mapping) and touch (virtual stick, throttle and buttons).

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
| Lock target in view | Y / middle mouse | |
| Weapon camera on/off | K | |
| Camera (chase, cockpit, padlock, cinematic, orbit) | C | Y |
| Padlock view | L | R3 |
| Look around | Right-drag / numpad | |
| Gear (and airliner flaps) / brakes | G / B | Back / L3 |
| Autobrake (LO, MED, MAX, RTO) | U | D-pad right |
| Thrust reversers / drag chute | J | D-pad left |
| ATC / AWACS menu (pick with 1-6) | M | |
| Pause | Esc / P | Start |

You can turn on **Mouse flight** (pointer-lock virtual stick), **Invert pitch**, **Lock-on
assist**, the **Targeting pod window** and the **Weapon camera** in Settings.

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
npm run test:physics          # flight-model and landing-roll tables for every aircraft (Node only)
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
  core/      Game loop, renderer & post-processing, quality presets, input, audio, radio, saves
  world/     Noise, maps, terrain LOD, atmosphere/fog, sky, water, clouds, trees, airbase,
             city layout (cityLayout.js) and city rendering (City.js)
  aircraft/  Jet catalogues (jets, fighters, airliners), procedural geometry & liveries,
             cockpits, flight model, aircraft entity, AI
  combat/    Guns, missiles, flares, ground & naval units
  fx/        Particles, ribbon trails, explosions, sonic booms
  game/      Battle runtime, missions, objectives, rings, camera rig, targeting, targeting pod,
             air traffic control and AWACS (ATC.js)
  ui/        HUD, menus, touch controls
scripts/     Physics and browser smoke tests
```
