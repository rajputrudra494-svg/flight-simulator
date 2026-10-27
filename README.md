# Strike Horizon — Combat Flight Simulator

A browser combat flight simulator built with [three.js](https://threejs.org). Everything is
generated procedurally at runtime: terrain, cities, sky, clouds, aircraft models, liveries,
cockpits and sound. The game ships **no art or audio assets**, loads fast and runs anywhere
WebGL 2 is available, from phones to high-end desktops.

## Features

### Aircraft (44)
Every aircraft has its own geometry, livery, flight model and loadout, built from real-world
dimensions, wing areas, weights and engine thrust.

**Military jets (23)**

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
| F-4E Phantom II | Cold War multirole | Cranked outer wings, drooping stabilators, gun in the nose |
| MiG-31BM Foxhound | Mach 2.8 interceptor | Engines pull harder with speed; 1.23 Mach limit down low |
| J-10C Vigorous Dragon | Multirole | Canard delta with a chin intake |
| MiG-35 Fulcrum-F | Multirole | The modernised Fulcrum, Mach 2.25 |
| F-15E Strike Eagle | Dual-role strike | Conformal fuel tanks, dark grey, Mach 2.5 |
| Su-30MKI Flanker-H | Two-seat air superiority | Canards and thrust vectoring, twelve missiles |

**Bombers and special aircraft (6)**

| Aircraft | Role | Highlights |
|---|---|---|
| B-2A Spirit | Stealth strategic bomber | 52 m flying wing, sawtooth trailing edge, buried engines with shielded exhaust slots, elevons, 16 JDAMs in two bays |
| B-1B Lancer | Supersonic bomber | Wings sweep 15°–67.5° with Mach, four afterburning F101s, Mach 1.25, 24 JDAMs in three bays |
| B-52H Stratofortress | Strategic heavy bomber | Eight TF33s in twin pods, bicycle gear with outriggers, +6° wing incidence (lifts off flat, cruises nose-down), drag chute |
| Tu-160 Blackjack | Supersonic strategic bomber | The "White Swan": 20°–65° sweep, 980 kN of reheat, Mach 2 |
| SR-71A Blackbird | Mach 3 reconnaissance | Chines, inlet spikes, turbo-ramjet thrust that grows past Mach 1.4 and a 450-knot structural limit: climb above 20 km and run at Mach 3.2+. Unarmed |
| F-117A Nighthawk | Stealth attack | Faceted flat-shaded skin and canopy, butterfly tail, shielded exhausts, two GBU-27s |

Real weights, wing areas, thrust, Mach and g limits drive the flight model, so a B-2 takes a long
take-off run and turns gently, the SR-71 is held to 450 knots until the air thins, and the MiG-31
tops out near Mach 2.8.

**Every aircraft is unlocked in Free Flight.** The campaign still unlocks them for missions.

**Airliners & cargo (15)** — Airbus A220-300, Embraer E195-E2, Airbus A320neo, Airbus A321neo, Boeing 737 MAX 8, Boeing 757-200, Boeing 767-300ER, Airbus A330-900neo, Airbus A350-900 (curved sharklets), Boeing 787-9 Dreamliner (raked wingtips, big
windows), Boeing 777-300ER, Boeing 747-8
(upper-deck hump), Airbus A380 (two window decks), Concorde (droop nose, reheat, Mach 2) and the
**Antonov An-124 Ruslan**.

Airliners have turbofan pods on pylons, winglets/sharklets, multi-axle bogie gear, glossy
clear-coated liveries with painted cabin windows, doors, cheatlines and tail logos (fictional
airlines), and flaps that come down with the gear.

**Antonov An-124 Ruslan** — 69.1 m long, 73.3 m span, 21 m tall, 628 m² anhedral high wing, four
Progress D-18T turbofans of 229.5 kN, 24-wheel gear in fuselage sponsons, flown at 395 t with a full
hold. High-bypass turbofans lose thrust as speed builds, so the take-off run takes about 50 s and
2.4 km of runway and lift-off comes at roughly 170 kt. For the campaign it is an exclusive
aircraft: it stays locked there (even with *Unlock all*) until you complete **Heavy Escort**,
**Final Approach** and **Dragon's Teeth**, which also opens its own special operation, **Operation
Atlas**. In Free Flight it is open from the start like everything else.

### Real-world performance
Every type is tuned to its real figures. Low-bypass afterburning engines recover ram pressure with speed
(at Mach 2 and altitude they make about their sea-level static thrust again), so jets reach their real
top speeds up high: F-16 Mach 2.05, F-15 Mach 2.5, F-22 Mach 2.25, MiG-31 Mach 2.83, SR-71 Mach 3.2 above
20 km, Concorde Mach 2.04. Supersonic fighters are held near 800 knots indicated (about Mach 1.2) on the
deck, airliners top out at their real cruise Mach. `npm run test:physics` prints the reached top Mach
next to the real one for every aircraft.

### Pre-flight story
Every sortie, in free flight and in the campaign, starts on the stand. The pilot walks out of the hangar
(or the captain and first officer from the terminal), climbs the ladder into the cockpit and the canopy
comes down (an airstair and the forward door on airliners, a belly hatch on the big bombers). The crew
chief or first officer runs the start while ATC gives the clearance (delivery on civil fields: departure,
squawk and initial altitude), start-up approval and taxi instructions with real phraseology. A marshaller
waves the jet out, it taxis along the yellow centre line to holding point A1, the tower clears it to line
up and then for take-off, and you get control on the runway. Missions that start in the air fly the
take-off as a cutscene and cut to the operations area. Letterboxed cinematic cameras, subtitles for every
transmission and a stage bar (walk-out, start-up, taxi, line-up, take-off) follow it all; Enter, Space or
Esc skips it, and Settings turns it off.

The people are modelled with human proportions: lathed limbs with knee and calf shape, a chest-waist-hip
torso, gloved hands and a face, the fighter pilot in flight suit, G-suit, survival vest and harness with a
visored helmet and oxygen mask. Under the canopy every fighter now has a cockpit that follows the
fuselage: the sill rail, glare shield, lit screens, HUD glass and an ejection seat with its yellow-and-black
handles, with the pilot strapped in.

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
- **Harbour City** (city): supertall towers packed onto two narrow shores of a deep harbour between
  steep jungle peaks, a container port and an airport on a reclaimed island
- **Rivergate** (city): an old European capital on a winding river: courtyard blocks with tiled and
  slate roofs, a domed cathedral, stone arch bridges, a TV tower and a business district of towers
- **Lakeshore** (city): a gridded skyline standing on the shore of a great lake, a river through
  downtown and a lakefront stadium

Cities are tens of thousands of instanced buildings with a procedural facade shader (glass
curtain walls with mullions, ribbon windows, punched windows, European stone facades with cornices,
shop fronts with awnings, blinds, rain streaks and corner shading), pitched tile and slate roofs,
rooftop plant and helipads, GPU-animated car traffic on every street with head and tail lights, streets with lane markings, parks and docks.
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
- **Bombers drop real bombs**: designate a ground target and the HUD shows the glide reach, an
  *IN RNG* cue and a **CCIP** impact pipper. Bay doors swing open, the bomb falls clear, deploys its
  tail fins and steers to the coordinates (JDAM / Paveway / KAB) on a lifting glide; without a
  target it falls ballistically onto the pipper.
- **Realistic launches**: heat seekers light up on the rail; radar missiles are ejected, fall clear
  for a third of a second and then ignite, with a white-hot flash, a burst of exhaust smoke, a
  flickering motor plume and a billowing smoke trail. Guns fire belts with a tracer every third
  round, a ragged muzzle flash and gun gas trailing back along the jet.
- **Crashes and shoot-downs**: aircraft break into the parts they are really made of (wings, tail,
  nose, centre fuselage) that keep the livery, glow hot and char, trail fire and smoke, tumble,
  bounce and skid along the ground or sink in the sea. A warhead can tear an airframe apart in the
  air, or it can shed a wing and roll into the ground. Ground impacts give a fuel fireball, a dust
  ring, a scorch mark and a smoke column; a crash camera holds a wide shot of your wreckage.
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
- Quadtree LOD terrain with procedural splatting, close-range micro relief, city streets and night lighting
- Airports with taxiway centre lines, holding-point markings, blue edge and green centre-line lights,
  stained slab concrete, rubbered and grooved runways, apron flood lights, a passenger terminal on civil
  fields and parked aircraft on the other stands
- Contrast-adaptive sharpening and fine film grain in the post-processing chain
- Animated water, billboard clouds, instanced forests and city parks
- PBR aircraft with image-based lighting, panel-line normal maps, clear-coat airline paint, service
  wear (exhaust soot, belly grime and streaks, a paint sheen that breaks up across the skin), shock
  diamonds in the afterburners, nav lights, strobes and beacons with glow
- Particle explosions, fuel fireballs, billowing missile smoke, wingtip vortices, contrails,
  restrained bloom, ACES tone mapping and a soft highlight shoulder that keeps glare down
- **Scene brightness** setting (defaults a little dimmer than the raw sky model, so the sun and
  sunlit clouds are easier to fly against)
- **Low / Medium / High / Ultra** presets (**High** by default, auto-detection still available) and
  dynamic resolution scaling; low-rise city blocks are tiled and drawn only near the camera
- A cinematic title screen: blended camera shots of the selected aircraft with a tracking reticle,
  a featured-aircraft card that browses the whole hangar, and **Quick flight**

### Controls
Keyboard and mouse, gamepad / joystick / HOTAS, touch and **tilt (gyro)** on phones and tablets.

**Custom controls** (Controls screen): click any binding and press the key, mouse button (side
buttons too) or gamepad button you want; two keys per action plus gamepad buttons, conflicts move
automatically, presets (Standard, Left-handed, Arrow keys) and reset. Pick which stick axis drives
pitch, roll, rudder, look and a **throttle lever** (with *Detect* and invert), plus dead zone,
response curve and keyboard stick speed.

**Phones and tablets**: drag every on-screen control to where your thumbs want it in the touch
layout editor, resize and fade them, mirror for left-handed play, or use a **floating stick** that
appears under your thumb. **Tilt steering** flies with the device's motion sensors (roll like a
steering wheel, tilt the top edge towards you to pull) with sensitivity and invert options; the
TILT button recentres it. Optional vibration on firing, hits and crashes.

Default layout:

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Pitch / roll | W S A D or arrow keys | Left stick |
| Rudder | Q / E | Right stick |
| Throttle | Shift / R up, F down, 0–5, mouse wheel | RB / LB |
| Afterburner | Throttle above 90% | |
| Gun | Space | RT |
| Missile / bomb release | Enter / X | A / LT |
| Flares | V / Z | B |
| Next target | T / Tab | X |
| Lock target in view | Y / middle mouse | |
| Camera (chase, cockpit, padlock, cinematic, orbit) | C | Y |
| Padlock view | L | R3 |
| Look around | Right-drag / numpad | |
| Gear (and airliner flaps) / brakes | G / B | Back / L3 |
| Autobrake (LO, MED, MAX, RTO) | U | D-pad right |
| Thrust reversers / drag chute | J | D-pad left |
| ATC / AWACS menu (pick with 1-6) | M | |
| Pause | Esc / P | Start |

You can turn on **Mouse flight** (pointer-lock virtual stick), **Invert pitch**, **Lock-on
assist** and the **Targeting pod window** in Settings.

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
  aircraft/  Jet catalogues (jets, fighters, heavies, airliners), procedural geometry & liveries,
             cockpits, flight model, aircraft entity, AI
  combat/    Guns, missiles, flares, ground & naval units
  fx/        Particles, ribbon trails, explosions, sonic booms, wreckage break-up
  game/      Battle runtime, missions, objectives, rings, camera rig, targeting, targeting pod,
             air traffic control and AWACS (ATC.js)
  ui/        HUD, menus, controls editor, touch controls (core/Controls.js and core/Gyro.js
             hold the binding model and tilt steering)
scripts/     Physics and browser smoke tests
```
