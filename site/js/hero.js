// The hero: worldlines streaming through space. They braid apart between HARD anchors and are pulled back together
// at each one; particles run along them, and the camera follows the mouse.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 130;      // half the length of the field
const P = 52;       // distance between anchors
const A = 15;       // how far the lines spread between anchors
const SPEED = 5;    // how fast the world streams past

// the same curve in every shader: env() is zero at each anchor, so every line passes through it
const CURVE = /* glsl */`
  uniform float uTime;
  float envAt(float xs) { return pow(abs(sin(3.14159265 * xs / ${P.toFixed(1)})), 0.85); }
  vec3 worldline(float xw, vec4 s) {
    float xs = xw + uTime * ${SPEED.toFixed(1)};
    float e = envAt(xs) * ${A.toFixed(1)} * (0.35 + s.x);
    float y = e * (sin(xs * 0.045 + s.y * 6.2832 + uTime * 0.35) * 0.65 + sin(xs * 0.11 + s.z * 6.2832 - uTime * 0.22) * 0.35);
    float z = e * cos(xs * 0.06 + s.w * 6.2832 + uTime * 0.27);
    return vec3(xw, y, z);
  }
`;

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, inner); r.addColorStop(0.25, outer); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function startHero(canvas, reduced) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch { return null; }
  const small = innerWidth < 700;
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.25 : 1.5));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04050d, 0.006);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(0, 10, small ? 120 : 92);
  const world = new THREE.Group();
  scene.add(world);
  const uniforms = { uTime: { value: 0 } };

  // the worldlines
  const LINES = small ? 34 : 64, SEG = 260;
  const seeds = Array.from({ length: LINES }, (_, i) => (i === 0 ? [0.95, 0.1, 0.6, 0.3] : [Math.random(), Math.random(), Math.random(), Math.random()]));
  {
    const ax = new Float32Array(LINES * SEG * 2), as = new Float32Array(LINES * SEG * 2 * 4);
    let k = 0;
    for (let l = 0; l < LINES; l++) for (let s = 0; s < SEG; s++) for (const d of [0, 1]) {
      ax[k] = (s + d) / SEG; as.set(seeds[l], k * 4); k++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINES * SEG * 2 * 3), 3));
    g.setAttribute('aX', new THREE.BufferAttribute(ax, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(as, 4));
    const m = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: CURVE + /* glsl */`
        attribute float aX; attribute vec4 aSeed; varying float vA; varying vec3 vC;
        void main() {
          float xw = mix(-${W.toFixed(1)}, ${W.toFixed(1)}, aX);
          vec3 p = worldline(xw, aSeed);
          float e = envAt(xw + uTime * ${SPEED.toFixed(1)});
          bool you = aSeed.x > 0.94 && aSeed.y < 0.11;
          vA = smoothstep(0.0, 0.18, aX) * smoothstep(1.0, 0.82, aX) * (you ? 0.95 : 0.16 + 0.5 * (1.0 - e));
          vC = you ? vec3(1.0, 0.35, 0.65) : mix(vec3(0.2, 0.9, 1.0), vec3(0.55, 0.42, 1.0), aSeed.w);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`varying float vA; varying vec3 vC; void main() { gl_FragColor = vec4(vC * vA, vA); }`,
    });
    const lines = new THREE.LineSegments(g, m);
    lines.frustumCulled = false;
    world.add(lines);
  }

  // particles running along the lines
  {
    const N = small ? 2200 : 5200;
    const ap = new Float32Array(N), as = new Float32Array(N * 4), av = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      ap[i] = Math.random(); av[i] = 0.4 + Math.random() * 1.4;
      as.set(seeds[Math.floor(Math.random() * LINES)], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ap, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(as, 4));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(av, 1));
    const m = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: CURVE + /* glsl */`
        attribute float aPhase; attribute vec4 aSeed; attribute float aSpeed; varying float vA; varying vec3 vC;
        void main() {
          float span = ${(2 * W).toFixed(1)};
          float xw = mod(aPhase * span + uTime * aSpeed * 9.0, span) - ${W.toFixed(1)};
          vec3 p = worldline(xw, aSeed);
          float edge = smoothstep(${W.toFixed(1)}, ${(W * 0.7).toFixed(1)}, abs(xw));
          float e = envAt(xw + uTime * ${SPEED.toFixed(1)});
          vA = edge * (0.55 + 0.45 * (1.0 - e));
          vC = mix(vec3(0.55, 0.95, 1.0), vec3(1.0, 0.85, 0.55), 1.0 - e);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.4 + aSpeed) * (180.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`varying float vA; varying vec3 vC;
        void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vC * a, a); }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    world.add(pts);
  }

  // dust far behind
  {
    const N = small ? 900 : 2000;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * 600, (Math.random() - 0.5) * 300, -60 - Math.random() * 300], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, color: 0x8fa8ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
  }

  // anchors: a golden glow and a ring where all the lines meet
  const anchors = [];
  const glowTex = glowTexture('rgba(255,250,225,1)', 'rgba(255,170,60,0.55)');
  const flareTex = glowTexture('rgba(255,200,120,0.5)', 'rgba(255,110,30,0.12)');
  const ringGeo = new THREE.RingGeometry(3.6, 3.9, 64);
  const COUNT = Math.ceil((2 * W) / P) + 2;
  for (let i = 0; i < COUNT; i++) {
    const g = new THREE.Group();
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    core.scale.set(9, 9, 1);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flare.scale.set(34, 34, 1);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc65c, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.y = Math.PI / 2;
    const ring2 = ring.clone(); ring2.material = ring.material.clone(); ring2.scale.setScalar(1.8); ring2.material.opacity = 0.25;
    g.add(flare, core, ring, ring2);
    world.add(g);
    anchors.push({ g, ring, ring2, core });
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.15, 0.65, 0.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { mouse.tx = e.clientX / innerWidth - 0.5; mouse.ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  let running = true, raf = 0, last = performance.now(), time = 0;
  const frame = (now) => {
    raf = running ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    time += reduced ? dt * 0.15 : dt;
    uniforms.uTime.value = time;
    mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
    world.rotation.y = -0.35 + mouse.x * 0.5;
    world.rotation.x = 0.12 + mouse.y * 0.25;
    camera.position.y = 10 - mouse.y * 12;
    camera.lookAt(0, 0, 0);
    // the anchors stream with the lines: an anchor sits where (x + time * SPEED) is a multiple of P
    const off = ((time * SPEED) % P + P) % P;
    anchors.forEach((a, i) => {
      const x = -W - P + i * P + (P - off);
      a.g.position.set(x, 0, 0);
      const fade = Math.max(0, 1 - Math.abs(x) / W);
      const pulse = 1 + 0.12 * Math.sin(time * 3 + i);
      a.core.material.opacity = fade; a.ring.material.opacity = 0.7 * fade; a.ring2.material.opacity = 0.25 * fade;
      a.ring.scale.setScalar(pulse); a.ring2.scale.setScalar(1.8 + 0.4 * ((time * 0.6 + i * 0.3) % 1));
      a.g.children[0].material.opacity = fade;
    });
    composer.render();
  };
  raf = requestAnimationFrame(frame);
  return {
    pause() { running = false; cancelAnimationFrame(raf); raf = 0; },
    resume() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
  };
}
