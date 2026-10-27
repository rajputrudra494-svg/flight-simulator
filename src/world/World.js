// Builds and updates a complete theatre: sky, lighting, terrain, water,
// clouds, vegetation, the airbase and (on city maps) the city. Night and dusk
// scenes switch on window, street and aviation lights; full night is lit by
// the moon.
import * as THREE from 'three';
import { MAPS, MapRuntime, resolveLighting, sunDirection } from './maps.js';
import { atmo, configureAtmosphere, sunTransmittance, updateAtmosphereCamera, skyColorJS } from './atmosphere.js';
import { SkyDome } from './Sky.js';
import { Terrain } from './Terrain.js';
import { Water } from './Water.js';
import { Clouds } from './Clouds.js';
import { Vegetation } from './Vegetation.js';
import { Airbase } from './Airbase.js';
import { CityRenderer } from './City.js';
import { JETS } from '../aircraft/jets.js';
import { mulberry32 } from './noise.js';

export class World {
  constructor(renderer, quality, mapId, timeKey = 'default', weather = 1) {
    this.renderer = renderer;
    this.quality = quality;
    this.def = MAPS[mapId] || MAPS.pacific;
    this.timeKey = timeKey;
    this.weather = weather;
    this.scene = new THREE.Scene();
    this.scene.name = 'world:' + this.def.id;
    this.map = new MapRuntime(this.def);
    this.time = 0;
    this.lighting = resolveLighting(this.def, timeKey);
    this.sunDir = sunDirection(this.lighting.elevation, this.lighting.azimuth, new THREE.Vector3());
    this.night = !!this.lighting.night;
    this.moonDir = this.night ? sunDirection(this.lighting.moonElevation ?? 34, this.lighting.moonAzimuth ?? this.lighting.azimuth - 60, new THREE.Vector3()) : null;
    // 0 in daylight, rising through sunset/dusk to 1 at night
    this.nightFactor = this.night ? 1 : THREE.MathUtils.smoothstep(-this.lighting.elevation, -12, 1);
  }

  build() {
    const { scene, quality, def } = this;
    const lighting = this.lighting;
    const night = this.night;
    const cityGlow = this.map.city ? new THREE.Color(0.16, 0.09, 0.04).multiplyScalar(this.nightFactor) : new THREE.Color(0, 0, 0);

    // Atmosphere colours derived from the analytic sky model
    const atmoCols = configureAtmosphere(this.sunDir, lighting, def.fog);
    if (night) {
      // dark blue haze with the moon taking the sun's place for fog glow and glitter
      const away = [0.012 + cityGlow.r * 0.25, 0.017 + cityGlow.g * 0.25, 0.032 + cityGlow.b * 0.25];
      const toward = [0.03, 0.036, 0.055];
      atmo.fogAway.set(away);
      atmo.fogToward.set(toward);
      atmo.sunDir.set([this.moonDir.x, this.moonDir.y, this.moonDir.z]);
      atmoCols.away = away;
      atmoCols.toward = toward;
    }
    this.fogColors = atmoCols;
    scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(...atmoCols.away, THREE.LinearSRGBColorSpace), def.fog.density * (night ? 1.25 : 1));

    this.sky = new SkyDome();
    const groundAmb = new THREE.Color(def.groundAmbient);
    this.sky.configure(this.sunDir, lighting, 0.5 * this.weather * (night ? 0.2 : 1), groundAmb.clone().multiplyScalar(0.6));
    this._configureNightSky(this.sky, cityGlow);
    scene.add(this.sky);

    // Sun (or moon) light
    const lightDir = night ? this.moonDir : this.sunDir;
    let sunIntensity, elevFactor;
    if (night) {
      this.sunColor = new THREE.Color(0.55, 0.64, 0.95);
      elevFactor = 0;
      sunIntensity = 0.32;
    } else {
      const tr = sunTransmittance(this.sunDir, lighting);
      const maxT = Math.max(...tr);
      this.sunColor = new THREE.Color(tr[0] / maxT, tr[1] / maxT, tr[2] / maxT);
      elevFactor = THREE.MathUtils.smoothstep(this.sunDir.y, -0.02, 0.25);
      sunIntensity = 6.2 * (0.35 + 0.65 * elevFactor);
    }
    this.sun = new THREE.DirectionalLight(this.sunColor, sunIntensity);
    this.lightDir = lightDir;
    this.sun.position.copy(lightDir).multiplyScalar(1000);
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.sun);
    scene.add(this.sun.target);
    if (quality.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
      const s = 70;
      Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 3000 });
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.6;
      this.sun.shadow.camera.updateProjectionMatrix();
    }

    const zen = night ? [0.004, 0.006, 0.015] : skyColorJS({ x: 0, y: 1, z: 0 }, this.sunDir, lighting);
    this.zenith = new THREE.Color(zen[0], zen[1], zen[2]);
    const skyAmb = night
      ? new THREE.Color(0.035, 0.045, 0.085).add(cityGlow.clone().multiplyScalar(0.3))
      : new THREE.Color().setRGB(
        (atmoCols.away[0] + zen[0]) * 0.5,
        (atmoCols.away[1] + zen[1]) * 0.5,
        (atmoCols.away[2] + zen[2]) * 0.5,
        THREE.LinearSRGBColorSpace,
      );
    const hemiGround = night ? new THREE.Color(0.012, 0.012, 0.016) : groundAmb;
    this.hemi = new THREE.HemisphereLight(skyAmb, hemiGround, night ? 1.3 : 1.5);
    scene.add(this.hemi);
    this.skyAmbient = skyAmb;

    // Terrain / water / clouds / trees / airbase / city
    this.terrain = new Terrain(this.map, quality, scene);
    this.water = new Water(def, quality, scene, quality.viewDistance * 1.6);
    this.water.setLighting(this.sunColor.clone().multiplyScalar(sunIntensity * (night ? 1.4 : 0.6)), this.zenith);
    this.clouds = new Clouds({ ...def, clouds: { ...def.clouds, density: def.clouds.density * this.weather } }, quality, scene);
    const cloudSun = night ? this.sunColor.clone().multiplyScalar(0.35) : this.sunColor.clone().multiplyScalar(2.2 + elevFactor * 0.8);
    const cloudAmb = skyAmb.clone().multiplyScalar(night ? 0.9 : 0.55);
    this.clouds.setLighting(cloudSun, cloudAmb, lightDir);
    this.vegetation = new Vegetation(this.map, quality, scene);
    this.airbase = new Airbase(this.map, quality, scene);
    this.airbase.setNight(this.nightFactor);
    this._parkAircraft();
    const tu = this.terrain.material.userData.uniforms;
    tu.uNight.value = this.nightFactor;
    if (this.map.city) {
      this.city = new CityRenderer(this.map.city, quality, scene);
      this.city.setNight(this.nightFactor);
      this._roads(tu);
    }

    // Image based lighting for metallic aircraft
    this._buildEnvironment(groundAmb, cityGlow);
    this.renderer.toneMappingExposure = lighting.exposure;
    // condensation is lit by the sun (pale blue moonlight at night)
    this.vaporLight = night ? new THREE.Color(0.25, 0.3, 0.42) : this.sunColor.clone().multiplyScalar(0.9 + elevFactor * 0.8).add(skyAmb.clone().multiplyScalar(0.8));
  }

  // a few aircraft parked on the other stands: airliners at civil airports, fighters on air bases
  _parkAircraft() {
    const ids = this.airbase.civil ? ['a320', 'b787', 'a350', 'b737', 'a321', 'e195', 'b777', 'a220'] : ['f16', 'fa18', 'f15', 'typhoon', 'gripen', 'su30', 'rafale'];
    const r = mulberry32((this.def.seed * 13 + 5) >>> 0);
    const pick = ids.map((id) => [r(), id]).sort((a, b) => a[0] - b[0]).map((x) => JETS[x[1]]).filter(Boolean);
    this.airbase.addParked(pick);
  }

  _configureNightSky(sky, cityGlow) {
    const u = sky.material.uniforms;
    u.uNight.value = this.night ? 1 : 0;
    if (this.moonDir) u.uMoonDir.value.copy(this.moonDir);
    u.uCityGlow.value.copy(cityGlow);
  }

  // highways from the edge of the city to the airport apron
  _roads(tu) {
    const city = this.map.def.city;
    const ab = this.map.airbase;
    const dx = ab.x - city.x, dz = ab.z - city.z;
    const d = Math.hypot(dx, dz) || 1;
    const sx = city.x + (dx / d) * city.radius * 0.75, sz = city.z + (dz / d) * city.radius * 0.75;
    const apron = this.map.fromAirbaseLocal(0, -ab.halfW - 120);
    const mid = { x: (sx + apron.x) / 2, z: (sz + apron.z) / 2 + 600 };
    tu.uRoads.value[0].set(sx, sz, mid.x, mid.z);
    tu.uRoads.value[1].set(mid.x, mid.z, apron.x, apron.z);
    tu.uRoadCount.value = 2;
  }

  _buildEnvironment(groundAmb, cityGlow) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky = new SkyDome();
    sky.configure(this.sunDir, this.lighting, 0.3, groundAmb.clone().multiplyScalar(this.night ? 0.05 : 0.5));
    this._configureNightSky(sky, cityGlow);
    sky.material.uniforms.uEnvMode.value = 1;
    sky.material.uniforms.uSunDiscIntensity.value = 4;
    envScene.add(sky);
    const rt = pmrem.fromScene(envScene, 0, 0.1, 2000);
    this.envTarget = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = this.night ? 1.3 : 0.85;
    sky.geometry.dispose();
    sky.material.dispose();
    pmrem.dispose();
  }

  // Generates terrain/trees around a point before gameplay starts.
  warmup(camera) {
    camera.updateMatrixWorld();
    updateAtmosphereCamera(camera);
    this.terrain.warmup(camera.position);
    this.vegetation.warmup(camera);
    this.clouds.update(camera, 0);
  }

  update(dt, camera, focus) {
    this.time += dt;
    updateAtmosphereCamera(camera);
    this.sky.follow(camera, this.time);
    this.terrain.update(camera.position);
    this.terrain.material.userData.uniforms.uTime.value = this.time;
    this.water.update(camera, this.time);
    this.clouds.update(camera, dt);
    const agl = camera.position.y - this.map.surfaceAt(camera.position.x, camera.position.z);
    this.vegetation.update(camera, agl);
    if (this.city) this.city.update(dt, camera);
    // keep the sun shadow frustum centred on the focus object
    if (this.sun.castShadow && focus) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(this.lightDir, 1200);
      this.sun.target.updateMatrixWorld();
    }
  }

  dispose() {
    this.terrain?.dispose();
    this.water?.dispose();
    this.clouds?.dispose();
    this.vegetation?.dispose();
    this.airbase?.dispose();
    this.city?.dispose();
    if (this.sky) {
      this.sky.geometry.dispose();
      this.sky.material.dispose();
    }
    this.envTarget?.dispose();
    if (this.sun?.shadow?.map) this.sun.shadow.map.dispose();
  }
}
