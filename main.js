import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─── RENDERER ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// ─── SCENE ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.Fog(0x0a0a1a, 12, 30);

// ─── PLAYER RIG ───────────────────────────────────────────────────────────────
// Everything the player "owns" goes in this group.
// Moving playerRig moves the player through the world.
const playerRig = new THREE.Group();
playerRig.position.set(0, 0, 2.5);
scene.add(playerRig);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
playerRig.add(camera);

renderer.xr.addEventListener('sessionstart', () => {
  // In WebXR the camera is managed by the headset, so we attach it via the XR camera
  renderer.xr.getCamera().position.set(0, 1.6, 0);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── LIGHTING ─────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x222244, 3));

const ceilingLight = new THREE.PointLight(0x4444ff, 4, 20);
ceilingLight.position.set(0, 4.5, 0);
scene.add(ceilingLight);

const al1 = new THREE.PointLight(0x00ffcc, 3, 10);
al1.position.set(-4, 2, -4);
scene.add(al1);

const al2 = new THREE.PointLight(0xff00aa, 3, 10);
al2.position.set(4, 2, -4);
scene.add(al2);

// ─── ROOM ─────────────────────────────────────────────────────────────────────
function mat(color, emissive, ei) {
  return new THREE.MeshStandardMaterial({
    color: color,
    emissive: emissive || 0x000000,
    emissiveIntensity: ei || 0,
    roughness: 0.8, metalness: 0.2
  });
}

// Floor — also used as teleport surface
const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat(0x111122));
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
floorMesh.userData.teleportable = true;
scene.add(floorMesh);

scene.add(new THREE.GridHelper(12, 24, 0x223344, 0x223344));

const ceilingMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat(0x0a0a1a));
ceilingMesh.rotation.x = Math.PI / 2;
ceilingMesh.position.y = 5;
scene.add(ceilingMesh);

[[0,2.5,-6,0,0,0],[0,2.5,6,0,Math.PI,0],[-6,2.5,0,0,Math.PI/2,0],[6,2.5,0,0,-Math.PI/2,0]]
  .forEach(c => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), mat(0x0d0d22));
    w.position.set(c[0],c[1],c[2]);
    w.rotation.set(c[3],c[4],c[5]);
    scene.add(w);
  });

function neonStrip(x, z, ry, color) {
  const s = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 4, 0.05),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 })
  );
  s.position.set(x, 2.5, z); s.rotation.y = ry; scene.add(s);
  const l = new THREE.PointLight(color, 2, 5);
  l.position.set(x, 2.5, z); scene.add(l);
}
neonStrip(-5.9,-3,0,0x00ffcc); neonStrip(-5.9,3,0,0x00ffcc);
neonStrip(5.9,-3,0,0xff00aa);  neonStrip(5.9,3,0,0xff00aa);
neonStrip(-3,-5.9,Math.PI/2,0x4444ff); neonStrip(3,-5.9,Math.PI/2,0x4444ff);

// ─── TELEPORT MARKER ──────────────────────────────────────────────────────────
const teleportMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.25, 0.4, 32),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
);
teleportMarker.rotation.x = -Math.PI / 2;
teleportMarker.position.y = 0.02;
teleportMarker.visible = false;
scene.add(teleportMarker);

// Dashed arc line for teleport
const arcPoints = [];
for (let i = 0; i <= 20; i++) arcPoints.push(new THREE.Vector3());
const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
const arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0x00ffcc }));
arcLine.visible = false;
scene.add(arcLine);

// ─── GAME STATE ───────────────────────────────────────────────────────────────
const state = {
  phase: 'waiting',
  score: 0, timeLeft: 30,
  activeTarget: null, hitsLeft: 8,
  collectible: null, grabbed: null, grabbingController: null,
  goalZone: null,
  teleporting: false, teleportTarget: new THREE.Vector3(),
};

// ─── HUD ──────────────────────────────────────────────────────────────────────
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 128;
const hudCtx = hudCanvas.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudCanvas);
const hudMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2.5, 0.6),
  new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
);
hudMesh.position.set(0, 3.6, -5.4);
scene.add(hudMesh);

function updateHUD() {
  hudCtx.clearRect(0, 0, 512, 128);
  hudCtx.fillStyle = 'rgba(0,10,30,0.88)';
  hudCtx.beginPath();
  hudCtx.roundRect(4, 4, 504, 120, 14);
  hudCtx.fill();
  hudCtx.strokeStyle = '#00ffcc55';
  hudCtx.lineWidth = 2;
  hudCtx.stroke();

  hudCtx.font = 'bold 36px Arial';
  hudCtx.fillStyle = '#00ffcc';
  hudCtx.textAlign = 'left';
  hudCtx.fillText('Score: ' + state.score, 20, 52);
  hudCtx.fillStyle = state.timeLeft <= 10 ? '#ff4444' : '#ffffff';
  hudCtx.textAlign = 'right';
  hudCtx.fillText(state.timeLeft + 's', 492, 52);

  hudCtx.font = '18px Arial';
  hudCtx.fillStyle = '#aaaacc';
  hudCtx.textAlign = 'center';
  const msgs = {
    waiting:     'SPACE / green button to start  |  GRIP to teleport',
    targetGame:  'Hit glowing target! (' + state.hitsLeft + ' left)  [T key test]  GRIP=teleport',
    collectGame: 'Grab orb (trigger) -> carry to green GOAL ring  |  GRIP=teleport',
    finished:    'DONE! Score: ' + state.score + '  —  SPACE or button to replay',
  };
  hudCtx.fillText(msgs[state.phase] || '', 256, 104);
  hudTex.needsUpdate = true;
}

// ─── TARGETS ──────────────────────────────────────────────────────────────────
const targets = [];
const interactables = [];

[[-3,1.5,-4.5],[0,2.2,-5],[3,1.5,-4.5],[-1.8,1.0,-4.2],[1.8,1.0,-4.2]].forEach((pos, i) => {
  const g = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.0, 8),
    new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.4, metalness: 0.8 })
  );
  base.position.y = -0.5;
  g.add(base);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x001122, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.7 })
  );
  sphere.userData.type = 'target';
  sphere.userData.groupRef = g;
  g.add(sphere);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.035, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x4488aa, emissive: 0x004466, emissiveIntensity: 1, metalness: 0.9 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  g.position.set(...pos);
  g.userData.sphere = sphere;

  const light = new THREE.PointLight(0x00ffff, 0, 3);
  light.position.set(...pos);
  scene.add(light);
  g.userData.light = light;

  scene.add(g);
  targets.push(g);
  interactables.push(sphere);
});

function activateTarget() {
  targets.forEach(t => {
    t.userData.sphere.material.color.set(0x223344);
    t.userData.sphere.material.emissive.set(0x001122);
    t.userData.sphere.material.emissiveIntensity = 0.5;
    t.userData.light.intensity = 0;
  });
  const t = targets[Math.floor(Math.random() * targets.length)];
  t.userData.sphere.material.color.set(0x00ffff);
  t.userData.sphere.material.emissive.set(0x00ffff);
  t.userData.sphere.material.emissiveIntensity = 3;
  t.userData.light.intensity = 3;
  state.activeTarget = t;
}

function deactivateAllTargets() {
  targets.forEach(t => {
    t.userData.sphere.material.color.set(0x223344);
    t.userData.sphere.material.emissive.set(0x001122);
    t.userData.sphere.material.emissiveIntensity = 0.5;
    t.userData.light.intensity = 0;
  });
  state.activeTarget = null;
}

// ─── CONSOLE ──────────────────────────────────────────────────────────────────
const consoleGroup = new THREE.Group();
consoleGroup.position.set(0, 0, 2.2);

const consoleBody = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 1.0, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x1a1a3a, roughness: 0.3, metalness: 0.8 })
);
consoleBody.position.y = 0.5;
consoleGroup.add(consoleBody);

consoleGroup.add(Object.assign(new THREE.Mesh(
  new THREE.BoxGeometry(1.0, 0.55, 0.04),
  new THREE.MeshStandardMaterial({ color: 0x001133, emissive: 0x002266, emissiveIntensity: 1 })
), { position: new THREE.Vector3(0, 0.72, 0.24) }));

const startBtn = new THREE.Mesh(
  new THREE.CylinderGeometry(0.14, 0.14, 0.08, 32),
  new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 2, roughness: 0.2 })
);
startBtn.position.set(0, 0.37, 0.27);
startBtn.userData.type = 'startButton';
consoleGroup.add(startBtn);

[-0.4, 0.4].forEach(x => {
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x334466, metalness: 0.9 })
  );
  leg.position.set(x, 0, 0);
  consoleGroup.add(leg);
});

scene.add(consoleGroup);
interactables.push(startBtn);  // after scene.add

const consoleLightGlow = new THREE.PointLight(0x00ff88, 2, 4);
consoleLightGlow.position.set(0, 0.8, 2.2);
scene.add(consoleLightGlow);

function makeLabel(text, color) {
  color = color || 0xffffff;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 26px Arial';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 44);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.25),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  return mesh;
}

const lbl = makeLabel('PRESS TO START', 0x00ff88);
lbl.position.set(0, 0.72, 0.27);
consoleGroup.add(lbl);

// ─── COLLECT GAME ─────────────────────────────────────────────────────────────
function createCollectGame() {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 3, roughness: 0.1, metalness: 0.8 })
  );
  orb.position.set(0, 1.3, -4.5);
  orb.userData.type = 'collectible';
  scene.add(orb);
  state.collectible = orb;
  interactables.push(orb);

  const orbLight = new THREE.PointLight(0xff6600, 4, 3);
  orbLight.position.copy(orb.position);
  scene.add(orbLight);
  orb.userData.light = orbLight;

  const laserMat = new THREE.MeshStandardMaterial({ color: 0xff0044, emissive: 0xff0044, emissiveIntensity: 2, transparent: true, opacity: 0.75 });
  [[-1.2,1.0,-2.5,1.8],[1.2,1.6,-3.0,1.8],[0,0.7,-3.5,2.2]].forEach(o => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(o[3], 0.08, 0.08), laserMat);
    bar.position.set(o[0],o[1],o[2]);
    scene.add(bar);
    const bl = new THREE.PointLight(0xff0044, 2, 2.5);
    bl.position.set(o[0],o[1],o[2]);
    scene.add(bl);
  });

  const goalRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.07, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 3 })
  );
  goalRing.rotation.x = -Math.PI / 2;
  goalRing.position.set(0, 0.02, 1.2);
  scene.add(goalRing);
  state.goalZone = goalRing;

  const gl = makeLabel('GOAL', 0x00ff88);
  gl.position.set(0, 0.7, 1.2);
  scene.add(gl);
  const gpl = new THREE.PointLight(0x00ff88, 3, 3);
  gpl.position.set(0, 0.5, 1.2);
  scene.add(gpl);
}

// ─── CONTROLLERS ──────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllerModelFactory = new XRControllerModelFactory();

// Teleport state per controller
const teleportState = { active: false, controller: null };

function buildController(index) {
  const controller = renderer.xr.getController(index);
  playerRig.add(controller);  // ADD TO playerRig not scene — so teleport moves controllers too

  const grip = renderer.xr.getControllerGrip(index);
  grip.add(controllerModelFactory.createControllerModel(grip));
  playerRig.add(grip);        // same — attach to rig

  // Interaction ray (right/index 0)
  const interactRay = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-3)]),
    new THREE.LineBasicMaterial({ color: 0x00ffcc })
  );
  controller.add(interactRay);
  controller.userData.interactRay = interactRay;

  // Trigger → interact
  controller.addEventListener('selectstart', () => onTriggerDown(controller));
  controller.addEventListener('selectend',   () => onTriggerUp(controller));

  // Grip → teleport
  controller.addEventListener('squeezestart', () => onGripDown(controller));
  controller.addEventListener('squeezeend',   () => onGripUp(controller));

  return controller;
}

const controller1 = buildController(0);
const controller2 = buildController(1);

// ─── TELEPORT ARC ─────────────────────────────────────────────────────────────
const _tempVec = new THREE.Vector3();
const _tempPos = new THREE.Vector3();
const _gravity = new THREE.Vector3(0, -9.8, 0);

function updateTeleportArc(controller) {
  // Parabolic arc from controller forward
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3(0, 0, -1);

  controller.getWorldPosition(origin);
  direction.applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));

  const velocity = direction.multiplyScalar(8);
  const pts = arcPoints;
  const dt = 0.08;
  let hit = false;

  let p = origin.clone();
  let v = velocity.clone();

  for (let i = 0; i < pts.length; i++) {
    pts[i].copy(p);
    v.addScaledVector(_gravity, dt);
    p.addScaledVector(v, dt);

    // Floor check
    if (p.y <= 0.01 && i > 1) {
      pts[i].copy(p);
      pts[i].y = 0.02;
      // trim remaining
      for (let j = i + 1; j < pts.length; j++) pts[j].copy(pts[i]);
      state.teleportTarget.copy(pts[i]);
      state.teleportTarget.y = 0;
      teleportMarker.position.set(state.teleportTarget.x, 0.02, state.teleportTarget.z);
      teleportMarker.visible = true;
      hit = true;
      break;
    }
  }

  if (!hit) teleportMarker.visible = false;

  arcGeo.setFromPoints(pts);
  arcGeo.attributes.position.needsUpdate = true;
  arcLine.visible = true;
}

function hideTeleportArc() {
  arcLine.visible = false;
  teleportMarker.visible = false;
}

function doTeleport() {
  if (!teleportMarker.visible) return;
  // Offset by current camera XZ position within the rig so the player lands at the marker
  const camOffset = new THREE.Vector3();
  camera.getWorldPosition(camOffset);
  const rigPos = playerRig.position;
  camOffset.sub(rigPos); // local camera offset
  camOffset.y = 0;

  playerRig.position.x = state.teleportTarget.x - camOffset.x;
  playerRig.position.z = state.teleportTarget.z - camOffset.z;
}

// ─── INPUT HANDLERS ───────────────────────────────────────────────────────────
function castFrom(controller, objs) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  return raycaster.intersectObjects(objs, false);
}

function flashHit(sphere, ok) {
  sphere.material.color.set(ok ? 0xffffff : 0xff2200);
  setTimeout(() => sphere.material.color.set(ok ? 0x00ffff : 0x223344), 250);
}

function onTriggerDown(controller) {
  // Grab orb
  if (state.phase === 'collectGame' && state.collectible && !state.grabbed) {
    const hit = castFrom(controller, [state.collectible]);
    if (hit.length) {
      state.grabbed = state.collectible;
      state.grabbingController = controller;
      controller.attach(state.collectible);
      if (state.collectible.userData.light) state.collectible.userData.light.intensity = 0;
      return;
    }
  }

  const hits = castFrom(controller, interactables);
  if (!hits.length) return;
  const obj = hits[0].object;

  if (obj.userData.type === 'startButton') {
    if (state.phase === 'waiting' || state.phase === 'finished') startGame();
    return;
  }

  if (state.phase === 'targetGame' && obj.userData.type === 'target') {
    const group = obj.userData.groupRef;
    if (group === state.activeTarget) {
      state.score += 10; state.hitsLeft--;
      flashHit(obj, true);
      if (state.hitsLeft <= 0) setTimeout(startCollectGame, 400);
      else setTimeout(activateTarget, 300);
    } else {
      state.score = Math.max(0, state.score - 5);
      flashHit(obj, false);
    }
  }
}

function onTriggerUp(controller) {
  if (state.grabbed && state.grabbingController === controller) {
    scene.attach(state.grabbed);
    if (state.grabbed.userData.light) {
      state.grabbed.userData.light.position.copy(state.grabbed.position);
      state.grabbed.userData.light.intensity = 4;
    }
    state.grabbed = null;
    state.grabbingController = null;
  }
}

function onGripDown(controller) {
  teleportState.active = true;
  teleportState.controller = controller;
}

function onGripUp(controller) {
  if (teleportState.active && teleportState.controller === controller) {
    doTeleport();
    hideTeleportArc();
    teleportState.active = false;
    teleportState.controller = null;
  }
}

// ─── GAME FLOW ────────────────────────────────────────────────────────────────
let timerInterval = null;

function startGame() {
  clearInterval(timerInterval);
  state.score = 0; state.timeLeft = 30; state.hitsLeft = 8;
  state.phase = 'targetGame';
  state.grabbed = null; state.grabbingController = null;
  state.collectible = null; state.goalZone = null;

  startBtn.material.color.set(0x223344);
  startBtn.material.emissive.set(0x223344);
  startBtn.material.emissiveIntensity = 0.3;

  activateTarget();
  timerInterval = setInterval(() => {
    if (state.phase !== 'targetGame') return;
    state.timeLeft--;
    if (state.timeLeft <= 0) startCollectGame();
  }, 1000);
}

function startCollectGame() {
  clearInterval(timerInterval);
  deactivateAllTargets();
  state.phase = 'collectGame';
  state.timeLeft = 25;
  createCollectGame();
  timerInterval = setInterval(() => {
    if (state.phase !== 'collectGame') return;
    state.timeLeft--;
    if (state.timeLeft <= 0) endGame();
  }, 1000);
}

function endGame() {
  clearInterval(timerInterval);
  state.phase = 'finished';
  deactivateAllTargets();
  startBtn.material.color.set(0x00ff88);
  startBtn.material.emissive.set(0x00ff88);
  startBtn.material.emissiveIntensity = 2;
}

function checkGoal() {
  if (state.phase !== 'collectGame' || !state.collectible || !state.goalZone) return;
  if (state.grabbed === state.collectible) return;
  if (state.collectible.position.distanceTo(state.goalZone.position) < 0.7) {
    state.score += 30;
    endGame();
  }
}

// ─── KEYBOARD (desktop testing) ───────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (state.phase === 'waiting' || state.phase === 'finished') startGame(); }
  if (e.code === 'KeyT' && state.phase === 'targetGame' && state.activeTarget) {
    state.score += 10; state.hitsLeft--;
    flashHit(state.activeTarget.userData.sphere, true);
    if (state.hitsLeft <= 0) setTimeout(startCollectGame, 400);
    else setTimeout(activateTarget, 300);
  }
  if (e.code === 'KeyG' && state.phase === 'collectGame' && state.collectible && state.goalZone) {
    state.collectible.position.copy(state.goalZone.position);
    state.collectible.position.y = 0.5;
  }
  // WASD to move player on desktop (no VR)
  const spd = 0.3;
  if (e.code === 'KeyW') playerRig.position.z -= spd;
  if (e.code === 'KeyS') playerRig.position.z += spd;
  if (e.code === 'KeyA') playerRig.position.x -= spd;
  if (e.code === 'KeyD') playerRig.position.x += spd;
});

// ─── ANIMATION LOOP ───────────────────────────────────────────────────────────
let lastHUD = 0;
const clock = new THREE.Clock();

renderer.setAnimationLoop(time => {
  const delta = clock.getDelta();

  // Update teleport arc while grip held
  if (teleportState.active && teleportState.controller) {
    updateTeleportArc(teleportState.controller);
  }

  // Pulse active target
  if (state.activeTarget) {
    const p = 2 + Math.sin(time * 0.005) * 1.2;
    state.activeTarget.userData.sphere.material.emissiveIntensity = p;
    state.activeTarget.userData.light.intensity = p;
  }

  // Pulse start button
  if (state.phase === 'waiting' || state.phase === 'finished') {
    const p = 1.5 + Math.sin(time * 0.004) * 1;
    startBtn.material.emissiveIntensity = p;
    consoleLightGlow.intensity = p;
  }

  // Spin orb
  if (state.collectible && state.phase === 'collectGame') {
    state.collectible.rotation.y += delta * 2;
    state.collectible.material.emissiveIntensity = 2.5 + Math.sin(time * 0.006) * 1.5;
    if (state.grabbed !== state.collectible && state.collectible.userData.light)
      state.collectible.userData.light.position.copy(state.collectible.position);
  }
  if (state.grabbed && state.grabbed.userData && state.grabbed.userData.light)
    state.grabbed.userData.light.position.copy(state.grabbed.position);

  checkGoal();

  if (time - lastHUD > 150) { updateHUD(); lastHUD = time; }

  renderer.render(scene, camera);
});

// ─── GLTF (uncomment once Blender models are ready) ───────────────────────────
// const loader = new GLTFLoader();
// loader.load('./models/target_pillar.glb', gltf => { gltf.scene.position.set(0,0,-4); scene.add(gltf.scene); });
// loader.load('./models/control_console.glb', gltf => { gltf.scene.position.set(0,0,2.2); scene.add(gltf.scene); });
