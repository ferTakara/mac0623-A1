// MAC0623 — Class 10 — WebXR Retrofit of A1 — STARTER
//
// This is a working copy of the A1 desktop docking testbed, with the
// baseline mapping (mapping "1", mouse translate/rotate, Spacebar/Tab
// toggle) already implemented — the same state your own finished A1
// codebase should be in. Everything else (scene, target, tolerance check,
// HUD, CSV logging) is identical to the A1 starter and unused today.
//
// Today's task lives entirely in the block marked
//
//   // ===== STUDENT TODO: WebXR retrofit ===== ... // ===== END STUDENT TODO =====
//
// near the end of this file: add the five-line WebXR bootstrap from
// Class 8, and wire a single one-hand grab on `cube`. See `lab10.md` for
// the full task description and worked code.

import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

// ---------------------------------------------------------------------------
// Module-scope state — provided, same as A1
// ---------------------------------------------------------------------------

let scene, camera, renderer, cube, target, worldHud;
let controller0, controller1, controllerGrip0, controllerGrip1;
let grabbables = [];
let attachModeSelect, handModeSelect, statusEl;

// ---------------------------------------------------------------------------
// Named constants 
// ---------------------------------------------------------------------------

// Colors
const BACKGROUND_COLOR = 0x1a1a1a;
const HEMISPHERE_SKY_COLOR = 0xffffff;
const HEMISPHERE_GROUND_COLOR = 0x444444;
const DIRECTIONAL_LIGHT_COLOR = 0xffffff;
const GRID_COLOR_CENTER_LINE = 0x444444;
const GRID_COLOR_LINES = 0x2a2a2a;
// Cube/target face colors — six distinct colors, one per BoxGeometry face
// (material order +X -X +Y -Y +Z -Z), so orientation is actually legible
// instead of a rotationally-symmetric single-color cube. Same convention
// as the Class 4 station app (labs/c04-ep01 and 02/): +Z is the bright
// "marked" face.
const CUBE_FACE_COLORS = [0x3f7fd6, 0x2c5aa0, 0xe0c341, 0xa08a2c, 0xff5c5c, 0x7a2f2f];

// Lighting
const HEMISPHERE_LIGHT_INTENSITY = 1.2;
const DIRECTIONAL_LIGHT_INTENSITY = 0.8;
const DIRECTIONAL_LIGHT_POSITION = [2, 4, 3];

// Scene helpers
const GRID_SIZE = 6;
const GRID_DIVISIONS = 24;
const AXES_HELPER_SIZE = 0.6;

// Geometry
const CUBE_SIZE = 0.4;  // edge length, BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)
const CUBE_INITIAL_POSITION = [0, 0.5, 0];
const TARGET_OPACITY = 0.35;

// Camera
const CAMERA_FOV_DEG = 60;
const CAMERA_NEAR = 0.05;
const CAMERA_FAR = 100;
const CAMERA_POSITION = [0, 1.4, 4];
const CAMERA_LOOK_AT = [0, 0.5, 0];

// Baseline mapping (mouse drag, see below)
const TRANSLATE_SPEED = 0.0025; // world units per pixel of mouse movement
const ROTATE_SPEED    = 0.005;  // radians per pixel of mouse movement
// Mouse drag only covers 2 of the 3 axes each mode needs — right/up while
// translating, yaw/pitch while rotating. The third axis (depth in translate
// mode, roll in rotate mode) is on the wheel, same as the Class 4 station
// app and the A1 baseline this scaffold carries forward.
const WHEEL_TRANSLATE_SPEED_Z = 0.001; // world units per wheel-delta unit
const WHEEL_ROTATE_SPEED_Z = 0.002; // radians per wheel-delta unit

// Controller ray — visual feedback for what the controller is pointing at.
// Without it there's no way to see the raycast getIntersections() casts
// along, in the emulator or the headset.
const RAY_LENGTH_SCALE = 1.5;
const RAY_COLOR = 0xffffff;

// World-space HUD — the DOM #status pill is invisible once an immersive-vr
// session starts (only what's rendered via renderer.xr composites into the
// headset view — "DOM Overlay" only applies to immersive-ar, not
// immersive-vr, so there's no flag that fixes this). Same numbers-on-a-
// canvas fix as the Class 4 station app, but head-locked rather than
// world-anchored: the Class 4 station app floats its panel near the ghost
// (a fixed world point you're looking toward anyway during that task), but
// this scaffold's target moves every trial and can end up out of view, so
// the panel is parented to the camera at a fixed local offset instead —
// it stays in the same spot in your view no matter where you look, rather
// than being wherever the target happens to be. Hidden outside an XR
// session — the DOM pill already covers desktop mode.
const WORLD_HUD_CANVAS_WIDTH = 512;
const WORLD_HUD_CANVAS_HEIGHT = 160;
const WORLD_HUD_SPRITE_SCALE = [0.22, 0.069, 1];
const WORLD_HUD_LOCAL_POSITION = [0.46, 0.32, -0.7]; // camera-local: pushed to the true top-right corner of the FOV (not just off-center) so the cube/target — manipulated near the center of view — doesn't pass behind it on screen
const AXIS_SWATCH_X = "#" + CUBE_FACE_COLORS[0].toString(16).padStart(6, "0"); // matches the cube's +X face
const AXIS_SWATCH_Y = "#" + CUBE_FACE_COLORS[2].toString(16).padStart(6, "0"); // matches the cube's +Y face
const AXIS_SWATCH_Z = "#" + CUBE_FACE_COLORS[4].toString(16).padStart(6, "0"); // matches the cube's +Z face

// ---------------------------------------------------------------------------
/**
 * buildScene() — provided, identical to the A1 starter.
 *
 * @returns {{ scene: THREE.Scene, cube: THREE.Mesh, target: THREE.Mesh }}
 */
function buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND_COLOR);

    scene.add(new THREE.HemisphereLight(HEMISPHERE_SKY_COLOR, HEMISPHERE_GROUND_COLOR, HEMISPHERE_LIGHT_INTENSITY));
    const dirLight = new THREE.DirectionalLight(DIRECTIONAL_LIGHT_COLOR, DIRECTIONAL_LIGHT_INTENSITY);
    dirLight.position.set(...DIRECTIONAL_LIGHT_POSITION);  // ... is the js spread operator
    scene.add(dirLight);

    scene.add(new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, GRID_COLOR_CENTER_LINE, GRID_COLOR_LINES));
    scene.add(new THREE.AxesHelper(AXES_HELPER_SIZE));

    const cubeGeometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

    const cube = new THREE.Mesh(
        cubeGeometry,
        CUBE_FACE_COLORS.map((color) => new THREE.MeshStandardMaterial({ color }))
    );
    cube.position.set(...CUBE_INITIAL_POSITION);
    cube.userData.originalColors = cube.material.map(mat => mat.color.clone());                 
    scene.add(cube);

    const target = new THREE.Mesh(
        cubeGeometry.clone(),
        CUBE_FACE_COLORS.map((color) => new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: TARGET_OPACITY,
            depthWrite: false,
        }))
    );
    scene.add(target);

    return { scene, cube, target }; // returns a single object
}

// ---------------------------------------------------------------------------
/**
 * buildControllers(renderer, scene)
 *
 * Sets up both input sources. Each has two Object3Ds that track different
 * poses:
 *   - controller (renderer.xr.getController(i))     — the "target ray" pose,
 *     roughly where the controller is pointing. Visualized as a colored line.
 *   - grip (renderer.xr.getControllerGrip(i))        — the "grip" pose,
 *     roughly the physical hand position. Visualized as a small sphere.
 *
 * Controller 0 is red, controller 1 is blue, purely so you can tell them
 * apart on the headset and in the emulator. Neither color means "dominant" —
 * that's a convention you choose in your own two-hand logic.
 *
 * Does not wire selectstart/selectend — that happens in main(), pointing at
 * the STUDENT TODO handlers below.
 *
 * @returns {{ controller0, controller1, grip0, grip1 }}
 */
function buildControllers(renderer, scene) {
  const rayGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);

  function buildController(index) {
    const controller = renderer.xr.getController(index);
    const line = new THREE.Line(
      rayGeometry,
      new THREE.LineBasicMaterial({ color: index === 0 ? 0xff6666 : 0x66aaff })
    );
    line.name = "ray";
    line.scale.z = 1.5;
    controller.add(line);
    scene.add(controller);
    return controller;
  }

  function buildGrip(index) {
    const grip = renderer.xr.getControllerGrip(index);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 12, 8),
      new THREE.MeshBasicMaterial({ color: index === 0 ? 0xff6666 : 0x66aaff })
    );
    grip.add(marker);
    scene.add(grip);
    return grip;
  }

  return {
    controller0: buildController(0),
    controller1: buildController(1),
    grip0: buildGrip(0),
    grip1: buildGrip(1),
  };
}

/**
 * buildWorldHud() — provided. A canvas drawn each frame, mapped onto a
 * Sprite. Not added to the scene here — main() parents it to `camera`
 * once the camera exists, at a fixed local offset, so it's head-locked
 * (see the comment above WORLD_HUD_LOCAL_POSITION).
 * @returns {{ sprite: THREE.Sprite, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture }}
 */
function buildWorldHud() {
    const canvas = document.createElement("canvas");
    canvas.width = WORLD_HUD_CANVAS_WIDTH;
    canvas.height = WORLD_HUD_CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
    }));
    sprite.scale.set(...WORLD_HUD_SPRITE_SCALE);
    sprite.renderOrder = 999;
    sprite.visible = false; // shown only inside an XR session, see updateWorldHud()
    return { sprite, canvas, ctx, texture };
}

// ---------------------------------------------------------------------------
/**
 * main() — provided. Similar to A1
 */
function main() {
    const built = buildScene();
    scene = built.scene;
    cube = built.cube;
    target = built.target;

    worldHud = buildWorldHud();

    camera = new THREE.PerspectiveCamera(
        CAMERA_FOV_DEG,
        window.innerWidth / window.innerHeight,
        CAMERA_NEAR,
        CAMERA_FAR
    );
    camera.position.set(...CAMERA_POSITION);
    camera.lookAt(...CAMERA_LOOK_AT);

    // Head-lock the world HUD: parent it to the camera at a fixed local
    // offset, then add the camera itself to the scene graph — a camera's
    // children only render if the camera is reachable from `scene`
    // (renderer.render() traverses starting at `scene`, not at `camera`).
    camera.add(worldHud.sprite);
    worldHud.sprite.position.set(...WORLD_HUD_LOCAL_POSITION);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener("resize", handleWindowResize);

    setupWebXR(); // ===== STUDENT TODO lives inside this call, see below =====

    startTrial();
    animate();
    renderer.setAnimationLoop(animate);
}

function handleWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------------
// Target-pose generation — provided
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
// Tolerance check — provided, as used in A1
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

// ---------------------------------------------------------------------------
// Trial state machine — provided, as used in A1
// ---------------------------------------------------------------------------

let trialNumber = 0;
let presentationOrderByMapping = { 1: 0, 2: 0 };
let trialStartTime = performance.now();
let pathLength = 0;
let lastCubePosition = new THREE.Vector3();
let mode = "translate";
let modeSwitches = 0;

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

// ---------------------------------------------------------------------------
// CSV download — provided, as used in A1
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

function handleDownloadClick() {
    const csv = buildCsv();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const pid = participantIdInput.value.trim() || "UNKNOWN";
    a.href = url;
    a.download = `lab10_${pid}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Status indicator — provided, identical to the A1 starter
//
// Per-axis rotation breakdown (X/Y/Z below) is diagnostic only — same
// technique as the Class 4 station app: rotate each local axis by the
// cube's and target's quaternions, then measure the angle between the two
// resulting directions. +X/+Y/+Z only; -X/-Y/-Z would read identically,
// since a rotation offset moves both ends of an axis together. Pass/fail
// and the CSV still use the single combined orientationErrorDeg from
// checkTolerance(), unchanged — this breakdown doesn't feed either.
// ---------------------------------------------------------------------------

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const _axisA = new THREE.Vector3();
const _axisB = new THREE.Vector3();

function axisRotationErrorDeg(axis) {
    _axisA.copy(axis).applyQuaternion(cube.quaternion);
    _axisB.copy(axis).applyQuaternion(target.quaternion);
    return THREE.MathUtils.radToDeg(_axisA.angleTo(_axisB));
}

function updateStatus() {
    const { positionError, orientationErrorDeg, withinTolerance } = checkTolerance();
    const xErr = axisRotationErrorDeg(AXIS_X);
    const yErr = axisRotationErrorDeg(AXIS_Y);
    const zErr = axisRotationErrorDeg(AXIS_Z);
    statusEl.textContent =
        `dPos ${positionError.toFixed(3)} | dRot ${orientationErrorDeg.toFixed(1)}deg ` +
        `(X ${xErr.toFixed(1)} Y ${yErr.toFixed(1)} Z ${zErr.toFixed(1)})`;
    statusEl.classList.toggle("in-tolerance", withinTolerance);
    updateWorldHud(positionError, orientationErrorDeg, xErr, yErr, zErr, withinTolerance);
}

/**
 * updateWorldHud(...) — provided. Redraws the world-space HUD sprite
 * (see buildWorldHud() above) from the same values updateStatus() just
 * computed — one source of truth, no duplicate checkTolerance() call.
 * Hidden whenever there's no active XR session, since the DOM #status
 * pill already covers desktop mode.
 */
function updateWorldHud(positionError, orientationErrorDeg, xErr, yErr, zErr, withinTolerance) {
    if (!renderer.xr.isPresenting) {
        worldHud.sprite.visible = false;
        return;
    }
    worldHud.sprite.visible = true; // position is fixed via the camera parenting in main()

    const { ctx, canvas, texture } = worldHud;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = withinTolerance ? "rgba(30,70,40,0.85)" : "rgba(20,20,26,0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textBaseline = "top";
    ctx.fillStyle = withinTolerance ? "#9f9" : "#eee";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.fillText(`dPos ${positionError.toFixed(3)}  dRot ${orientationErrorDeg.toFixed(1)}deg`, 16, 14);

    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillStyle = AXIS_SWATCH_X;
    ctx.fillText(`X ${xErr.toFixed(1)}`, 16, 76);
    ctx.fillStyle = AXIS_SWATCH_Y;
    ctx.fillText(`Y ${yErr.toFixed(1)}`, 190, 76);
    ctx.fillStyle = AXIS_SWATCH_Z;
    ctx.fillText(`Z ${zErr.toFixed(1)}`, 360, 76);

    texture.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Baseline control mapping — provided, already implemented (this is what
// your own finished A1 already has). Mode-switched: Spacebar toggles
// between translate and rotate; mouse drag drives whichever mode is
// active, in the camera's screen-space frame (stated explicitly, per
// Class 3's reference-frame discipline — this is a choice, not a default).
// Mapping "2" (your own A1 design) is intentionally left out here since
// it isn't needed for today's retrofit; drop yours back in if you want to
// test it in VR too, the grab logic below doesn't care which mapping is
// active on the desktop side.
// ---------------------------------------------------------------------------


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


function updateControlMapping(delta) {
  const mapping = currentMapping();

  if (mapping === "1") {
    // TODO: baseline mode-switched translate/rotate mapping. 
    // NOTE: input listeners must be registered once (outside this
    // per-frame function). Read `mode` and other input state here and
    // apply movements to `cube.position` / `cube.quaternion`.
    handleMapping1(delta);
  } else if (mapping === "2") {
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

// =====================================================================
// ===== STUDENT TODO: WebXR retrofit ===================================
// =====================================================================
//
// Today's whole task lives here. Two things:
//
//   1. setupWebXR() — add the five-line bootstrap from Class 8. Called
//      once from main(), after the renderer exists and before the first
//      trial starts.
//   2. onGrabStart / onGrabEnd — a single one-hand grab on `cube`, wired
//      to controller 0's `selectstart` / `selectend`.
//
// Worked example (see lab10.md for the full walkthrough):
//
//   function setupWebXR() {
//     renderer.xr.enabled = true;
//     document.body.appendChild(VRButton.createButton(renderer));
//
//     const controller = renderer.xr.getController(0);
//     controller.add(buildControllerRay()); // visible ray — see below
//     scene.add(controller);
//     controller.addEventListener('selectstart', onGrabStart);
//     controller.addEventListener('selectend', onGrabEnd);
//   }
//
//   function onGrabStart(event) {
//     const controller = event.target;
//     const hits = getIntersections(controller, [cube]);
//     if (hits.length === 0) return;
//     controller.attach(cube);
//     controller.userData.selected = cube;
//   }
//
//   function onGrabEnd(event) {
//     const controller = event.target;
//     if (!controller.userData.selected) return;
//     scene.attach(cube);
//     controller.userData.selected = null;
//   }
//
// Don't forget the import at the top of the file:
//   import { VRButton } from "three/addons/webxr/VRButton.js";
//
// And one gotcha the five lines don't mention: WebXR requires
// `renderer.setAnimationLoop(callback)`, not `requestAnimationFrame`.
// three.js swaps the timing source automatically once an XR session
// starts, so switch animate()'s scheduling at the bottom of this file
// once you wire the retrofit in — see the render loop section below.
//
// getIntersections(controller, objects) and buildControllerRay() are
// provided for you, right below this block — same raycasting helper as
// lab08, plus the visib// Gizmo state
const gizmoGroup = new THREE.Group();
const gizmoHits = [];

function buildGizmo() {
    // Build VR Gizmo
    // Render per-axis handles, add them to gizmoGroup, and populate gizmoHits for raycasting

}

let translateDummy = new THREE.Object3D();

function setupWebXR() {
    renderer.xr.enabled = true;
    document.body.appendChild(VRButton.createButton(renderer));

    const ctrls = buildControllers(renderer, scene);
    controller0 = ctrls.controller0;
    controller1 = ctrls.controller1;
    controllerGrip0 = ctrls.grip0;
    controllerGrip1 = ctrls.grip1;

    scene.add(translateDummy);
    buildGizmo();
    scene.add(gizmoGroup);

    [controller0, controller1].forEach((controller) => {
        controller.addEventListener("selectstart", onGrabStart);
        controller.addEventListener("selectend", onGrabEnd);
    });

    statusEl = document.getElementById("status");
}

function onGrabStart(event) {
    const controller = event.target;
    const mapping = currentMapping();

    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const rayOrigin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);

    if (mapping === "3") {
        // 3. VR Direct Grab (6DoF)
        const hits = getIntersections(controller, [cube]);
        if (hits.length > 0) {
            controller.userData.mode = "direct";
            controller.userData.selected = cube;
            controller.attach(cube);
        }

    } else if (mapping === "4") {
        // 4. VR Trackball
        // Implement VR trackball 
        // (rotation-only and indirect, translation stays a separate direct grab step)
        const hits = getIntersections(controller, [cube]);
        if (hits.length > 0) {
            controller.userData.mode = "translate";
            controller.userData.selected = cube;
            translateDummy.position.copy(cube.position);
            controller.attach(translateDummy);
        } else {
            controller.userData.mode = "rotate";
            controller.userData.selected = cube;
            controller.userData.previousRot = controller.quaternion.clone();
            
            // GAIN FACTOR JUSTIFICATION:
            // A gain of 2.0 amplifies wrist rotations, reducing physical strain and 
            // avoiding awkward arm contortions (like the "gorilla arm" effect). 
            // It maps a comfortable 90-degree wrist turn to a full 180-degree flip 
            // of the object, offering a good balance between precision and ergonomic range.
            controller.userData.gain = 2.0; 
        }
    } else if (mapping === "5") {
        // 5. VR Gizmo
        // Implement VR Gizmo raycasting and constrain the drag to axis/plane

    }
}

function onGrabEnd(event) {
    const controller = event.target;
    if (!controller.userData.selected) return;
    const mapping = currentMapping();
    
    if (mapping === "3") {
        // 3. VR Direct Grab (6DoF)
        // Handle release for Direct Grab (release on selectend)
        scene.attach(cube);

    } else if (mapping === "4") {
        // 4. VR Trackball
        // Handle release for VR Trackball
        if (controller.userData.mode === "translate") {
          scene.attach(translateDummy);
        }

    } else if (mapping === "5") {
        // 5. VR Gizmo
        // Handle release for VR Gizmo
    }

    controller.userData.mode = null;
    controller.userData.selected = null;
}

function updateWebXR() {
    const mapping = currentMapping();
    
    // Update gizmo visibility and position
    if (mapping === "5") {
        gizmoGroup.visible = true;
        gizmoGroup.position.copy(cube.position);
    } else {
        gizmoGroup.visible = false;
    }

    [controller0, controller1].forEach(controller => {
        if (!controller || !controller.userData.selected) return;
        
         if (mapping === "4") {
          // 4. VR Trackball
          if (controller.userData.mode === "translate") {
            let dummyWorldPos = new THREE.Vector3();
            translateDummy.getWorldPosition(dummyWorldPos);
            cube.position.copy(dummyWorldPos);
          } else if (controller.userData.mode === "rotate") {
            const currentRot = controller.quaternion.clone();
            const deltaRot = currentRot.clone().multiply(controller.userData.previousRot.clone().invert());
            
            let w = THREE.MathUtils.clamp(deltaRot.w, -1, 1);
            let angle = 2 * Math.acos(w);
            
            if (angle > 0.0001) {
                let sinHalfAngle = Math.sqrt(1 - w * w);
                let axis = new THREE.Vector3(deltaRot.x, deltaRot.y, deltaRot.z);
                if (sinHalfAngle > 0.001) {
                  axis.divideScalar(sinHalfAngle);
                } else {
                  axis.normalize();
                }
                
                const scaledAngle = angle * controller.userData.gain;
                const scaledDelta = new THREE.Quaternion().setFromAxisAngle(axis, scaledAngle);
                
                cube.quaternion.premultiply(scaledDelta);
                cube.quaternion.normalize();
            }
            
            controller.userData.previousRot.copy(currentRot);
          } 
        } else if (mapping === "5") {
            // 5. VR Gizmo
            // Update logic for VR Gizmo (drag constraint)

        }
    });
}

/**
 * buildControllerRay() — provided. A colored line from the controller's
 * origin along its local -Z axis (the same direction getIntersections()
 * casts along) — call `controller.add(buildControllerRay())` in your
 * setupWebXR(), see the worked example above.
 * @returns {THREE.Line}
 */
function buildControllerRay() {
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: RAY_COLOR }));
    line.name = "ray";
    line.scale.z = RAY_LENGTH_SCALE;
    return line;
}

/**
 * getIntersections(controller, objects) — provided.
 *
 * Casts a ray from `controller`'s current world position along its local
 * -Z axis and returns every hit in `objects`, nearest first.
 *
 * @returns {THREE.Intersection[]}
 */
function getIntersections(controller, objects) {
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    const raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    return raycaster.intersectObjects(objects, false);
}

// ===== END STUDENT TODO ================================================

// ---------------------------------------------------------------------------
// Render loop — provided, but see the STUDENT TODO note above: once you
// wire the retrofit in, this needs to run via renderer.setAnimationLoop
// instead of requestAnimationFrame for WebXR to work. Until then it runs
// exactly like the A1 starter's desktop-only loop.
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
    const delta = clock.getDelta();

    updateControlMapping(delta);
    updateWebXR(); // added for VR trackball logic

    pathLength += cube.position.distanceTo(lastCubePosition);
    lastCubePosition.copy(cube.position);

    updateStatus();
    renderer.render(scene, camera);
}

main();

