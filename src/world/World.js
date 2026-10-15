// Builds and updates a complete theatre: sky, lighting, terrain, water,
// clouds, vegetation and the airbase.
import * as THREE from 'three';
import { MAPS, MapRuntime, resolveLighting, sunDirection } from './maps.js';
import { configureAtmosphere, sunTransmittance, updateAtmosphereCamera, skyColorJS } from './atmosphere.js';
import { SkyDome } from './Sky.js';
import { Terrain } from './Terrain.js';
import { Water } from './Water.js';
import { Clouds } from './Clouds.js';
import { Vegetation } from './Vegetation.js';
import { Airbase } from './Airbase.js';

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
  }

  build() {
    const { scene, quality, def } = this;
    const lighting = this.lighting;

    // Atmosphere colours derived from the analytic sky model
    const atmoCols = configureAtmosphere(this.sunDir, lighting, def.fog);
    this.fogColors = atmoCols;
    scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(...atmoCols.away, THREE.LinearSRGBColorSpace), def.fog.density);

    this.sky = new SkyDome();
    const groundAmb = new THREE.Color(def.groundAmbient);
    this.sky.configure(this.sunDir, lighting, 0.5 * this.weather, groundAmb.clone().multiplyScalar(0.6));
    scene.add(this.sky);

    // Sun light colour from atmospheric transmittance
    const tr = sunTransmittance(this.sunDir, lighting);
    const maxT = Math.max(...tr);
    this.sunColor = new THREE.Color(tr[0] / maxT, tr[1] / maxT, tr[2] / maxT);
    const elevFactor = THREE.MathUtils.smoothstep(this.sunDir.y, -0.02, 0.25);
    const sunIntensity = 6.2 * (0.35 + 0.65 * elevFactor);
    this.sun = new THREE.DirectionalLight(this.sunColor, sunIntensity);
    this.sun.position.copy(this.sunDir).multiplyScalar(1000);
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

    const zen = skyColorJS({ x: 0, y: 1, z: 0 }, this.sunDir, lighting);
    this.zenith = new THREE.Color(zen[0], zen[1], zen[2]);
    const skyAmb = new THREE.Color().setRGB(
      (atmoCols.away[0] + zen[0]) * 0.5,
      (atmoCols.away[1] + zen[1]) * 0.5,
      (atmoCols.away[2] + zen[2]) * 0.5,
      THREE.LinearSRGBColorSpace,
    );
    this.hemi = new THREE.HemisphereLight(skyAmb, groundAmb, 1.5);
    scene.add(this.hemi);
    this.skyAmbient = skyAmb;

    // Terrain / water / clouds / trees / airbase
    this.terrain = new Terrain(this.map, quality, scene);
    this.water = new Water(def, quality, scene, quality.viewDistance * 1.6);
    this.water.setLighting(this.sunColor.clone().multiplyScalar(sunIntensity * 0.6), this.zenith);
    this.clouds = new Clouds({ ...def, clouds: { ...def.clouds, density: def.clouds.density * this.weather } }, quality, scene);
    const cloudSun = this.sunColor.clone().multiplyScalar(2.2 + elevFactor * 0.8);
    const cloudAmb = skyAmb.clone().multiplyScalar(0.55);
    this.clouds.setLighting(cloudSun, cloudAmb, this.sunDir);
    this.vegetation = new Vegetation(this.map, quality, scene);
    this.airbase = new Airbase(this.map, quality, scene);

    // Image based lighting for metallic aircraft
    this._buildEnvironment(groundAmb);
    this.renderer.toneMappingExposure = lighting.exposure;
  }

  _buildEnvironment(groundAmb) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky = new SkyDome();
    sky.configure(this.sunDir, this.lighting, 0.3, groundAmb.clone().multiplyScalar(0.5));
    sky.material.uniforms.uEnvMode.value = 1;
    sky.material.uniforms.uSunDiscIntensity.value = 4;
    envScene.add(sky);
    const rt = pmrem.fromScene(envScene, 0, 0.1, 2000);
    this.envTarget = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.85;
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
    this.water.update(camera, this.time);
    this.clouds.update(camera, dt);
    const agl = camera.position.y - this.map.surfaceAt(camera.position.x, camera.position.z);
    this.vegetation.update(camera, agl);
    // keep the sun shadow frustum centred on the focus object
    if (this.sun.castShadow && focus) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 1200);
      this.sun.target.updateMatrixWorld();
    }
  }

  dispose() {
    this.terrain?.dispose();
    this.water?.dispose();
    this.clouds?.dispose();
    this.vegetation?.dispose();
    this.airbase?.dispose();
    if (this.sky) {
      this.sky.geometry.dispose();
      this.sky.material.dispose();
    }
    this.envTarget?.dispose();
    if (this.sun?.shadow?.map) this.sun.shadow.map.dispose();
  }
}
