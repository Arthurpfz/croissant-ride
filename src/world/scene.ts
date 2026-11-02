// World: renderer, chase camera and the active skin over the active route. Bloom only for skins that ask for it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { route, setRoute } from './route';
import { terrainOf, type RouteData, type SkinData } from './packs';
import { buildSkin, type BuiltSkin } from './skin';
import { token } from '../tokens';

export function createWorld(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 50000); // far enough for the peaks round a real col
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3(), roadPos = new THREE.Vector3();
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let first = true;

  // fog and lights are reused across skins (three.js caches per-light uniforms for good); the sun follows the rider
  // so its small shadow box always covers them
  const fog = new THREE.Fog(0);
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  const sunFrom = new THREE.Vector3();
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 120 });
  scene.add(hemi, sun, sun.target);
  scene.fog = fog;
  scene.background = new THREE.Color();
  let built: BuiltSkin;
  let target: SkinData; // the skin on screen, or being faded in
  let composer: EffectComposer | undefined, bloom: UnrealBloomPass | undefined;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // clicks on the world go to clickable props (userData.click)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2), camera);
    for (const t of built.targets) if (ray.intersectObject(t).length) t.userData.click();
  });

  // swap in a route + skin (after the route's terrain has loaded); the old skin's meshes, materials and textures are freed
  async function show(r: RouteData, s: SkinData) {
    target = s;
    const grids = await terrainOf(r);
    if (route?.data !== r) first = true; // camera jumps instead of gliding across the map
    setRoute(r);
    if (built) { scene.remove(built.group); built.dispose(); }
    built = buildSkin(s, route, renderer, grids);
    scene.add(built.group);
    const l = s.light;
    fog.color.set(s.fog.color); fog.near = s.fog.near; fog.far = s.fog.far;
    (scene.background as THREE.Color).set(s.fog.color);
    hemi.color.set(l.sky); hemi.groundColor.set(l.ground); hemi.intensity = l.ambient;
    sun.color.set(l.sun); sun.intensity = l.sunIntensity; sunFrom.set(...l.sunFrom);
    if (s.bloom && !composer) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass((bloom = new UnrealBloomPass(new THREE.Vector2(canvas.clientWidth, canvas.clientHeight), 1, 0, 0)));
      composer.addPass(new OutputPass());
    }
    if (s.bloom) Object.assign(bloom!, s.bloom);
  }

  // mid-ride skin switch behind a short fade; the ride loop runs on its own timer, so nothing else pauses.
  // Presses during the fade just retarget it.
  let switching = false;
  async function switchSkin(s: SkinData) {
    target = s;
    if (switching) return;
    switching = true;
    const fade = parseFloat(token('motion-fade')) * 1000;
    canvas.classList.add('fading');
    await new Promise((r) => setTimeout(r, fade));
    if (built.skin !== target) await show(route.data, target);
    renderer.compile(scene, camera);
    canvas.classList.remove('fading');
    switching = false;
  }

  return {
    renderer, show, switchSkin,
    get skin() { return target; },
    render(dt: number, distance: number, cadence: number, speed: number, effort: number) {
      if (!built) return; // first skin still loading
      const { rider } = built;
      const { pos: q, tangent } = route.pose(distance, roadPos);
      side.crossVectors(tangent, up).setY(0).normalize();
      const at = q.clone().addScaledVector(side, 1.6).setY(q.y + 0.12);
      rider.group.position.copy(at);
      rider.group.lookAt(tmp.copy(at).add(tangent));
      rider.update(dt, cadence, speed, effort);

      const flat = tangent.clone().setY(0).normalize();
      const want = at.clone().addScaledVector(flat, -4.2).add(new THREE.Vector3(0, 1.9, 0));
      if (built.groundAt) want.y = Math.max(want.y, built.groundAt(want.x, want.z) + 1.5);
      const k = first ? 1 : 1 - Math.exp(-dt * 3);
      camPos.lerp(want, k);
      look.lerp(at.clone().addScaledVector(tangent, 6).add(new THREE.Vector3(0, 1.2, 0)), k);
      first = false;
      camera.position.copy(camPos);
      camera.lookAt(look);
      built.sky.position.copy(camPos);
      built.tick(dt, at, flat, camera);

      sun.position.copy(at).add(sunFrom);
      sun.target.position.copy(at);
      if (built.skin.bloom) composer!.render(dt);
      else renderer.render(scene, camera);
    },
  };
}
