import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// ===========================================================================
// 1. CONSTANTES & CONFIGURAÇÕES GERAIS

export const CUBE_SIZE = 0.07;           
export const TARGET_DISTANCE_MIN = 0.30;
export const TARGET_DISTANCE_MAX = 0.45; 
export const TOLERANCE_POS_CM = 2.0;
export const TOLERANCE_YAW_DEG = 10.0;

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

// Cabeçalho dos 9 campos obrigatórios do CSV
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
const participantIdInput = document.getElementById("participantId");
const mappingSelect = document.getElementById("mappingSelect");
const trialCountEl = document.getElementById("trialCount");
const confirmBtn = document.getElementById("confirmBtn");
const downloadBtn = document.getElementById("downloadBtn");
const reconfigBtn = document.getElementById("reconfigBtn");
const startActivityBtn = document.getElementById("startActivityBtn");
const statusEl = document.getElementById("status");


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
    updateStatus("Escaneando...");

    setupEventListeners();
    setupTouchGestures();

    window.addEventListener('resize', onWindowResize);

    // 4.7 Loop de animação principal
    renderer.setAnimationLoop(render);
}

function onSelect() {
    // Se o workplace já foi travado com "Começar atividade?", impede mover os objetos
    if (workspaceLocked) return;

    if (reticle && reticle.visible) {
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        reticle.matrix.decompose(pos, quat, scale);

        // Ancara a área de trabalho completa na superfície real detectada
        placeWorkspace(pos);

        // Exibe o botão para o usuário poder travar e iniciar a atividade
        if (startActivityBtn) {
            startActivityBtn.classList.remove('hidden');
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
    updateStatus("Escaneando...");
}

function onSessionEnd() {
    hitTestSource = null;
    hitTestSourceRequested = false;
    workspaceLocked = false;
    if (reticle) reticle.visible = false;
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
    selectedObject = null;

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

    // Embaralha as posições das cores
    const shuffledIndices = [0, 1, 2].sort(() => Math.random() - 0.5);
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
    const ringGeo = new THREE.RingGeometry(CUBE_SIZE * 0.65, CUBE_SIZE * 0.85, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffcc00, // Dourado de seleção
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = "selectionHighlight";
    ring.position.set(0, -CUBE_SIZE / 2 + 0.002, 0);
    group.add(ring);

    // Destaque emissivo sutil nas faces do cubo
    const cubeMesh = group.children[0];
    if (cubeMesh && cubeMesh.material) {
        cubeMesh.material.emissive = new THREE.Color(0x333333);
    }
}

export function handleObjectSelection(clientX, clientY) {
    if (appState !== STATE_SELECTING_OBJECT) return false;

    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

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
        const hitMesh = intersects[0].object;
        const clickedCube = hitMesh.userData.parentCube;

        if (clickedCube) {
            if (clickedCube.userData.isTarget) {
                // Seleção CORRETA
                selectedObject = clickedCube;
                applySelectionHighlight(selectedObject);

                // Oculta/remove os outros 2 cubos candidatos (Class 15)
                candidateObjects.forEach(cube => {
                    if (cube !== selectedObject) {
                        scene.remove(cube);
                    }
                });

                trialStartTime = performance.now();
                appState = STATE_MANIPULATING;

                // Prepara arrasto imediato se o usuário mantiver o dedo na tela
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

                checkDockingTolerance();
                return true;
            } else {
                // Seleção INCORRETA
                wrongSelections++;
                if (navigator.vibrate) navigator.vibrate(120);

                updateStatus("Cubo incorreto! Escolha a cor do alvo.");
                setTimeout(() => {
                    if (appState === STATE_SELECTING_OBJECT && targetColorIndex !== undefined && COLORS[targetColorIndex]) {
                        updateStatus(`Alvo: ${COLORS[targetColorIndex].name} | Selecione o cubo`);
                    }
                }, 1200);
                return false;
            }
        }
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

function onTouchStart(event) {
    if (event.target.closest('#hud') || event.target.closest('button') || event.target.closest('select') || event.target.closest('input')) {
        return;
    }
    event.preventDefault();
    touchCount++;

    if (event.touches.length === 1) {
        const touch = event.touches[0];

        // Se ainda não iniciou a atividade e o usuário tocou na tela, reposiciona a mesa
        if (!workspaceLocked && appState === STATE_DETECTING_SURFACE) {
            onSelect();
            return;
        }

        if (appState === STATE_SELECTING_OBJECT) {
            handleObjectSelection(touch.clientX, touch.clientY);
        } else if (appState === STATE_MANIPULATING && selectedObject && tabletopPlane) {
            pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
            pointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);

            const hitPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(tabletopPlane, hitPoint)) {
                if (!camera || hitPoint.distanceTo(camera.position) < 3.0) {
                    dragOffset.set(
                        hitPoint.x - selectedObject.position.x,
                        0,
                        hitPoint.z - selectedObject.position.z
                    );
                    isDragging = true;
                    isTwisting = false;
                }
            }
        }
    } else if (event.touches.length === 2 && appState === STATE_MANIPULATING && selectedObject) {
        isDragging = false;
        isTwisting = true;

        const t1 = event.touches[0];
        const t2 = event.touches[1];
        lastTouchAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
    }
}

function onTouchMove(event) {
    if (event.target.closest('#hud') || event.target.closest('button') || event.target.closest('select') || event.target.closest('input')) {
        return;
    }
    event.preventDefault();

    if (event.touches.length === 1 && isDragging && selectedObject && appState === STATE_MANIPULATING && tabletopPlane) {
        const touch = event.touches[0];
        pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const hitPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(tabletopPlane, hitPoint)) {
            if (!camera || hitPoint.distanceTo(camera.position) < 3.0) {
                selectedObject.position.x = hitPoint.x - dragOffset.x;
                selectedObject.position.z = hitPoint.z - dragOffset.z;
                selectedObject.position.y = surfaceY + CUBE_SIZE / 2;
                checkDockingTolerance();
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
        isDragging = false;
        isTwisting = false;
    } else if (event.touches.length === 1 && isTwisting) {
        isTwisting = false;
        isDragging = false;
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
    const dx = (selectedObject.position.x - targetGroup.position.x) * 100;
    const dz = (selectedObject.position.z - targetGroup.position.z) * 100;
    const posErrorCm = Math.sqrt(dx * dx + dz * dz);

    // 2. Erro de rotação em torno do eixo vertical Yaw (em graus [0, 180])
    let yawDiff = (selectedObject.rotation.y - targetGroup.rotation.y) % (Math.PI * 2);
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
        tracking_lost: trackingLostCount
    });

    if (currentTrial < 3) {
        currentTrial++;
        if (trialCountEl) trialCountEl.textContent = `Trial ${currentTrial}`;

        // Reset das métricas para o próximo trial
        wrongSelections = 0;
        touchCount = 0;
        trackingLostCount = 0;
        trialStartTime = 0;

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
        updateStatus("3 trials concluídos! Baixe o CSV.");
        const fatigue = prompt("Fim da Técnica 1! Quão cansados estão seus braços? (Escala de 1 a 5):", "1");
        if (fatigue) lastArmFatigue = fatigue;
        alert("3 trials da Técnica 1 finalizados com sucesso! Clique em 'Download CSV' para baixar seus dados.");
    }
}

// ===========================================================================
// 11. INSTRUMENTAÇÃO, CSV & INTERFACE
// ===========================================================================
function setupEventListeners() {
    if (startActivityBtn) {
        startActivityBtn.addEventListener('click', () => {
            workspaceLocked = true;
            startActivityBtn.classList.add('hidden');
            if (reticle) reticle.visible = false;
            appState = STATE_SELECTING_OBJECT;
            if (targetColorIndex !== undefined && COLORS[targetColorIndex]) {
                updateStatus(`Alvo: ${COLORS[targetColorIndex].name} | Selecione o cubo correspondente`);
            }
        });
    }

    if (reconfigBtn) {
        reconfigBtn.addEventListener('click', () => {
            workspaceLocked = false;
            appState = STATE_DETECTING_SURFACE;
            if (startActivityBtn) {
                startActivityBtn.classList.remove('hidden');
            }
            const pos = (reticle && reticle.visible) ?
                new THREE.Vector3().setFromMatrixPosition(reticle.matrix) :
                (targetGroup ? targetGroup.position.clone() : new THREE.Vector3(0, -0.15, -0.7));
            placeWorkspace(pos);
            updateStatus(reticle && reticle.visible ? "Superfície detectada" : "Escaneando...");
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmTrial);
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', exportCSV);
    }

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            confirmTrial();
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

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(referenceSpace);

                if (pose) {
                    lastTrackingState = true;
                    if (!workspaceLocked && reticle) {
                        reticle.visible = true;
                        reticle.matrix.fromArray(pose.transform.matrix);
                        if (appState === STATE_DETECTING_SURFACE) {
                            updateStatus("Superfície detectada");
                        }
                    } else if (reticle) {
                        reticle.visible = false;
                    }
                } else {
                    if (reticle) reticle.visible = false;
                    if (lastTrackingState) {
                        trackingLostCount++;
                        lastTrackingState = false;
                    }
                    if (appState === STATE_DETECTING_SURFACE && !workspaceLocked) {
                        updateStatus("Rastreamento instável");
                    }
                }
            } else {
                if (reticle) reticle.visible = false;
                if (lastTrackingState) {
                    trackingLostCount++;
                    lastTrackingState = false;
                }
                if (appState === STATE_DETECTING_SURFACE && !workspaceLocked) {
                    updateStatus("Escaneando...");
                }
            }
        }
    }

    renderer.render(scene, camera);
}

init();
