// WebGL renderer + optional post-processing chain (MSAA, bloom, grading),
// with dynamic resolution scaling to keep frame rate stable on weak devices.
// The cockpit interior is drawn as an overlay pass after the world (depth
// cleared) so the airframe's outer skin can never cover the instruments.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { DynamicResolution } from './Quality.js';

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uDamage: { value: 0 },
    uWhiteout: { value: 0 },
    uBlackout: { value: 0 },
    uTime: { value: 0 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uSharpen: { value: 0.32 },
    uGrain: { value: 0.018 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uDamage;
    uniform float uWhiteout;
    uniform float uBlackout;
    uniform float uTime;
    uniform vec2 uTexel;
    uniform float uSharpen;
    uniform float uGrain;
    varying vec2 vUv;
    float gHash( vec2 p ) {
      p = fract( p * vec2( 443.897, 441.423 ) );
      p += dot( p, p.yx + 19.19 );
      return fract( ( p.x + p.y ) * p.x );
    }
    void main() {
      vec2 d = vUv - 0.5;
      float r = length( d );
      // subtle chromatic aberration towards the edges
      float ca = 0.0015 * r * r * 4.0;
      vec3 col;
      col.r = texture2D( tDiffuse, vUv - d * ca ).r;
      col.g = texture2D( tDiffuse, vUv ).g;
      col.b = texture2D( tDiffuse, vUv + d * ca ).b;
      // contrast-adaptive sharpening: crisper panel lines, windows and terrain
      // detail without ringing on bright edges
      vec3 nb = texture2D( tDiffuse, vUv + vec2( uTexel.x, 0.0 ) ).rgb + texture2D( tDiffuse, vUv - vec2( uTexel.x, 0.0 ) ).rgb
        + texture2D( tDiffuse, vUv + vec2( 0.0, uTexel.y ) ).rgb + texture2D( tDiffuse, vUv - vec2( 0.0, uTexel.y ) ).rgb;
      vec3 lap = col - nb * 0.25;
      float edgeAmt = 1.0 - smoothstep( 0.05, 0.35, max( max( abs( lap.r ), abs( lap.g ) ), abs( lap.b ) ) );
      col = max( col + lap * uSharpen * edgeAmt, 0.0 );
      // gentle filmic contrast, a touch more colour, and a soft shoulder that
      // takes the glare out of sunlit cloud tops and water
      col = mix( col, col * col * ( 3.0 - 2.0 * col ), 0.18 );
      float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( vec3( lum ), col, 1.07 );
      col *= 1.0 - 0.16 * smoothstep( 0.68, 1.0, lum );
      float vig = smoothstep( 0.85, 0.25, r );
      col *= mix( 1.0 - uVignette, 1.0, vig );
      // G-induced blackout tunnel / red damage flash / cloud whiteout
      col *= 1.0 - uBlackout * smoothstep( 0.15, 0.6, r ) - uBlackout * 0.5;
      col = mix( col, vec3( 0.6, 0.05, 0.03 ), uDamage * smoothstep( 0.2, 0.75, r ) );
      col = mix( col, vec3( 0.86, 0.88, 0.9 ), uWhiteout );
      // fine film grain, strongest in the shadows
      float lumG = dot( col, vec3( 0.333 ) );
      col += ( gHash( vUv * 1024.0 + fract( uTime * 7.31 ) * 97.0 ) - 0.5 ) * uGrain * ( 1.0 - smoothstep( 0.0, 0.8, lumG ) );
      gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
    }
  `,
};

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = null;
    this.composer = null;
    this.preset = null;
    this.dynamic = new DynamicResolution();
    this.effects = { damage: 0, whiteout: 0, blackout: 0 };
    this.overlayScene = new THREE.Scene();
    this.overlayScene.name = 'cockpit-overlay';
    this.overlayScene.matrixWorldAutoUpdate = true;
    this.overlayObject = null;
  }

  init(preset) {
    this.preset = preset;
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.6;
    r.shadowMap.enabled = preset.shadows;
    r.shadowMap.type = preset.shadowSize >= 4096 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.setClearColor(0x87a0b8, 1);
    this.renderer = r;
    this.applyPreset(preset);
    return r;
  }

  applyPreset(preset) {
    this.preset = preset;
    const r = this.renderer;
    r.shadowMap.enabled = preset.shadows;
    r.shadowMap.needsUpdate = true;
    this._buildComposer();
    this.resize();
  }

  _buildComposer() {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer = null;
    }
    if (!this.preset.postFX) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples: this.preset.msaa,
    });
    const composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(null, null);
    composer.addPass(this.renderPass);
    this.overlayPass = new RenderPass(this.overlayScene, null);
    this.overlayPass.clear = false;
    this.overlayPass.clearDepth = true;
    this.overlayPass.enabled = false;
    composer.addPass(this.overlayPass);
    // restrained bloom: lights and flames glow, daylight surfaces do not
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.32, 2.4);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    this.composer = composer;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
    const pr = dpr * this.preset.pixelRatio * this.dynamic.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      if (this.grade) this.grade.uniforms.uTexel.value.set(1 / Math.max(1, w * pr), 1 / Math.max(1, h * pr));
    }
  }

  // Called once per frame with the frame time; adapts resolution if needed.
  adapt(frameMs) {
    if (this.dynamic.update(frameMs)) this.resize();
  }

  // object (or null) drawn on top of the world after a depth clear
  setOverlay(obj) {
    if (obj === this.overlayObject) return;
    if (this.overlayObject) this.overlayScene.remove(this.overlayObject);
    if (obj) this.overlayScene.add(obj);
    this.overlayObject = obj;
  }

  render(scene, camera, dt = 0.016) {
    const e = this.effects;
    const overlay = !!this.overlayObject;
    if (this.composer) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.overlayPass.camera = camera;
      this.overlayPass.enabled = overlay;
      const u = this.grade.uniforms;
      u.uDamage.value = e.damage;
      u.uWhiteout.value = e.whiteout;
      u.uBlackout.value = e.blackout;
      u.uTime.value += dt;
      this.composer.render(dt);
    } else {
      const r = this.renderer;
      r.render(scene, camera);
      if (overlay) {
        r.autoClear = false;
        r.clearDepth();
        r.render(this.overlayScene, camera);
        r.autoClear = true;
      }
    }
  }
}
