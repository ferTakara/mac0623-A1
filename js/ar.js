import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// ===========================================================================
// 1. CONSTANTES & CONFIGURAÇÕES GERAIS

export const CUBE_SIZE = 0.07;           
export const TARGET_DISTANCE_MIN = 0.30;
export const TARGET_DISTANCE_MAX = 0.45; 
export const TOLERANCE_POS_CM = 2.0;
export const TOLERANCE_YAW_DEG = 10.0;
export const ROTATION_GAIN_TECHNIQUE2 = 2.0; // Ganho rotacional 1:2 para ergonomia

// Cores disponíveis para os cubos candidatos e o alvo fantasma
export const COLORS = [
    { name: 'Vermelho', hex: 0xff3b30 },
    { name: 'Verde',    hex: 0x34c759 },
    { name: 'Azul',     hex: 0x007aff }
];

// Máquina de estados da aplicação
export const STATE_DETECTING_SURFACE = 0;
export const STATE_SELECTING_OBJECT  = 1; 
export const STATE_MANIPULATING      = 2;
export const STATE_FINISHED          = 3;

// Cabeçalho dos campos do CSV (9 métricas + arm_fatigue)
export const CSV_HEADER = [
    'participant_id',
    'technique',
    'trial',
    'completion_time_s',
    'pos_error_cm',
    'yaw_error_deg',
    'wrong_selections',
    'touch_count',
    'tracking_lost',
    'arm_fatigue'
];

// ===========================================================================
// 2. VARIÁVEIS GLOBAIS DE ESTADO
// ===========================================================================
// Three.js & WebXR
let scene, camera, renderer;
let controller;
let hitTestSource = null;
let hitTestSourceRequested = false;
let reticle;
let tabletopPlane;
let surfaceY = 0;
let surfacePlaced = false;

// Estado da Tarefa e Objetos da Cena
let appState = STATE_DETECTING_SURFACE;
let targetGroup = null;
let targetCube = null;
let targetColorIndex = 0;
let candidateObjects = [];
let selectedObject = null;
let testCube = null;
let workspaceLocked = false;

// Variáveis para Seleção e Gestos Touch (Técnica 1)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let isDragging = false;
let isTwisting = false;
const dragOffset = new THREE.Vector3();
let lastTouchAngle = 0;
let isRightClickRotating = false;
let lastDesktopMouseX = 0;

// Telemetria do Estudo e Métricas CSV
let currentTrial = 1;
let trialStartTime = 0;
let wrongSelections = 0;
let touchCount = 0;
let trackingLostCount = 0;
let lastTrackingState = true;
let lastArmFatigue = null;
const csvRows = [];

// ===========================================================================
// 3. REFERÊNCIAS A ELEMENTOS DO DOM (HUD / OVERLAY)
// ===========================================================================
const hudEl = document.getElementById("hud");
const helpEl = document.getElementById("help");
const participantIdInput = document.getElementById("participantId");
const mappingSelect = document.getElementById("mappingSelect");
const confirmBtn = document.getElementById("confirmBtn");
const downloadBtn = document.getElementById("downloadBtn");
const startActivityBtn = document.getElementById("startActivityBtn");
const statusEl = document.getElementById("status");
const fatigueModal = document.getElementById("fatigueModal");
const fatigueButtons = document.getElementById("fatigueButtons");
const centerReticle = document.getElementById("centerReticle");

// Variáveis para Técnica 2 (Raycast Central + Rotação pelo Celular como Volante)
let lastPhoneRoll = 0;

export function isTechnique2() {
    return mappingSelect && mappingSelect.value === "2";
}

export function getPhoneRoll(cam) {
    if (!cam) return 0;
    const camQuat = new THREE.Quaternion();
    cam.getWorldQuaternion(camQuat);
    const invQuat = camQuat.clone().invert();
    // Vetor UP do mundo projetado no referencial local da tela do smartphone
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(invQuat);
    return Math.atan2(localUp.x, localUp.y);
}


// ===========================================================================
// 4. INICIALIZAÇÃO DO AMBIENTE THREE.JS & WEBXR
// ===========================================================================
export function init() {
    // 4.2 Criação de Cena, Câmera e Iluminação
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5);
    hemiLight.position.set(0.5, 1, 0.25);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(1, 3, 2);
    scene.add(dirLight);

    // 4.3 Renderer WebGL com suporte a WebXR
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 4.4 Retículo para Hit-Test sobre superfícies reais
    setupReticle();

    // 4.5 Configuração do Botão WebXR (ARButton com dom-overlay e hit-test)
    const overlayRoot = document.getElementById('ar-overlay') || document.body;

    // Previne que toques no DOM Overlay disparem eventos select duplicados no WebXR controller
    overlayRoot.addEventListener('beforexrselect', (e) => {
        e.preventDefault();
    });

    const sessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: overlayRoot }
    };
    document.body.appendChild(ARButton.createButton(renderer, sessionInit));

    // 4.6 Registro de eventos de sessão e interface
    renderer.xr.addEventListener('sessionstart', onSessionStart);
    renderer.xr.addEventListener('sessionend', onSessionEnd);

    // Controlador WebXR para receber toques de seleção no celular
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // Instanciação da área de trabalho da atividade (Alvo Fantasma + 3 Cubos Candidatos)
    placeWorkspace(new THREE.Vector3(0, -0.15, -0.7));
    if (startActivityBtn) {
        startActivityBtn.classList.remove('hidden');
    }
    updateStatus("Escaneando...");

    setupEventListeners();
    setupTouchGestures();

    window.addEventListener('resize', onWindowResize);

    // 4.7 Loop de animação principal
    renderer.setAnimationLoop(render);
}

export function getActiveCamera() {
    if (renderer && renderer.xr && renderer.xr.isPresenting) {
        const xrCamera = renderer.xr.getCamera();
        if (xrCamera && xrCamera.cameras && xrCamera.cameras.length > 0) {
            return xrCamera.cameras[0];
        }
    }
    return camera;
}

export function updatePointer(clientX, clientY) {
    if (renderer && renderer.domElement) {
        const rect = renderer.domElement.getBoundingClientRect();
        const width = rect.width || window.innerWidth;
        const height = rect.height || window.innerHeight;
        pointer.x = ((clientX - rect.left) / width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / height) * 2 + 1;
    } else {
        pointer.x = (clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    }
}

export function lockWorkspace() {
    workspaceLocked = true;
    if (startActivityBtn) startActivityBtn.classList.add('hidden');
    if (helpEl) helpEl.classList.add('hidden');
    if (hudEl) hudEl.classList.add('activity-active');
    if (participantIdInput) participantIdInput.disabled = true;
    if (reticle) reticle.visible = false;

    // Zera contadores ao começar a atividade
    touchCount = 0;
    trackingLostCount = 0;
    wrongSelections = 0;
    trialStartTime = performance.now();

    appState = STATE_SELECTING_OBJECT;
    if (targetColorIndex !== undefined && COLORS[targetColorIndex]) {
        updateStatus(`Alvo: ${COLORS[targetColorIndex].name}`);
    }
}

function onSelect() {
    // Se o workplace não está travado, permite mover a mesa ou selecionar o cubo diretamente
    if (!workspaceLocked) {
        if (reticle && reticle.visible) {
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            reticle.matrix.decompose(pos, quat, scale);
            placeWorkspace(pos);
            if (startActivityBtn) {
                startActivityBtn.classList.remove('hidden');
            }
        }
        return;
    }

    // Se workspace já está travado e estamos aguardando seleção:
    if (appState === STATE_SELECTING_OBJECT && controller) {
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        let pickedCube = null;
        const meshes = [];
        candidateObjects.forEach(cube => {
            cube.traverse(child => {
                if (child.isMesh) {
                    child.userData.parentCube = cube;
                    meshes.push(child);
                }
            });
        });

        const intersects = raycaster.intersectObjects(meshes, false);
        if (intersects.length > 0) {
            pickedCube = intersects[0].object.userData.parentCube;
        } else {
            let minDistance = 0.10;
            candidateObjects.forEach(cube => {
                const dist = raycaster.ray.distanceToPoint(cube.position);
                if (dist < minDistance) {
                    minDistance = dist;
                    pickedCube = cube;
                }
            });
        }

        if (pickedCube) {
            selectCube(pickedCube);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===========================================================================
// 5. GESTÃO DE SESSÃO WEBXR (HIT-TEST & RASTREAMENTO)
// ===========================================================================
async function onSessionStart() {
    hitTestSourceRequested = false;
    hitTestSource = null;
    workspaceLocked = false;
    appState = STATE_DETECTING_SURFACE;
    if (startActivityBtn) {
        startActivityBtn.classList.remove('hidden');
    }
    if (helpEl) {
        helpEl.classList.remove('hidden');
    }
    if (hudEl) {
        hudEl.classList.remove('activity-active');
    }
    if (participantIdInput) {
        participantIdInput.disabled = false;
    }
    updateStatus("Escaneando...");
}

function onSessionEnd() {
    hitTestSource = null;
    hitTestSourceRequested = false;
    workspaceLocked = false;
    if (reticle) reticle.visible = false;
    if (hudEl) hudEl.classList.remove('activity-active');
    if (participantIdInput) participantIdInput.disabled = false;
    updateStatus("—");
}

function setupReticle() {
    // Retículo circular para projeção do hit-test na superfície real
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.045, 0.055, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;

    // Ponto central para facilitar a mira
    const centerDot = new THREE.Mesh(
        new THREE.CircleGeometry(0.008, 16).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x34c759, side: THREE.DoubleSide })
    );
    reticle.add(centerDot);

    scene.add(reticle);
}

// Algoritmo de embaralhamento uniforme Fisher-Yates
export function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ===========================================================================
// 6. SPAWN DE OBJETOS, MESA & ALVO FANTASMA
// ===========================================================================
export function createDockingCube(colorHex = 0x007aff, isGhost = false) {
    const group = new THREE.Group();

    // Geometria básica do cubo de 7cm
    const boxGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    const boxMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.35,
        metalness: 0.15,
        transparent: isGhost,
        opacity: isGhost ? 0.35 : 1.0,
        depthWrite: !isGhost
    });
    const cubeMesh = new THREE.Mesh(boxGeo, boxMat);
    group.add(cubeMesh);

    // Hit-box invisível expandida (10.5 cm) para facilitar o toque na tela do smartphone
    if (!isGhost) {
        const hitBoxGeo = new THREE.BoxGeometry(CUBE_SIZE * 1.5, CUBE_SIZE * 1.5, CUBE_SIZE * 1.5);
        const hitBoxMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
        hitBox.name = "touchHitBox";
        group.add(hitBox);
    }

    // Contorno (edges) de alto contraste
    const edgeGeo = new THREE.EdgesGeometry(boxGeo);
    const edgeMat = new THREE.LineBasicMaterial({
        color: isGhost ? 0xffffff : 0x111111,
        transparent: isGhost,
        opacity: isGhost ? 0.5 : 0.9
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    group.add(edges);

    // Indicador direcional de Yaw no topo (seta apontando para -Z)
    const arrowGroup = new THREE.Group();
    const shaftGeo = new THREE.BoxGeometry(CUBE_SIZE * 0.15, 0.003, CUBE_SIZE * 0.45);
    const headGeo = new THREE.ConeGeometry(CUBE_SIZE * 0.18, CUBE_SIZE * 0.28, 4);
    headGeo.rotateX(-Math.PI / 2); // Aponta para -Z
    headGeo.rotateY(Math.PI / 4);

    const arrowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: isGhost,
        opacity: isGhost ? 0.6 : 0.95
    });

    const shaft = new THREE.Mesh(shaftGeo, arrowMat);
    shaft.position.set(0, CUBE_SIZE / 2 + 0.002, CUBE_SIZE * 0.08);

    const head = new THREE.Mesh(headGeo, arrowMat);
    head.position.set(0, CUBE_SIZE / 2 + 0.002, -CUBE_SIZE * 0.2);

    arrowGroup.add(shaft);
    arrowGroup.add(head);
    group.add(arrowGroup);

    return group;
}

export function placeWorkspace(position) {
    // 1. Limpa objetos anteriores caso existam
    if (testCube) {
        scene.remove(testCube);
        testCube = null;
    }
    if (targetGroup) {
        scene.remove(targetGroup);
        targetGroup = null;
    }
    candidateObjects.forEach(cube => scene.remove(cube));
    candidateObjects = [];
    if (selectedObject) {
        removeSelectionHighlight(selectedObject);
        selectedObject = null;
    }
    isDragging = false;
    isTwisting = false;

    // 2. Fixa a altura da mesa e o plano matemático de interseção
    surfaceY = position.y;
    tabletopPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -surfaceY);
    surfacePlaced = true;

    // 3. Escolhe aleatoriamente a cor do alvo fantasma (Vermelho, Verde ou Azul)
    targetColorIndex = Math.floor(Math.random() * COLORS.length);
    const targetColor = COLORS[targetColorIndex];

    // 4. Cria o alvo fantasma (translúcido, com rotação de Yaw aleatória)
    targetGroup = createDockingCube(targetColor.hex, true);
    targetGroup.position.set(position.x, surfaceY + CUBE_SIZE / 2, position.z);
    targetGroup.rotation.y = Math.random() * Math.PI * 2;
    scene.add(targetGroup);

    // 5. Instancia os 3 cubos candidatos (Vermelho, Verde, Azul) a ~38 cm do alvo
    const toCamera = new THREE.Vector3(
        camera.position.x - position.x,
        0,
        camera.position.z - position.z
    );
    if (toCamera.lengthSq() < 0.001) {
        toCamera.set(0, 0, 1);
    } else {
        toCamera.normalize();
    }

    // Embaralha as posições das cores usando Fisher-Yates uniforme
    const shuffledIndices = shuffle([0, 1, 2]);
    const arcAngles = [-0.55, 0, 0.55]; // Disposição em arco (~ -32°, 0°, +32°)
    const distance = 0.38; // 38 cm (dentro do intervalo de 30 a 50 cm)

    for (let i = 0; i < 3; i++) {
        const colorIdx = shuffledIndices[i];
        const colorInfo = COLORS[colorIdx];
        const cube = createDockingCube(colorInfo.hex, false);

        // Rotaciona o vetor toCamera pelo ângulo do arco
        const angle = arcAngles[i];
        const dir = toCamera.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);

        cube.position.set(
            position.x + dir.x * distance,
            surfaceY + CUBE_SIZE / 2,
            position.z + dir.z * distance
        );

        // Rotação inicial aleatória em torno do eixo vertical (Yaw)
        cube.rotation.y = Math.random() * Math.PI * 2;

        cube.userData = {
            colorIndex: colorIdx,
            colorName: colorInfo.name,
            colorHex: colorInfo.hex,
            isTarget: (colorIdx === targetColorIndex)   
        };

        if (cube.userData.isTarget) targetCube = cube

        scene.add(cube);
        candidateObjects.push(cube);
    }

    if (!workspaceLocked) {
        appState = STATE_DETECTING_SURFACE;
        updateStatus("Superfície detectada");
    } else {
        appState = STATE_SELECTING_OBJECT;
        updateStatus(`Alvo: ${targetColor.name} | Selecione o cubo`);
    }
}

// ===========================================================================
// 7. SELEÇÃO DO OBJETO (RAYCAST & PROXIMIDADE)
// ===========================================================================
function applySelectionHighlight(group) {
    const oldHighlight = group.getObjectByName("selectionHighlight");
    if (oldHighlight) group.remove(oldHighlight);

    // Anel luminoso ao redor da base do cubo sobre o plano da mesa
    const ringGeo = new THREE.RingGeometry(CUBE_SIZE * 0.65, CUBE_SIZE * 0.95, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffcc00, // Dourado de seleção
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = "selectionHighlight";
    ring.position.set(0, -CUBE_SIZE / 2 + 0.002, 0);
    group.add(ring);

    // Destaque emissivo nas faces do cubo
    group.traverse(child => {
        if (child.isMesh && child.name !== "touchHitBox" && child.material && child.material.emissive) {
            child.material.emissive = new THREE.Color(0x333333);
        }
    });
}

export function removeSelectionHighlight(group) {
    if (!group) return;
    const oldHighlight = group.getObjectByName("selectionHighlight");
    if (oldHighlight) {
        group.remove(oldHighlight);
        if (oldHighlight.geometry) oldHighlight.geometry.dispose();
        if (oldHighlight.material) oldHighlight.material.dispose();
    }
    group.traverse(child => {
        if (child.isMesh && child.name !== "touchHitBox" && child.material && child.material.emissive) {
            child.material.emissive.setHex(0x000000);
        }
    });
}

export function deselectObject() {
    if (!selectedObject) return;
    removeSelectionHighlight(selectedObject);
    selectedObject = null;
    isDragging = false;
    isTwisting = false;
    touchHasMoved = false;
    objectSelectedAtTouchStart = false;
    if (centerReticle) centerReticle.classList.add('hidden');
    appState = STATE_SELECTING_OBJECT;
    if (navigator.vibrate) navigator.vibrate(40);
    if (targetColorIndex !== undefined && COLORS[targetColorIndex]) {
        updateStatus(`Alvo: ${COLORS[targetColorIndex].name} | Selecione o cubo`);
    } else {
        updateStatus("Selecione o cubo correspondente");
    }
}

export function selectCube(cube) {
    if (!cube) return false;

    else {
        selectedObject = cube;
        applySelectionHighlight(selectedObject);

        // Feedback tátil de sucesso no celular
        if (navigator.vibrate) navigator.vibrate([40, 40, 40]);

        if (trialStartTime === 0) {
            trialStartTime = performance.now();
        }
        appState = STATE_MANIPULATING;

        if (!selectedObject.userData.isTarget) {
            wrongSelections++;
        }

        if (isTechnique2()) {
            isDragging = false;
            isTwisting = false;
            const activeCamera = getActiveCamera();
            if (activeCamera) {
                lastPhoneRoll = getPhoneRoll(activeCamera);

                // Opção A: Posiciona imediatamente o cubo no centro da mira do celular
                if (tabletopPlane) {
                    const centerRay = new THREE.Raycaster();
                    centerRay.setFromCamera({ x: 0, y: 0 }, activeCamera);
                    const hitPoint = new THREE.Vector3();
                    if (centerRay.ray.intersectPlane(tabletopPlane, hitPoint)) {
                        const dist = hitPoint.distanceTo(activeCamera.position);
                        if (dist < 5.0 && centerRay.ray.direction.y < 0) {
                            selectedObject.position.x = hitPoint.x;
                            selectedObject.position.z = hitPoint.z;
                            selectedObject.position.y = surfaceY + CUBE_SIZE / 2;
                        }
                    }
                }
            }
            if (centerReticle) centerReticle.classList.remove('hidden');
        } else {
            // Técnica 1: Prepara arrasto imediato se o usuário mantiver o dedo na tela
            if (tabletopPlane) {
                const hitPoint = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(tabletopPlane, hitPoint)) {
                    dragOffset.set(
                        hitPoint.x - selectedObject.position.x,
                        0,
                        hitPoint.z - selectedObject.position.z
                    );
                    isDragging = true;
                }
            }
        }

        checkDockingTolerance();
        return true;
    }
}

export function handleObjectSelection(clientX, clientY) {
    updatePointer(clientX, clientY);
    const activeCamera = getActiveCamera();
    raycaster.setFromCamera(pointer, activeCamera);

    const meshes = [];
    candidateObjects.forEach(cube => {
        cube.traverse(child => {
            if (child.isMesh) {
                child.userData.parentCube = cube;
                meshes.push(child);
            }
        });
    });

    let pickedCube = null;
    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
        pickedCube = intersects[0].object.userData.parentCube;
    } else {
        // Tolerância de proximidade para toques em telas touch
        let minDistance = 0.10;
        candidateObjects.forEach(cube => {
            const dist = raycaster.ray.distanceToPoint(cube.position);
            if (dist < minDistance) {
                minDistance = dist;
                pickedCube = cube;
            }
        });
    }

    if (pickedCube) {
        if (!workspaceLocked) {
            lockWorkspace();
        }
        return selectCube(pickedCube);
    }
    return false;
}

// ===========================================================================
// 8. TÉCNICA 1: TOUCH GESTURES (BASELINE)
// ===========================================================================
function setupTouchGestures() {
    // 1. EVENTOS TOUCH (Mobile: arrasto com 1 dedo e torção/yaw com 2 dedos)
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    // Evita abrir menu de contexto ao usar botão direito para rotação
    window.addEventListener('contextmenu', (e) => {
        if (appState === STATE_MANIPULATING) {
            e.preventDefault();
        }
    });
}

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchHasMoved = false;
let objectSelectedAtTouchStart = false;

function onTouchStart(event) {
    if (event.target.closest('#hud') || event.target.closest('button') || event.target.closest('select') || event.target.closest('input') || event.target.closest('#fatigueModal')) {
        return;
    }

    // Safezone do cabeçalho: ignora toques na zona superior / notch / margem do HUD
    if (hudEl && event.touches[0]) {
        const hudRect = hudEl.getBoundingClientRect();
        if (event.touches[0].clientY <= hudRect.bottom + 12) {
            return;
        }
    }

    event.preventDefault();

    // Incrementa touchCount apenas durante a execução da tarefa (seleção e manipulação)
    if (appState === STATE_SELECTING_OBJECT || appState === STATE_MANIPULATING) {
        touchCount++;
    }

    if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = performance.now();
        touchHasMoved = false;
        objectSelectedAtTouchStart = (selectedObject !== null && appState === STATE_MANIPULATING);

        if (appState === STATE_SELECTING_OBJECT || (!workspaceLocked && appState === STATE_DETECTING_SURFACE)) {
            const selected = handleObjectSelection(touch.clientX, touch.clientY);
            if (!selected && !workspaceLocked && appState === STATE_DETECTING_SURFACE) {
                onSelect();
            }
        } else if (appState === STATE_MANIPULATING && selectedObject && tabletopPlane && !isTechnique2()) {
            updatePointer(touch.clientX, touch.clientY);
            const activeCamera = getActiveCamera();
            raycaster.setFromCamera(pointer, activeCamera);

            const hitPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(tabletopPlane, hitPoint)) {
                if (!activeCamera || hitPoint.distanceTo(activeCamera.position) < 3.0) {
                    dragOffset.set(
                        hitPoint.x - selectedObject.position.x,
                        0,
                        hitPoint.z - selectedObject.position.z
                    );
                    isDragging = false;
                    isTwisting = false;
                }
            }
        }
    } else if (event.touches.length === 2 && appState === STATE_MANIPULATING && selectedObject && !isTechnique2()) {
        isDragging = false;
        isTwisting = true;
        touchHasMoved = true;

        const t1 = event.touches[0];
        const t2 = event.touches[1];
        lastTouchAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
    }
}

function onTouchMove(event) {
    if (event.target.closest('#hud') || event.target.closest('button') || event.target.closest('select') || event.target.closest('input')) {
        return;
    }

    if (hudEl && event.touches[0]) {
        const hudRect = hudEl.getBoundingClientRect();
        if (event.touches[0].clientY <= hudRect.bottom + 12) {
            return;
        }
    }

    event.preventDefault();

    // Na Técnica 2, a translação e rotação são controladas pelo movimento do celular
    if (isTechnique2()) {
        return;
    }

    if (event.touches.length === 1 && selectedObject && appState === STATE_MANIPULATING && tabletopPlane) {
        const touch = event.touches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        if (!touchHasMoved && (dx * dx + dy * dy >= 64)) {
            touchHasMoved = true;
            isDragging = true;
        }

        if (isDragging) {
            updatePointer(touch.clientX, touch.clientY);
            const activeCamera = getActiveCamera();
            raycaster.setFromCamera(pointer, activeCamera);

            const hitPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(tabletopPlane, hitPoint)) {
                if (!activeCamera || hitPoint.distanceTo(activeCamera.position) < 3.0) {
                    selectedObject.position.x = hitPoint.x - dragOffset.x;
                    selectedObject.position.z = hitPoint.z - dragOffset.z;
                    selectedObject.position.y = surfaceY + CUBE_SIZE / 2;
                    checkDockingTolerance();
                }
            }
        }
    } else if (event.touches.length === 2 && isTwisting && selectedObject && appState === STATE_MANIPULATING) {
        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const currentTouchAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
        let deltaAngle = currentTouchAngle - lastTouchAngle;

        // Normalização contínua de deltaAngle em [-PI, PI] para evitar saltos bruscos
        while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

        selectedObject.rotation.y -= deltaAngle;
        lastTouchAngle = currentTouchAngle;
        checkDockingTolerance();
    }
}

function onTouchEnd(event) {
    if (event.touches.length === 0) {
        const duration = performance.now() - touchStartTime;
        // Se começou o toque com objeto selecionado e foi um toque rápido sem arrasto -> Tap de Deseleção ou Troca
        if (objectSelectedAtTouchStart && selectedObject && !touchHasMoved && duration < 450) {
            handleTapDeselectionOrSwitch(touchStartX, touchStartY);
        }
        isDragging = false;
        isTwisting = false;
        touchHasMoved = false;
        objectSelectedAtTouchStart = false;
    } else if (event.touches.length === 1 && isTwisting) {
        isTwisting = false;
        isDragging = false;
    }
}

function handleTapDeselectionOrSwitch(clientX, clientY) {
    updatePointer(clientX, clientY);
    const activeCamera = getActiveCamera();
    raycaster.setFromCamera(pointer, activeCamera);

    const meshes = [];
    candidateObjects.forEach(cube => {
        cube.traverse(child => {
            if (child.isMesh) {
                child.userData.parentCube = cube;
                meshes.push(child);
            }
        });
    });

    let pickedCube = null;
    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
        pickedCube = intersects[0].object.userData.parentCube;
    } else {
        let minDistance = 0.10;
        candidateObjects.forEach(cube => {
            const dist = raycaster.ray.distanceToPoint(cube.position);
            if (dist < minDistance) {
                minDistance = dist;
                pickedCube = cube;
            }
        });
    }

    if (!pickedCube || pickedCube === selectedObject) {
        // Toque no próprio objeto selecionado ou no vazio/mesa -> Deseleciona
        deselectObject();
    } else {
        // Toque em outro cubo candidato -> Troca de seleção
        deselectObject();
        selectCube(pickedCube);
    }
}

// ===========================================================================
// 10. AVALIAÇÃO DE TOLERÂNCIA DE DOCKING (3 DoF: X, Z, YAW)
// ===========================================================================
export function checkDockingTolerance() {
    if (!selectedObject || !targetGroup) {
        return { inTolerance: false, posErrorCm: 0, yawErrorDeg: 0 };
    }

    // 1. Erro de translação no plano horizontal XZ (em cm)
    const dx = (targetCube.position.x - targetGroup.position.x) * 100;
    const dz = (targetCube.position.z - targetGroup.position.z) * 100;
    const posErrorCm = Math.sqrt(dx * dx + dz * dz);

    // 2. Erro de rotação em torno do eixo vertical Yaw (em graus [0, 180])
    let yawDiff = (targetCube.rotation.y - targetGroup.rotation.y) % (Math.PI * 2);
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const yawErrorDeg = Math.abs(yawDiff * 180 / Math.PI);

    // 3. Verificação de tolerância (2 cm e 10 graus)
    const inTolerance = (posErrorCm <= TOLERANCE_POS_CM && yawErrorDeg <= TOLERANCE_YAW_DEG);

    // 4. Feedback no HUD superior
    updateStatus(`Δpos: ${posErrorCm.toFixed(1)}cm | Δyaw: ${yawErrorDeg.toFixed(0)}°`, inTolerance);

    // 5. Feedback no objeto selecionado (anel fica verde quando encaixado)
    const highlight = selectedObject.getObjectByName("selectionHighlight");
    if (highlight) {
        highlight.material.color.setHex(inTolerance ? 0x34c759 : 0xffcc00);
    }

    return { inTolerance, posErrorCm, yawErrorDeg };
}

export function confirmTrial() {
    if (appState === STATE_FINISHED) return;

    if (appState !== STATE_MANIPULATING) {
        updateStatus("Selecione primeiro o cubo correspondente!");
        return;
    }

    const { posErrorCm, yawErrorDeg } = checkDockingTolerance();
    const completionTimeS = trialStartTime > 0 ? (performance.now() - trialStartTime) / 1000 : 0;
    const participantId = participantIdInput ? participantIdInput.value.trim() : "P01";
    const currentTechnique = (mappingSelect && mappingSelect.value === "2") ? "technique2" : "touch";

    // Registra métricas da tentativa
    csvRows.push({
        participant_id: participantId,
        technique: currentTechnique,
        trial: currentTrial,
        completion_time_s: parseFloat(completionTimeS.toFixed(3)),
        pos_error_cm: parseFloat(posErrorCm.toFixed(2)),
        yaw_error_deg: parseFloat(yawErrorDeg.toFixed(1)),
        wrong_selections: wrongSelections,
        touch_count: touchCount,
        tracking_lost: trackingLostCount,
        arm_fatigue: lastArmFatigue ?? ""
    });

    if (centerReticle) centerReticle.classList.add('hidden');
    selectedObject = null;

    if (currentTrial < 3) {
        currentTrial++;

        // Reset das métricas para o próximo trial e início do timer
        wrongSelections = 0;
        touchCount = 0;
        trackingLostCount = 0;
        trialStartTime = performance.now();

        // Reposiciona novo alvo e cubos no mesmo plano da mesa
        const currentPos = targetGroup ? targetGroup.position.clone() : new THREE.Vector3(0, surfaceY, -0.7);
        currentPos.y = surfaceY;
        placeWorkspace(currentPos);

        workspaceLocked = true;
        if (startActivityBtn) startActivityBtn.classList.add('hidden');
        if (reticle) reticle.visible = false;
        appState = STATE_SELECTING_OBJECT;
        updateStatus(`Trial ${currentTrial}: Alvo ${COLORS[targetColorIndex].name} | Selecione o cubo`);
    } else {
        appState = STATE_FINISHED;
        trialStartTime = 0;
        if (hudEl) hudEl.classList.remove('activity-active');
        if (confirmBtn) confirmBtn.style.display = 'none';
        updateStatus("3 trials concluídos! Avalie a fadiga.");
        showFatigueModal();
    }
}

export function showFatigueModal() {
    if (fatigueModal) {
        const titleSpan = fatigueModal.querySelector('span');
        if (titleSpan) {
            titleSpan.textContent = `Fim da Técnica ${mappingSelect ? mappingSelect.value : "1"}! Quão cansados estão seus braços?`;
        }
        fatigueModal.classList.remove('hidden');
    }
}

export function handleFatigueRating(rating) {
    lastArmFatigue = parseInt(rating, 10);
    // Aplica a nota de fadiga a todas as linhas do participante
    csvRows.forEach(row => {
        row.arm_fatigue = lastArmFatigue;
    });

    if (fatigueModal) fatigueModal.classList.add('hidden');
    updateStatus("Fadiga registrada! Baixe o CSV.");
}

// ===========================================================================
// 11. INSTRUMENTAÇÃO, CSV & INTERFACE
// ===========================================================================
function setupEventListeners() {
    const handleStartActivity = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        lockWorkspace();
    };
    if (startActivityBtn) {
        startActivityBtn.addEventListener('click', handleStartActivity);
        startActivityBtn.addEventListener('touchend', handleStartActivity);
    }

    const handleReconfig = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        workspaceLocked = false;
        appState = STATE_DETECTING_SURFACE;
        trialStartTime = 0;
        if (selectedObject) deselectObject();
        if (centerReticle) centerReticle.classList.add('hidden');
        if (startActivityBtn) {
            startActivityBtn.classList.remove('hidden');
        }
        if (helpEl) {
            helpEl.classList.remove('hidden');
        }
        if (hudEl) {
            hudEl.classList.remove('activity-active');
        }
        if (participantIdInput) {
            participantIdInput.disabled = false;
        }
        const pos = (reticle && reticle.visible) ?
            new THREE.Vector3().setFromMatrixPosition(reticle.matrix) :
            (targetGroup ? targetGroup.position.clone() : new THREE.Vector3(0, -0.15, -0.7));
        placeWorkspace(pos);
        updateStatus(reticle && reticle.visible ? "Superfície detectada" : "Escaneando...");
    };

    const handleConfirm = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        confirmTrial();
    };
    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleConfirm);
        confirmBtn.addEventListener('touchend', handleConfirm);
    }

    const handleDownload = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        exportCSV();
    };
    if (downloadBtn) {
        downloadBtn.addEventListener('click', handleDownload);
        downloadBtn.addEventListener('touchend', handleDownload);
    }

    if (fatigueButtons) {
        fatigueButtons.querySelectorAll('button').forEach(btn => {
            const onRating = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const rating = btn.getAttribute('data-rating');
                handleFatigueRating(rating);
            };
            btn.addEventListener('click', onRating);
            btn.addEventListener('touchend', onRating);
        });
    }

    function updateHelpText() {
        if (!helpEl) return;
        if (isTechnique2()) {
            helpEl.textContent = "Técnica 2: Toque no cubo para selecionar. Mova o celular para posicionar. Gire o celular como um volante para rotacionar. Confirm registra o trial.";
        } else {
            helpEl.textContent = "Técnica 1: Toque para selecionar. 1 dedo arrasta, 2 dedos giram. Toque fora para deselecionar. Confirm registra o trial.";
        }
    }
    if (mappingSelect) {
        mappingSelect.addEventListener('change', updateHelpText);
    }
    updateHelpText();

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            confirmTrial();
        } else if (event.key === 'Escape') {
            deselectObject();
        }
    });
}

export function updateStatus(text, inTolerance = false) {
    if (statusEl) {
        statusEl.textContent = text;
        if (inTolerance) {
            statusEl.classList.add("in-tolerance");
        } else {
            statusEl.classList.remove("in-tolerance");
        }
    }
}

export function exportCSV() {
    if (csvRows.length === 0) {
        alert("Nenhum dado registrado para download ainda.");
        return;
    }

    let csvContent = CSV_HEADER.join(",") + "\n";
    csvRows.forEach(row => {
        const line = CSV_HEADER.map(field => row[field] ?? "").join(",");
        csvContent += line + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const pId = participantIdInput ? participantIdInput.value.trim() : "P01";
    const tech = (mappingSelect && mappingSelect.value === "2") ? "technique2" : "touch";
    link.setAttribute("href", url);
    link.setAttribute("download", `${pId}-${tech}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ===========================================================================
// 12. LOOP DE RENDERIZAÇÃO
// ===========================================================================
function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        // 1. Monitoramento do rastreamento do dispositivo via getViewerPose
        const viewerPose = frame.getViewerPose(referenceSpace);
        const trackingOk = Boolean(viewerPose && !viewerPose.emulatedPosition);

        // Contabiliza tracking_lost apenas durante a execução da tarefa
        if (appState === STATE_SELECTING_OBJECT || appState === STATE_MANIPULATING) {
            if (!trackingOk && lastTrackingState) {
                trackingLostCount++;
                lastTrackingState = false;
            } else if (trackingOk && !lastTrackingState) {
                lastTrackingState = true;
            }
        } else {
            lastTrackingState = trackingOk;
        }

        // 2. Hit-test para posicionamento da mesa
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });

            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
                if (reticle) reticle.visible = false;
                updateStatus("—");
            });

            hitTestSourceRequested = true;
        }

        if (!workspaceLocked && hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(referenceSpace);

                if (pose) {
                    if (reticle) {
                        reticle.visible = true;
                        reticle.matrix.fromArray(pose.transform.matrix);
                    }
                    if (appState === STATE_DETECTING_SURFACE) {
                        updateStatus("Superfície detectada");
                    }
                } else if (reticle) {
                    reticle.visible = false;
                }
            } else {
                if (reticle) reticle.visible = false;
                if (appState === STATE_DETECTING_SURFACE) {
                    updateStatus("Escaneando...");
                }
            }
        } else if (reticle) {
            reticle.visible = false;
        }
    }

    // 3. Atualização contínua da Técnica 2: Raycast Central e Rotação pelo Movimento do Celular
    if (isTechnique2() && appState === STATE_MANIPULATING && selectedObject && tabletopPlane) {
        const activeCamera = getActiveCamera();
        if (activeCamera) {
            // Translação: Raycast emitido do centro exato da tela (0, 0)
            raycaster.setFromCamera({ x: 0, y: 0 }, activeCamera);
            const hitPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(tabletopPlane, hitPoint)) {
                const dist = hitPoint.distanceTo(activeCamera.position);
                // Valida se o raio aponta para a mesa e em distância plausível (< 5 metros)
                if (dist < 5.0 && raycaster.ray.direction.y < 0) {
                    selectedObject.position.x = hitPoint.x;
                    selectedObject.position.z = hitPoint.z;
                    selectedObject.position.y = surfaceY + CUBE_SIZE / 2;
                }
            }

            // Rotação: Mapeamento tipo Volante com ganho (Roll do celular rotaciona o Yaw do cubo)
            const currentPhoneRoll = getPhoneRoll(activeCamera);
            let deltaRoll = currentPhoneRoll - lastPhoneRoll;
            while (deltaRoll > Math.PI) deltaRoll -= Math.PI * 2;
            while (deltaRoll < -Math.PI) deltaRoll += Math.PI * 2;

            selectedObject.rotation.y += deltaRoll * ROTATION_GAIN_TECHNIQUE2;
            lastPhoneRoll = currentPhoneRoll;

            // Feedback imediato no HUD e no anel de tolerância
            checkDockingTolerance();
        }
    }

    renderer.render(scene, camera);
}

init();
