// MAC0623 — A1 Desktop Docking Testbed — STARTER
//
// Provided: scene setup, target-pose generation, the tolerance check, the
// trial state machine, and the CSV logger/downloader.
//
// You implement: the control mapping(s) that move/rotate the cube in
// response to input. Everything you need to touch is inside blocks marked
//   // ===== STUDENT TODO ===== ... // ===== END STUDENT TODO =====
// Do not need to touch anything outside those blocks to get a working
// baseline mapping — but you may, if your design requires it (e.g. extra
// HUD state for a second input mode). If you do, note it in your README.

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Module-scope state — provided
//
// Populated once, by main() (via buildScene() for scene/cube/target), before
// any trial starts or any frame renders. Everything below this point —
// generateTargetPose(), checkTolerance(), updateControlMapping(), animate()
// — reads and writes these directly, the same way it would if they were
// still declared inline where they're first used.
// ---------------------------------------------------------------------------

let scene, camera, renderer, cube, target;

/**
 * buildScene()
 *
 * Builds the static contents of the 3D scene: background color, lighting,
 * the reference grid/axes, the student-controlled cube, and the translucent
 * target mesh (the goal pose). Does not create the camera or renderer —
 * that's main()'s job — and does not start the render loop.
 *
 * Pure with respect to the rest of the app: it only touches the THREE.Scene
 * it creates and returns, so it's safe to read top-to-bottom on its own.
 *
 * @returns {{ scene: THREE.Scene, cube: THREE.Mesh, target: THREE.Mesh }}
 *   The new scene, plus direct references to the two meshes the rest of the
 *   app needs: `cube` (control mappings write to `cube.position` /
 *   `cube.quaternion`) and `target` (`generateTargetPose()` writes to it
 *   every trial).
 */
function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  scene.add(new THREE.GridHelper(6, 24, 0x444444, 0x2a2a2a));
  scene.add(new THREE.AxesHelper(0.6));

  // Cube (student-controlled) and target (goal pose) share one geometry —
  // the target clones it so the two meshes can have independent materials
  // (opaque vs. translucent) without sharing a single Mesh instance.
  const cubeGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);

  // Define 6 distinct colors for the 6 box faces
  const faceColors = [
    0xffffff, // White
    0xffff33, // Yellow 
    0x3388ff, // Blue
    0x33ff33, // Green 
    0xff3333, // Red
    0xffa500, // Orange
  ];

  // Material array for the solid cube
  const cubeMaterials = faceColors.map(
    (color) => new THREE.MeshStandardMaterial({ color })
  );

  // Material array for the translucent target mesh
  const targetMaterials = faceColors.map(
    (color) =>
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
  );

  const cube = new THREE.Mesh(cubeGeometry, cubeMaterials);
  cube.position.set(0, 0.5, 0);
  scene.add(cube);

  const target = new THREE.Mesh(cubeGeometry.clone(), targetMaterials);
  scene.add(target);

  return { scene, cube, target };
}

/**
 * main()
 *
 * Entry point for the whole app. Order matters here:
 *   1. Build the scene (`buildScene()`) — cube and target must exist before
 *      anything below tries to read their position/quaternion.
 *   2. Create the camera and renderer, and wire the window resize handler.
 *   3. Start the trial state machine (`startTrial()`), which generates the
 *      first target pose.
 *   4. Start the render loop (`animate()`).
 *
 * Called once, at the bottom of this file. Everything it sets up
 * (`scene`, `camera`, `renderer`, `cube`, `target`) is written into the
 * module-scope variables declared above, so the rest of the file can keep
 * referring to them as plain names instead of threading them through every
 * function call.
 */
function main() {
  ({ scene, cube, target } = buildScene());
    // Save the cube's original color so we can restore it on mouseup.
    if (cube && Array.isArray(cube.material)) {
      cube.userData.originalColors = cube.material.map((mat) => mat.color.clone());
    }

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.05,
    100
  );
  camera.position.set(0, 1.4, 4);
  camera.lookAt(0, 0.5, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  // document.addEventListener("wheel", (e) => {
  //   if (mode === "translate") {
  //     cube.position.z += e.deltaY * 0.01; // Adjust the multiplier for sensitivity
  //   }

  window.addEventListener("resize", handleWindowResize);

  startTrial();
  animate();
}

/**
 * handleWindowResize()
 *
 * Keeps the camera's aspect ratio and the renderer's output size in sync
 * with the browser window. Registered as the "resize" listener in main().
 */
function handleWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------------
// Target-pose generation — provided
//
// Uses Shoemake's algorithm for a uniformly-random unit quaternion (uniform
// over SO(3)), rather than converting random Euler angles, which would bias
// the sampled orientations. Position is uniform within a bounding box in
// front of the camera.
// ---------------------------------------------------------------------------

function randomQuaternionShoemake() {
  const u1 = Math.random();
  const u2 = Math.random();
  const u3 = Math.random();

  const sqrt1MinusU1 = Math.sqrt(1 - u1);
  const sqrtU1 = Math.sqrt(u1);

  const theta1 = 2 * Math.PI * u2;
  const theta2 = 2 * Math.PI * u3;

  return new THREE.Quaternion(
    sqrt1MinusU1 * Math.sin(theta1),
    sqrt1MinusU1 * Math.cos(theta1),
    sqrtU1 * Math.sin(theta2),
    sqrtU1 * Math.cos(theta2)
  );
}

const TARGET_BOUNDS = {
  x: [-1.0, 1.0],
  y: [0.2, 1.6],
  z: [-0.6, 0.6],
};

function randomInRange([min, max]) {
  return min + Math.random() * (max - min);
}

function generateTargetPose() {
  target.position.set(
    randomInRange(TARGET_BOUNDS.x),
    randomInRange(TARGET_BOUNDS.y),
    randomInRange(TARGET_BOUNDS.z)
  );
  target.quaternion.copy(randomQuaternionShoemake());
}

// ---------------------------------------------------------------------------
// Tolerance check — provided
//
// Position tolerance: 0.05 units (world units == meters, at this scene
// scale). Orientation tolerance: 10 degrees, measured via
// Quaternion.angleTo(), which is robust to double-cover (q and -q represent
// the same rotation) — do not compute orientation error from Euler angles.
// ---------------------------------------------------------------------------

const POSITION_TOLERANCE = 0.05;
const ORIENTATION_TOLERANCE_DEG = 10;

function checkTolerance() {
  const positionError = cube.position.distanceTo(target.position);
  const orientationErrorRad = cube.quaternion.angleTo(target.quaternion);
  const orientationErrorDeg = THREE.MathUtils.radToDeg(orientationErrorRad);

  const withinTolerance =
    positionError <= POSITION_TOLERANCE &&
    orientationErrorDeg <= ORIENTATION_TOLERANCE_DEG;

  return { positionError, orientationErrorDeg, withinTolerance };
}

// ---------------------------------------------------------------------------
// HUD references — provided
// ---------------------------------------------------------------------------

const participantIdInput = document.getElementById("participantId");
const mappingSelect = document.getElementById("mappingSelect");
const trialCountEl = document.getElementById("trialCount");
const confirmBtn = document.getElementById("confirmBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");

// ---------------------------------------------------------------------------
// Trial state machine — provided
//
// presentation_order counts trials within the *current* mapping selection
// since the page loaded — it does not reset when you switch mapping in the
// dropdown mid-session, since order-of-presentation across mappings is part
// of what you're counterbalancing across participants (see A1's ABBA
// counterbalancing note). trial_number is a simple running counter of every
// trial confirmed this session, regardless of mapping.
// ---------------------------------------------------------------------------

let trialNumber = 0;
let presentationOrderByMapping = { 1: 0, 2: 0 };
let trialStartTime = performance.now();
let pathLength = 0; // accumulated cube-position travel distance this trial
// Placeholder — cube doesn't exist yet at module-load time (main() creates
// it via buildScene()). startTrial() calls lastCubePosition.copy(cube.position)
// before this value is ever read, so the zero vector here is never used.
let lastCubePosition = new THREE.Vector3();

// ===== STUDENT TODO =====
// Increment this from your own mapping code every time the user switches
// input mode (e.g. toggling translate/rotate mode in the baseline mapping).
// It is read (and reset) when a trial is confirmed.
let modeSwitches = 0;
let mode = "translate";

// Variáveis de "Memória" (Estado do Input)
const mouse = new THREE.Vector2();
const mouseDelta = new THREE.Vector2();
let isMouseDown = false;
let justClicked = false;
let justReleased = false;
let scrollDelta = 0;

// Variáveis para a matemática do arrasto (Raycaster)
const raycaster = new THREE.Raycaster();
const dragPlane = new THREE.Plane();
const planeIntersection = new THREE.Vector3();
const clickOffset = new THREE.Vector3();
let isDragging = false;

const ROT_SCALE = 3.0;        // Para X e Y do mouse (dx, dy)
const Z_ROT_SCALE = 0.02;     // Para Z (Scroll no modo Rotate)
const Z_TRANS_SCALE = 0.002;  // Para Z (Scroll no modo Translate)

// Variáveis de controle do teclado
const keys = {
  w: false, s: false,
  a: false, d: false,
  q: false, e: false
};

// ===== END STUDENT TODO =====

const rows = [];
const CSV_HEADER = [
  "participant_id",
  "mapping",
  "trial_number",
  "presentation_order",
  "completion_time_s",
  "final_position_error",
  "final_orientation_error_deg",
  "mode_switches",
  "path_length",
];

function currentMapping() {
  return mappingSelect.value;
}

function startTrial() {
  trialStartTime = performance.now();
  pathLength = 0;
  lastCubePosition.copy(cube.position);
  modeSwitches = 0;
  generateTargetPose();
  trialCountEl.textContent = `Trial ${trialNumber + 1}`;
}

function confirmTrial() {
  const { positionError, orientationErrorDeg } = checkTolerance();
  const completionTimeS = (performance.now() - trialStartTime) / 1000;
  const mapping = currentMapping();

  trialNumber += 1;
  presentationOrderByMapping[mapping] = (presentationOrderByMapping[mapping] || 0) + 1;

  rows.push({
    participant_id: participantIdInput.value.trim() || "UNKNOWN",
    mapping,
    trial_number: trialNumber,
    presentation_order: presentationOrderByMapping[mapping],
    completion_time_s: completionTimeS.toFixed(3),
    final_position_error: positionError.toFixed(4),
    final_orientation_error_deg: orientationErrorDeg.toFixed(2),
    mode_switches: modeSwitches,
    path_length: pathLength.toFixed(4),
  });

  startTrial();
}

confirmBtn.addEventListener("click", confirmTrial);
document.addEventListener("keydown", handleKeydown);
document.addEventListener("keyup", handleKeyup);
document.addEventListener("pointermove", onMouseMove);
document.addEventListener("pointerdown", onMouseDown);
document.addEventListener("pointerup", onMouseUp)
document.addEventListener("wheel", onWheelChange);

function onMouseMove(event) {
  const nx = (event.clientX / window.innerWidth) * 2 - 1;
  const ny = -(event.clientY / window.innerHeight) * 2 + 1;
  
  mouseDelta.x = nx - mouse.x;
  mouseDelta.y = ny - mouse.y;
  
  mouse.x = nx;
  mouse.y = ny;
};

function onMouseDown(event) {
  isMouseDown = true;
  justClicked = true;
};

function onMouseUp(event) {
  isMouseDown = false;
  justReleased = true;
};

function onWheelChange(event) {
  scrollDelta = event.deltaY;
};

/**
 * handleKeydown(e)
 *
 * Keyboard shortcut for Confirm: Enter does the same thing as clicking
 * #confirmBtn. Registered as the "keydown" listener above.
 */
function handleKeydown(e) {
  if (e.key === "Enter") confirmTrial();
  else if (e.code === "Tab" || e.code === "Space") {
    e.preventDefault();
    modeSwitches += 1;
    mode = mode === "translate" ? "rotate" : "translate";
    console.log(`Mode switched to: ${mode}`);
  
  }
  const key = e.key.toLowerCase();
  keys[key] = true;
}

function handleKeyup(e) {
  const key = e.key.toLowerCase();
  keys[key] = false;
}

// ---------------------------------------------------------------------------
// CSV download — provided
// ---------------------------------------------------------------------------

function buildCsv() {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      CSV_HEADER.map(function (key) {
        return row[key];
      }).join(",")
    );
  }
  return lines.join("\n");
}

downloadBtn.addEventListener("click", handleDownloadClick);

/**
 * handleDownloadClick()
 *
 * Builds the CSV from `rows` (via buildCsv()), then triggers a browser
 * download through a temporary Blob URL and an off-DOM `<a>` click.
 * Registered as the "click" listener on #downloadBtn above.
 */
function handleDownloadClick() {
  const csv = buildCsv();
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const pid = participantIdInput.value.trim() || "UNKNOWN";
  a.href = url;
  a.download = `a1_${pid}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Status indicator — provided
// ---------------------------------------------------------------------------

function updateStatus() {
  const { positionError, orientationErrorDeg, withinTolerance } = checkTolerance();
  statusEl.textContent = `dPos ${positionError.toFixed(3)} | dRot ${orientationErrorDeg.toFixed(1)}deg`;
  statusEl.classList.toggle("in-tolerance", withinTolerance);
}

// ---------------------------------------------------------------------------
// Control mapping — STUDENT TODO
//
// updateControlMapping(delta) is called once per animation frame. This is
// where mouse/keyboard input should translate into changes to cube.position
// and cube.quaternion. The baseline mapping (mapping "1") is the translate-rotation
// toggled by TAB/Spacebar.
// Mapping "2" is your own design.
//
// Whatever you build:
//   - Read currentMapping() to branch between mapping 1 and mapping 2.
//   - Update cube.position / cube.quaternion directly.
//   - Increment modeSwitches whenever the user changes input mode.
//   - Accumulate pathLength (see the render loop below, which already does
//     this generically by measuring cube.position deltas frame-to-frame —
//     you likely don't need to touch that part).
//
// ===== STUDENT TODO =====

// Nothing here moves the cube yet, so it will sit still on load. Wire up
// your own mouse/keyboard listeners (mousemove, keydown/keyup, etc.) above
// this function as needed, and drive cube.position / cube.quaternion from
// updateControlMapping() below.

function updateControlMapping(delta) {
  const mapping = currentMapping();

  if (mapping === "1") {
    // TODO: baseline mode-switched translate/rotate mapping. 
    // NOTE: input listeners must be registered once (outside this
    // per-frame function). Read `mode` and other input state here and
    // apply movements to `cube.position` / `cube.quaternion`.
    handleMapping1(delta);
  } else {
    // TODO: your own mapping design for mapping "2".
    handleMapping2(delta);
  }

  // Reset variables
  justClicked = false;
  justReleased = false;
  scrollDelta = 0;
  mouseDelta.set(0, 0);
}

const highlightColor = new THREE.Color(0xffffff);

function highlightCubeFaces() {
  cube.material.forEach((mat, idx) => {
    const origColor = cube.userData.originalColors[idx];
    mat.color.copy(origColor).lerp(highlightColor, 0.4);
  });
}

function restoreCubeFaces() {
  cube.material.forEach((mat, idx) => {
    mat.color.copy(cube.userData.originalColors[idx]);
  });
}

function checkDragStart() {
  if (!justClicked) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(cube);
  
  if (intersects.length > 0) {
    isDragging = true;
    highlightCubeFaces();

    // Cria o plano de colisão paralelo à câmera
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    dragPlane.setFromNormalAndCoplanarPoint(cameraDirection.negate(), cube.position);

    if (raycaster.ray.intersectPlane(dragPlane, planeIntersection)) {
      clickOffset.copy(planeIntersection).sub(cube.position);
    }
  }
}

function checkDragEnd() {
  if (justReleased && isDragging) {
    isDragging = false;
    restoreCubeFaces();
  }
}

function applyMouseTranslationXY() {
  raycaster.setFromCamera(mouse, camera);
  if (raycaster.ray.intersectPlane(dragPlane, planeIntersection)) {
    cube.position.x = planeIntersection.x - clickOffset.x;
    cube.position.y = planeIntersection.y - clickOffset.y;
  }
}

function applyMouseRotationXY() {
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

  const dx = mouseDelta.x;
  const dy = mouseDelta.y;
  
  const qX = new THREE.Quaternion().setFromAxisAngle(cameraUp, dx * ROT_SCALE);
  const qY = new THREE.Quaternion().setFromAxisAngle(cameraRight, -dy * ROT_SCALE);
  const qChange = new THREE.Quaternion().multiplyQuaternions(qX, qY);

  cube.quaternion.premultiply(qChange);
}

function applyKeyboardRotation(delta) {
  const rotSpeed = 2.0 * delta;

  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);

  const qX = new THREE.Quaternion();
  const qY = new THREE.Quaternion();
  const qZ = new THREE.Quaternion();

  if (keys.w) qX.setFromAxisAngle(axisX, -rotSpeed);
  if (keys.s) qX.setFromAxisAngle(axisX, rotSpeed);
  
  if (keys.a) qY.setFromAxisAngle(axisY, -rotSpeed);
  if (keys.d) qY.setFromAxisAngle(axisY, rotSpeed);
  
  if (keys.q) qZ.setFromAxisAngle(axisZ, -rotSpeed);
  if (keys.e) qZ.setFromAxisAngle(axisZ, rotSpeed);

  const qChange = new THREE.Quaternion().multiplyQuaternions(qX, qY).multiply(qZ);

  cube.quaternion.premultiply(qChange);
  cube.quaternion.normalize(); 
}

function applyScroll() {
  if (scrollDelta === 0) return;

  const mapping = currentMapping();
  if (mapping === "2" || mode === "translate") {
    cube.position.z -= scrollDelta * Z_TRANS_SCALE;
  } 
  else if (mode === "rotate") {
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    
    const qZ = new THREE.Quaternion().setFromAxisAngle(cameraForward, scrollDelta * Z_ROT_SCALE);
    cube.quaternion.premultiply(qZ);
  }
}

function handleMapping1(delta) {
  checkDragStart();
  checkDragEnd();

  if (isDragging) {
    if (mode === "translate") {
      applyMouseTranslationXY();
    } else if (mode === "rotate") {
      applyMouseRotationXY();
    }
  }

  applyScroll();
}

function handleMapping2(delta) {
  checkDragStart();
  checkDragEnd();

  // No Mapping 2, o mouse faz apenas translação
  if (isDragging) {
    applyMouseTranslationXY();
  }

  // O teclado faz rotação independentemente de estar arrastando ou não
  applyKeyboardRotation(delta);
  applyScroll();
}

// ===== END STUDENT TODO =====

// ---------------------------------------------------------------------------
// Render loop — provided
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  updateControlMapping(delta);

  // Generic path-length accumulation — measures how far the cube has
  // physically travelled this trial, regardless of mapping.
  pathLength += cube.position.distanceTo(lastCubePosition);
  lastCubePosition.copy(cube.position);

  updateStatus();
  renderer.render(scene, camera);
}

main();
