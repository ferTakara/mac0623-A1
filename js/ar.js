import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// ===========================================================================
// 1. CONSTANTES
// ===========================================================================
export const CUBE_SIZE = 0.07;
export const TARGET_DISTANCE_MIN = 0.30;
export const TARGET_DISTANCE_MAX = 0.45;
export const TOLERANCE_POS_CM = 2.0;
export const TOLERANCE_YAW_DEG = 10.0;
export const ROTATION_GAIN_TECHNIQUE2 = 2.0; // ganho rotacional 1:2

export const COLORS = [
    { name: 'Vermelho', hex: 0xff3b30 },
    { name: 'Verde',    hex: 0x34c759 },
    { name: 'Azul',     hex: 0x007aff }
];

export const STATE_DETECTING_SURFACE = 0;
export const STATE_SELECTING_OBJECT  = 1;
export const STATE_MANIPULATING      = 2;
export const STATE_FINISHED          = 3;

export const CSV_HEADER = [
    'participant_id', 'technique', 'trial', 'completion_time_s',
    'pos_error_cm', 'yaw_error_deg', 'wrong_selections',
    'touch_count', 'tracking_lost', 'arm_fatigue'
];

const MAX_TRIALS = 3;
const CANDIDATE_DISTANCE = 0.38;               // dentro de [MIN, MAX]
const CANDIDATE_ARC_ANGLES = [-0.55, 0, 0.55]; // ~ -32°, 0°, +32°
const PICK_PROXIMITY = 0.10;                   // tolerância de toque (m)
const DRAG_THRESHOLD_PX = 8;
const TAP_MAX_MS = 450;
const HUD_SAFE_MARGIN_PX = 12;
const MAX_RAY_DISTANCE_TOUCH = 3.0;
const MAX_RAY_DISTANCE_T2 = 5.0;
const DEFAULT_ANCHOR = new THREE.Vector3(0, -0.15, -0.7);
const SCREEN_CENTER = new THREE.Vector2(0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const UI_SELECTOR = '#hud, button, select, input, #fatigueModal';

const HIGHLIGHT_IDLE = 0xffcc00;
const HIGHLIGHT_OK = 0x34c759;

// ===========================================================================
// 2. ESTADO
// ===========================================================================
// Three.js / WebXR
let scene, camera, renderer, controller, reticle;
let hitTestSource = null;

// Mundo
let tabletopPlane = null;
let surfaceY = 0;
let surfacePlaced = false;
let targetGroup = null;
let targetCube = null;
let targetColorIndex = 0;
let candidateObjects = [];
let selectedObject = null;

// Tarefa
let appState = STATE_DETECTING_SURFACE;
let workspaceLocked = false;
let currentTrial = 1;
let trialStartTime = 0;
let blockStartIndex = 0;      // primeira linha do CSV do bloco (técnica) atual
let lastTrackingState = true;
const metrics = { wrongSelections: 0, touchCount: 0, trackingLost: 0 };
const csvRows = [];

// Técnica 2
let lastPhoneRoll = 0;

// Gestos (Técnica 1)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const gesture = {
    isDragging: false,
    isTwisting: false,
    hasMoved: false,
    selectedAtStart: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    lastAngle: 0,
    dragOffset: new THREE.Vector3()
};

// ===========================================================================
// 3. DOM
// ===========================================================================
const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
const helpEl = $('help');
const participantIdInput = $('participantId');
const mappingSelect = $('mappingSelect');
const confirmBtn = $('confirmBtn');
const downloadBtn = $('downloadBtn');
const startActivityBtn = $('startActivityBtn');
const statusEl = $('status');
const fatigueModal = $('fatigueModal');
const fatigueButtons = $('fatigueButtons');
const centerReticle = $('centerReticle');

const setHidden = (el, hidden) => el && el.classList.toggle('hidden', hidden);

export function updateStatus(text, inTolerance = false) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('in-tolerance', inTolerance);
}

/** Sincroniza toda a interface com o modo (treino livre x atividade). */
function setActivityUI(active) {
    setHidden(startActivityBtn, active);
    setHidden(helpEl, active);
    setHidden(confirmBtn, !active);
    setHidden(centerReticle, true);
    if (hudEl) hudEl.classList.toggle('activity-active', active);
    if (participantIdInput) participantIdInput.disabled = active;
    if (active && reticle) reticle.visible = false;
}

// ===========================================================================
// 4. HELPERS GERAIS
// ===========================================================================
export function isTechnique2() {
    return mappingSelect?.value === '2';
}

const getTechniqueName = () => (isTechnique2() ? 'technique2' : 'touch');
const getParticipantId = () => participantIdInput?.value.trim() || 'P01';
const isTaskRunning = () =>
    workspaceLocked && (appState === STATE_SELECTING_OBJECT || appState === STATE_MANIPULATING);

export function getActiveCamera() {
    if (renderer?.xr?.isPresenting) {
        const xrCam = renderer.xr.getCamera();
        if (xrCam?.cameras?.length > 0) return xrCam.cameras[0];
    }
    return camera;
}

export function getPhoneRoll(cam) {
    if (!cam) return 0;
    const inv = cam.getWorldQuaternion(new THREE.Quaternion()).invert();
    const localUp = UP.clone().applyQuaternion(inv);
    return Math.atan2(localUp.x, localUp.y);
}

const normalizeAngle = (a) => {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
};

export function shuffle(array) { // Fisher-Yates
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function disposeObject(obj) {
    obj.traverse((child) => {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => m?.dispose());
    });
}

function resetMetrics() {
    metrics.wrongSelections = 0;
    metrics.touchCount = 0;
    metrics.trackingLost = 0;
    trialStartTime = performance.now();
}

function resetGesture() {
    gesture.isDragging = false;
    gesture.isTwisting = false;
    gesture.hasMoved = false;
    gesture.selectedAtStart = false;
}

// ===========================================================================
// 5. INICIALIZAÇÃO THREE.JS / WEBXR
// ===========================================================================
export function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5);
    hemi.position.set(0.5, 1, 0.25);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(1, 3, 2);
    scene.add(dir);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    setupReticle();

    const overlayRoot = $('ar-overlay') || document.body;
    // Evita que toques no DOM Overlay gerem eventos 'select' duplicados
    overlayRoot.addEventListener('beforexrselect', (e) => e.preventDefault());

    document.body.appendChild(ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: overlayRoot }
    }));

    renderer.xr.addEventListener('sessionstart', onSessionStart);
    renderer.xr.addEventListener('sessionend', onSessionEnd);

    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    placeWorkspace(DEFAULT_ANCHOR);
    setHidden(startActivityBtn, false);
    updateStatus('Escaneando...');

    setupEventListeners();
    setupTouchGestures();
    window.addEventListener('resize', onWindowResize);

    renderer.setAnimationLoop(render);
}

function setupReticle() {
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.045, 0.055, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;

    const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.008, 16).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x34c759, side: THREE.DoubleSide })
    );
    reticle.add(dot);
    scene.add(reticle);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===========================================================================
// 6. SESSÃO WEBXR
// ===========================================================================
async function onSessionStart() {
    workspaceLocked = false;
    appState = STATE_DETECTING_SURFACE;
    setActivityUI(false);
    updateStatus('Escaneando...');

    // Hit-test source é criado uma única vez por sessão (e não dentro do loop)
    try {
        const session = renderer.xr.getSession();
        const viewerSpace = await session.requestReferenceSpace('viewer');
        hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    } catch (err) {
        console.warn('Hit-test indisponível:', err);
        updateStatus('Hit-test indisponível neste dispositivo');
    }
}

function onSessionEnd() {
    hitTestSource?.cancel?.();
    hitTestSource = null;
    workspaceLocked = false;
    setActivityUI(false);
    if (reticle) reticle.visible = false;
    updateStatus('—');
}

// ===========================================================================
// 7. OBJETOS DA CENA
// ===========================================================================
export function createDockingCube(colorHex = 0x007aff, isGhost = false) {
    const group = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

    group.add(new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.35,
        metalness: 0.15,
        transparent: isGhost,
        opacity: isGhost ? 0.35 : 1.0,
        depthWrite: !isGhost
    })));

    // Hit-box invisível ampliada (10,5 cm) para facilitar o toque
    if (!isGhost) {
        const hitBox = new THREE.Mesh(
            new THREE.BoxGeometry(CUBE_SIZE * 1.5, CUBE_SIZE * 1.5, CUBE_SIZE * 1.5),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        hitBox.name = 'touchHitBox';
        group.add(hitBox);
    }

    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({
            color: isGhost ? 0xffffff : 0x111111,
            transparent: isGhost,
            opacity: isGhost ? 0.5 : 0.9
        })
    ));

    // Seta de Yaw no topo (aponta para -Z)
    const arrowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: isGhost,
        opacity: isGhost ? 0.6 : 0.95
    });
    const headGeo = new THREE.ConeGeometry(CUBE_SIZE * 0.18, CUBE_SIZE * 0.28, 4);
    headGeo.rotateX(-Math.PI / 2);
    headGeo.rotateY(Math.PI / 4);

    const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(CUBE_SIZE * 0.15, 0.003, CUBE_SIZE * 0.45), arrowMat);
    shaft.position.set(0, CUBE_SIZE / 2 + 0.002, CUBE_SIZE * 0.08);

    const head = new THREE.Mesh(headGeo, arrowMat);
    head.position.set(0, CUBE_SIZE / 2 + 0.002, -CUBE_SIZE * 0.2);

    group.add(shaft, head);

    // Cache dos meshes "pickáveis" (evita traverse a cada raycast)
    if (!isGhost) {
        group.userData.pickMeshes = [];
        group.traverse((child) => {
            if (child.isMesh) {
                child.userData.parentCube = group;
                group.userData.pickMeshes.push(child);
            }
        });
    }
    return group;
}

function clearWorkspace() {
    if (selectedObject) removeSelectionHighlight(selectedObject);
    [targetGroup, ...candidateObjects].forEach((obj) => {
        if (!obj) return;
        scene.remove(obj);
        disposeObject(obj);
    });
    targetGroup = null;
    targetCube = null;
    candidateObjects = [];
    selectedObject = null;
    resetGesture();
}

function spawnTarget(position) {
    targetColorIndex = Math.floor(Math.random() * COLORS.length);
    targetGroup = createDockingCube(COLORS[targetColorIndex].hex, true);
    targetGroup.position.set(position.x, surfaceY + CUBE_SIZE / 2, position.z);
    targetGroup.rotation.y = Math.random() * Math.PI * 2;
    targetGroup.visible = workspaceLocked; // oculto no treino livre
    scene.add(targetGroup);
}

function spawnCandidates(center) {
    const camPos = getActiveCamera().getWorldPosition(new THREE.Vector3());
    const toCamera = new THREE.Vector3(camPos.x - center.x, 0, camPos.z - center.z);
    if (toCamera.lengthSq() < 0.001) toCamera.set(0, 0, 1);
    else toCamera.normalize();

    const colorOrder = shuffle(COLORS.map((_, i) => i));

    CANDIDATE_ARC_ANGLES.forEach((angle, i) => {
        const colorIdx = colorOrder[i];
        const info = COLORS[colorIdx];
        const cube = createDockingCube(info.hex, false);
        const dir = toCamera.clone().applyAxisAngle(UP, angle);

        cube.position.set(
            center.x + dir.x * CANDIDATE_DISTANCE,
            surfaceY + CUBE_SIZE / 2,
            center.z + dir.z * CANDIDATE_DISTANCE
        );
        cube.rotation.y = Math.random() * Math.PI * 2;
        Object.assign(cube.userData, {
            colorIndex: colorIdx,
            colorName: info.name,
            colorHex: info.hex,
            isTarget: colorIdx === targetColorIndex
        });

        if (cube.userData.isTarget) targetCube = cube;
        scene.add(cube);
        candidateObjects.push(cube);
    });
}

export function placeWorkspace(position) {
    clearWorkspace();

    surfaceY = position.y;
    tabletopPlane = new THREE.Plane(UP.clone(), -surfaceY);
    surfacePlaced = true;

    spawnTarget(position);
    spawnCandidates(position);

    if (workspaceLocked) {
        appState = STATE_SELECTING_OBJECT;
        updateStatus(trialLabel());
    } else {
        appState = STATE_DETECTING_SURFACE;
        updateStatus('Superfície detectada');
    }
}

/** Posição de ancoragem para recriar o workspace sem mudar a altura da mesa. */
function getAnchor({ preferReticle = false } = {}) {
    let pos;
    if (preferReticle && reticle?.visible) {
        pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    } else if (targetGroup) {
        pos = targetGroup.position.clone();
    } else {
        pos = DEFAULT_ANCHOR.clone();
    }
    if (surfacePlaced) pos.y = surfaceY;
    return pos;
}

const trialLabel = () =>
    `Trial ${currentTrial}`;

// ===========================================================================
// 8. SELEÇÃO
// ===========================================================================
function applySelectionHighlight(group) {
    group.getObjectByName('selectionHighlight')?.removeFromParent();

    const ringGeo = new THREE.RingGeometry(CUBE_SIZE * 0.65, CUBE_SIZE * 0.95, 32).rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: HIGHLIGHT_IDLE, side: THREE.DoubleSide })
    );
    ring.name = 'selectionHighlight';
    ring.position.set(0, -CUBE_SIZE / 2 + 0.002, 0);
    group.add(ring);

    setEmissive(group, 0x333333);
}

export function removeSelectionHighlight(group) {
    if (!group) return;
    const ring = group.getObjectByName('selectionHighlight');
    if (ring) {
        group.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
    }
    setEmissive(group, 0x000000);
}

function setEmissive(group, hex) {
    group.traverse((child) => {
        if (child.isMesh && child.name !== 'touchHitBox' && child.material?.emissive) {
            child.material.emissive.setHex(hex);
        }
    });
}

/** Cubo atingido pelo raio atual do `raycaster` (interseção ou proximidade). */
function pickCubeFromRay() {
    const meshes = candidateObjects.flatMap((c) => c.userData.pickMeshes);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) return hits[0].object.userData.parentCube;

    let best = null;
    let minDist = PICK_PROXIMITY;
    for (const cube of candidateObjects) {
        const d = raycaster.ray.distanceToPoint(cube.position);
        if (d < minDist) {
            minDist = d;
            best = cube;
        }
    }
    return best;
}

export function updatePointer(clientX, clientY) {
    const rect = renderer?.domElement?.getBoundingClientRect();
    const width = rect?.width || window.innerWidth;
    const height = rect?.height || window.innerHeight;
    pointer.x = ((clientX - (rect?.left ?? 0)) / width) * 2 - 1;
    pointer.y = -((clientY - (rect?.top ?? 0)) / height) * 2 + 1;
}

function castFromPointer(clientX, clientY) {
    updatePointer(clientX, clientY);
    raycaster.setFromCamera(pointer, getActiveCamera());
}

/** Interseção do raio com a mesa, ou null se atrás/longe demais. */
function intersectTabletop(ray, maxDistance) {
    if (!tabletopPlane) return null;
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(tabletopPlane, hit)) return null;
    if (hit.distanceTo(ray.origin) >= maxDistance) return null;
    return hit;
}

function placeOnTable(obj, x, z) {
    obj.position.set(x, surfaceY + CUBE_SIZE / 2, z);
}

export function selectCube(cube) {
    if (!cube) return false;

    selectedObject = cube;
    applySelectionHighlight(cube);
    if (navigator.vibrate) navigator.vibrate([40, 40, 40]);

    if (workspaceLocked && !cube.userData.isTarget) metrics.wrongSelections++;
    appState = STATE_MANIPULATING;
    resetGesture();

    if (isTechnique2()) {
        const cam = getActiveCamera();
        lastPhoneRoll = getPhoneRoll(cam);
        moveSelectedToScreenCenter(cam);
        setHidden(centerReticle, false);
    } else {
        // Técnica 1: prepara arrasto imediato se o dedo continuar na tela
        const hit = intersectTabletop(raycaster.ray, Infinity);
        if (hit) {
            gesture.dragOffset.set(hit.x - cube.position.x, 0, hit.z - cube.position.z);
            gesture.isDragging = true;
        }
    }

    checkDockingTolerance();
    return true;
}

export function handleObjectSelection(clientX, clientY) {
    castFromPointer(clientX, clientY);
    const picked = pickCubeFromRay();
    return picked ? selectCube(picked) : false;
}

export function deselectObject() {
    if (!selectedObject) return;
    removeSelectionHighlight(selectedObject);
    selectedObject = null;
    resetGesture();
    setHidden(centerReticle, true);
    appState = workspaceLocked ? STATE_SELECTING_OBJECT : STATE_DETECTING_SURFACE;
    if (navigator.vibrate) navigator.vibrate(40);

    updateStatus(workspaceLocked
        ? trialLabel()
        : 'Treino livre');
}

/** Seleção por raio do controlador WebXR (toque no ARButton / overlay). */
function onSelect() {
    if (!workspaceLocked) {
        if (reticle?.visible) {
            placeWorkspace(new THREE.Vector3().setFromMatrixPosition(reticle.matrix));
            setHidden(startActivityBtn, false);
        }
        return;
    }

    if (appState === STATE_SELECTING_OBJECT && controller) {
        const rot = new THREE.Matrix4().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rot);

        const picked = pickCubeFromRay();
        if (picked) selectCube(picked);
    }
}

// ===========================================================================
// 9. TÉCNICA 1 – GESTOS TOUCH
// ===========================================================================
function setupTouchGestures() {
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('contextmenu', (e) => {
        if (appState === STATE_MANIPULATING) e.preventDefault();
    });
}

/** Ignora toques na UI e na zona de segurança do HUD. */
function shouldIgnoreTouch(event) {
    if (event.target.closest(UI_SELECTOR)) return true;
    const touch = event.touches[0];
    if (hudEl && touch) {
        return touch.clientY <= hudEl.getBoundingClientRect().bottom + HUD_SAFE_MARGIN_PX;
    }
    return false;
}

function onTouchStart(event) {
    if (shouldIgnoreTouch(event)) return;
    event.preventDefault();

    if (isTaskRunning()) metrics.touchCount++;

    if (event.touches.length === 1) {
        beginSingleTouch(event.touches[0]);
    } else if (event.touches.length === 2 && canManipulateWithTouch()) {
        const [t1, t2] = event.touches;
        gesture.isDragging = false;
        gesture.isTwisting = true;
        gesture.hasMoved = true;
        gesture.lastAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
    }
}

const canManipulateWithTouch = () =>
    appState === STATE_MANIPULATING && selectedObject && !isTechnique2();

function beginSingleTouch(touch) {
    gesture.startX = touch.clientX;
    gesture.startY = touch.clientY;
    gesture.startTime = performance.now();
    gesture.hasMoved = false;
    gesture.selectedAtStart = canManipulateWithTouch() || (selectedObject !== null && appState === STATE_MANIPULATING);

    const canSelect = appState === STATE_SELECTING_OBJECT ||
        (!workspaceLocked && appState === STATE_DETECTING_SURFACE);

    if (canSelect) {
        const selected = handleObjectSelection(touch.clientX, touch.clientY);
        if (!selected && !workspaceLocked) onSelect(); // reposiciona a mesa
    } else if (canManipulateWithTouch() && tabletopPlane) {
        castFromPointer(touch.clientX, touch.clientY);
        const hit = intersectTabletop(raycaster.ray, MAX_RAY_DISTANCE_TOUCH);
        if (hit) {
            gesture.dragOffset.set(
                hit.x - selectedObject.position.x, 0, hit.z - selectedObject.position.z);
            gesture.isDragging = false;
            gesture.isTwisting = false;
        }
    }
}

function onTouchMove(event) {
    if (shouldIgnoreTouch(event)) return;
    event.preventDefault();

    // Técnica 2: movimento controlado pelo celular, não pelo toque
    if (isTechnique2() || !selectedObject || appState !== STATE_MANIPULATING) return;

    if (event.touches.length === 1) dragSelected(event.touches[0]);
    else if (event.touches.length === 2 && gesture.isTwisting) twistSelected(event.touches);
}

function dragSelected(touch) {
    if (!tabletopPlane) return;

    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (!gesture.hasMoved && dx * dx + dy * dy >= DRAG_THRESHOLD_PX ** 2) {
        gesture.hasMoved = true;
        gesture.isDragging = true;
    }
    if (!gesture.isDragging) return;

    castFromPointer(touch.clientX, touch.clientY);
    const hit = intersectTabletop(raycaster.ray, MAX_RAY_DISTANCE_TOUCH);
    if (hit) {
        placeOnTable(selectedObject, hit.x - gesture.dragOffset.x, hit.z - gesture.dragOffset.z);
        checkDockingTolerance();
    }
}

function twistSelected([t1, t2]) {
    const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
    selectedObject.rotation.y -= normalizeAngle(angle - gesture.lastAngle);
    gesture.lastAngle = angle;
    checkDockingTolerance();
}

function onTouchEnd(event) {
    if (event.touches.length === 0) {
        const isTap = gesture.selectedAtStart && selectedObject && !gesture.hasMoved &&
            performance.now() - gesture.startTime < TAP_MAX_MS;
        if (isTap) handleTapOnSelection(gesture.startX, gesture.startY);
        resetGesture();
    } else if (event.touches.length === 1 && gesture.isTwisting) {
        gesture.isTwisting = false;
        gesture.isDragging = false;
    }
}

/** Tap rápido com objeto selecionado: deseleciona ou troca de cubo. */
function handleTapOnSelection(x, y) {
    const previous = selectedObject;
    castFromPointer(x, y);
    const picked = pickCubeFromRay();

    deselectObject();
    if (picked && picked !== previous) selectCube(picked);
}

// ===========================================================================
// 10. TÉCNICA 2 – RAYCAST CENTRAL + CELULAR COMO VOLANTE
// ===========================================================================
function moveSelectedToScreenCenter(cam) {
    if (!cam || !selectedObject) return;
    raycaster.setFromCamera(SCREEN_CENTER, cam);
    if (raycaster.ray.direction.y >= 0) return; // só aceita raios apontando para baixo
    const hit = intersectTabletop(raycaster.ray, MAX_RAY_DISTANCE_T2);
    if (hit) placeOnTable(selectedObject, hit.x, hit.z);
}

function updateTechnique2() {
    if (!isTechnique2() || appState !== STATE_MANIPULATING || !selectedObject || !tabletopPlane) return;
    const cam = getActiveCamera();
    if (!cam) return;

    moveSelectedToScreenCenter(cam);

    const roll = getPhoneRoll(cam);
    selectedObject.rotation.y += normalizeAngle(roll - lastPhoneRoll) * ROTATION_GAIN_TECHNIQUE2;
    lastPhoneRoll = roll;

    checkDockingTolerance();
}

// ===========================================================================
// 11. TOLERÂNCIA DE DOCKING (X, Z, YAW)
// ===========================================================================
/** Cálculo puro dos erros do cubo-alvo em relação ao fantasma. */
function computeDockingError() {
    if (!targetCube || !targetGroup) return null;

    const dx = (targetCube.position.x - targetGroup.position.x) * 100;
    const dz = (targetCube.position.z - targetGroup.position.z) * 100;
    const posErrorCm = Math.hypot(dx, dz);

    const yawDiff = normalizeAngle(targetCube.rotation.y - targetGroup.rotation.y);
    const yawErrorDeg = Math.abs(THREE.MathUtils.radToDeg(yawDiff));

    return {
        posErrorCm,
        yawErrorDeg,
        inTolerance: posErrorCm <= TOLERANCE_POS_CM && yawErrorDeg <= TOLERANCE_YAW_DEG
    };
}

export function checkDockingTolerance() {
    const empty = { inTolerance: false, posErrorCm: 0, yawErrorDeg: 0 };
    if (!selectedObject || !targetGroup) return empty;

    if (!workspaceLocked || !targetGroup.visible) {
        updateStatus(`Treino livre (${selectedObject.userData.colorName})`);
        return empty;
    }

    const result = computeDockingError();
    if (!result) return empty;

    updateStatus(
        `Δpos: ${result.posErrorCm.toFixed(1)}cm | Δyaw: ${result.yawErrorDeg.toFixed(0)}°`,
        result.inTolerance
    );

    const ring = selectedObject.getObjectByName('selectionHighlight');
    ring?.material.color.setHex(result.inTolerance ? HIGHLIGHT_OK : HIGHLIGHT_IDLE);

    return result;
}

// ===========================================================================
// 12. FLUXO DA ATIVIDADE
// ===========================================================================
export function lockWorkspace() {
    workspaceLocked = true;
    currentTrial = 1;
    blockStartIndex = csvRows.length;
    lastTrackingState = true;

    placeWorkspace(getAnchor());
    setActivityUI(true);
    resetMetrics();

    appState = STATE_SELECTING_OBJECT;
    updateStatus(trialLabel());
}

export function resetToInitialState() {
    const anchor = getAnchor({ preferReticle: true });

    if (selectedObject) deselectObject();
    workspaceLocked = false;
    currentTrial = 1;
    appState = STATE_DETECTING_SURFACE;
    trialStartTime = 0;
    metrics.wrongSelections = 0;
    metrics.touchCount = 0;
    metrics.trackingLost = 0;

    setActivityUI(false);
    placeWorkspace(anchor);
}

function recordTrial({ posErrorCm, yawErrorDeg }) {
    csvRows.push({
        participant_id: getParticipantId(),
        technique: getTechniqueName(),
        trial: currentTrial,
        completion_time_s: +(trialStartTime > 0 ? (performance.now() - trialStartTime) / 1000 : 0).toFixed(3),
        pos_error_cm: +posErrorCm.toFixed(2),
        yaw_error_deg: +yawErrorDeg.toFixed(1),
        wrong_selections: metrics.wrongSelections,
        touch_count: metrics.touchCount,
        tracking_lost: metrics.trackingLost,
        arm_fatigue: '' // preenchido após a avaliação do bloco
    });
}

export function confirmTrial() {
    if (appState === STATE_FINISHED) return;

    if (!workspaceLocked) {
        updateStatus("Inicie primeiro a atividade clicando em 'Iniciar atividade'!");
        return;
    }
    if (appState !== STATE_MANIPULATING) {
        updateStatus('Selecione primeiro o cubo correspondente!');
        return;
    }

    // Erro calculado sem efeitos colaterais de UI
    const errors = computeDockingError() ?? { posErrorCm: 0, yawErrorDeg: 0 };
    recordTrial(errors);

    setHidden(centerReticle, true);
    if (selectedObject) removeSelectionHighlight(selectedObject);
    selectedObject = null;
    resetGesture();

    if (currentTrial < MAX_TRIALS) {
        currentTrial++;
        resetMetrics();
        placeWorkspace(getAnchor()); // workspaceLocked continua true
        setActivityUI(true);
    } else {
        resetToInitialState();
        updateStatus('3 trials concluídos! Avalie a fadiga.');
        showFatigueModal();
    }
}

export function showFatigueModal() {
    if (!fatigueModal) return;
    const title = fatigueModal.querySelector('span');
    if (title) {
        title.textContent = `Fim da Técnica ${mappingSelect?.value ?? '1'}! Quão cansados estão seus braços?`;
    }
    fatigueModal.classList.remove('hidden');
}

export function handleFatigueRating(rating) {
    const value = parseInt(rating, 10);
    // Aplica somente às linhas do bloco recém-concluído (não sobrescreve outras técnicas)
    for (let i = blockStartIndex; i < csvRows.length; i++) {
        csvRows[i].arm_fatigue = value;
    }
    setHidden(fatigueModal, true);
    setHidden(startActivityBtn, false);
    updateStatus('Fadiga registrada! Inicie nova atividade.');
}

// ===========================================================================
// 13. EVENTOS DE UI & CSV
// ===========================================================================
function bindPress(el, handler) {
    if (!el) return;
    el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler(e);
    });
}

function setupEventListeners() {
    bindPress(startActivityBtn, () => {
        setHidden(fatigueModal, true);
        lockWorkspace();
    });
    bindPress(confirmBtn, confirmTrial);
    bindPress(downloadBtn, exportCSV);

    fatigueButtons?.querySelectorAll('button').forEach((btn) => {
        bindPress(btn, () => handleFatigueRating(btn.getAttribute('data-rating')));
    });

    const updateHelpText = () => {
        if (!helpEl) return;
        helpEl.textContent = isTechnique2()
            ? 'Técnica 2: Toque no cubo para selecionar. Mova o celular para posicionar. Gire o celular como um volante para rotacionar. Confirm registra o trial.'
            : 'Técnica 1: Toque para selecionar. 1 dedo arrasta, 2 dedos giram. Toque fora para deselecionar. Confirm registra o trial.';
    };
    mappingSelect?.addEventListener('change', updateHelpText);
    updateHelpText();

    window.addEventListener('keydown', (e) => {
        if (e.target.closest?.('input, select, textarea')) return; // não dispara ao digitar o ID
        if (e.key === 'Enter') confirmTrial();
        else if (e.key === 'Escape') deselectObject();
    });
}

const csvEscape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCSV() {
    const pId = getParticipantId();
    const tech = getTechniqueName();
    const rows = csvRows.filter((r) => r.participant_id === pId && r.technique === tech);

    if (rows.length === 0) {
        alert('Nenhum dado registrado para este participante/técnica ainda.');
        return;
    }

    const lines = [CSV_HEADER.join(',')];
    rows.forEach((row) => lines.push(CSV_HEADER.map((f) => csvEscape(row[f])).join(',')));

    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${pId}-${tech}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// ===========================================================================
// 14. LOOP DE RENDERIZAÇÃO
// ===========================================================================
function updateTracking(frame, referenceSpace) {
    const pose = frame.getViewerPose(referenceSpace);
    const trackingOk = Boolean(pose && !pose.emulatedPosition);

    if (isTaskRunning() && lastTrackingState && !trackingOk) metrics.trackingLost++;
    lastTrackingState = trackingOk;
}

function updateHitTest(frame, referenceSpace) {
    if (workspaceLocked || !hitTestSource) {
        if (reticle) reticle.visible = false;
        return;
    }

    const pose = frame.getHitTestResults(hitTestSource)[0]?.getPose(referenceSpace);
    reticle.visible = Boolean(pose);
    if (pose) reticle.matrix.fromArray(pose.transform.matrix);

    if (appState === STATE_DETECTING_SURFACE) {
        updateStatus(pose ? 'Superfície detectada' : 'Escaneando...');
    }
}

function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        updateTracking(frame, referenceSpace);
        updateHitTest(frame, referenceSpace);
    }

    updateTechnique2();
    renderer.render(scene, camera);
}

init();