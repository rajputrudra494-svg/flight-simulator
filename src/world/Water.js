// Ocean / lake surface: multi-scale animated normals, Fresnel sky reflection,
// sun glitter and depth-aware transparency. Follows the camera so it reaches
// the horizon without a giant mesh.
import * as THREE from 'three';
import { atmoUniforms } from './atmosphere.js';
import { getWaterNormalTexture } from './textures.js';

const vertexShader = /* glsl */ `
  varying vec3 vWPos;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vWPos = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uNormalMap;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSunColor;
  uniform vec3 uZenith;
  uniform float uDetail;
  varying vec3 vWPos;
  #include <fog_pars_fragment>

  vec3 sampleN( vec2 uv ) {
    vec3 t = texture2D( uNormalMap, uv ).xyz * 2.0 - 1.0;
    return vec3( t.x, t.z, t.y );
  }

  void main() {
    vec3 toCam = cameraPosition - vWPos;
    float dist = length( toCam );
    vec3 V = toCam / dist;
    vec2 p = vWPos.xz;
    float t = uTime;

    vec3 n = sampleN( p / 900.0 + t * vec2( 0.004, 0.0025 ) ) * 0.8;
    n += sampleN( p / 170.0 + t * vec2( -0.011, 0.013 ) ) * 0.7;
    if ( uDetail > 0.5 ) n += sampleN( p / 38.0 + t * vec2( 0.03, -0.021 ) ) * 0.55 * smoothstep( 2500.0, 300.0, dist );
    if ( uDetail > 1.5 ) n += sampleN( p / 9.0 + t * vec2( -0.06, 0.05 ) ) * 0.35 * smoothstep( 500.0, 40.0, dist );
    n.y *= 2.6 + smoothstep( 300.0, 9000.0, dist ) * 5.0;
    n = normalize( n );

    float NdV = max( dot( n, V ), 0.0 );
    float fresnel = 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 );

    vec3 R = reflect( -V, n );
    R.y = abs( R.y );
    vec3 sky = mix( atmoFogColor( R ), uZenith, smoothstep( 0.02, 0.6, R.y ) );

    float sunH = clamp( uAtmoSunDir.y, 0.0, 1.0 );
    vec3 body = uDeep * ( 0.25 + 0.75 * sunH ) + uShallow * 0.12 * ( 1.0 - NdV ) * sunH;
    vec3 col = mix( body, sky, fresnel );

    float shininess = mix( 900.0, 140.0, smoothstep( 200.0, 6000.0, dist ) );
    float spec = pow( max( dot( R, uAtmoSunDir ), 0.0 ), shininess );
    col += uSunColor * spec * ( 6.0 + shininess * 0.02 );

    float alpha = mix( 0.62, 1.0, fresnel );
    alpha = mix( alpha, 1.0, smoothstep( 1500.0, 6000.0, dist ) );

    gl_FragColor = vec4( col, alpha );
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Water {
  constructor(mapDef, quality, scene, radius) {
    this.level = mapDef.water.level;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    Object.assign(this.uniforms, atmoUniforms(), {
      uNormalMap: { value: getWaterNormalTexture() },
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(mapDef.water.deep) },
      uShallow: { value: new THREE.Color(mapDef.water.shallow) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uZenith: { value: new THREE.Color(0.3, 0.5, 0.9) },
      uDetail: { value: quality.waterDetail },
    });
    const material = new THREE.ShaderMaterial({
      name: 'Water',
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      fog: true,
      depthWrite: true,
    });
    const geo = new THREE.CircleGeometry(radius, 96);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.position.y = this.level;
    this.mesh.name = 'water';
    this.scene = scene;
    scene.add(this.mesh);
  }

  setLighting(sunColor, zenith) {
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uZenith.value.copy(zenith);
  }

  update(camera, time) {
    this.mesh.position.x = camera.position.x;
    this.mesh.position.z = camera.position.z;
    this.uniforms.uTime.value = time;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
