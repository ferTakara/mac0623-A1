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
    const sessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('ar-overlay') }
    };
    document.body.appendChild(ARButton.createButton(renderer, sessionInit));

    // 4.6 Registro de eventos de sessão e interface
    renderer.xr.addEventListener('sessionstart', onSessionStart);
    renderer.xr.addEventListener('sessionend', onSessionEnd);

    setupEventListeners();
    setupTouchGestures();

    window.addEventListener('resize', onWindowResize);

    // 4.7 Loop de animação principal
    renderer.setAnimationLoop(render);
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
    // TODO: Obter viewerReferenceSpace e inicializar hitTestSource
}

function onSessionEnd() {
    // TODO: Resetar variáveis de sessão AR e visibilidade do retículo
}

function setupReticle() {
    // TODO: Criar geometria e material do retículo circular de mira
}

// ===========================================================================
// 6. SPAWN DE OBJETOS, MESA & ALVO FANTASMA
// ===========================================================================
export function createDockingCube(colorHex, isGhost = false) {
    // TODO: Construir grupo com cubo, indicador direcional de Yaw e contorno
    return new THREE.Group();
}

export function placeWorkspace(position) {
    // TODO: Fixar altura da mesa, instanciar alvo fantasma e os 3 cubos candidatos
}

// ===========================================================================
// 7. SELEÇÃO DO OBJETO (RAYCAST & PROXIMIDADE)
// ===========================================================================
export function handleObjectSelection(clientX, clientY) {
    // TODO: Realizar raycast a partir do toque na tela
    // TODO: Identificar o cubo tocado
    // TODO: Se correto -> selecionar e ocultar/remover os outros 2 cubos
    // TODO: Se errado -> incrementar wrongSelections e vibrar
}

// ===========================================================================
// 8. TÉCNICA 1: TOUCH GESTURES (BASELINE)
// ===========================================================================
function setupTouchGestures() {
    // TODO: Adicionar listeners para arrasto com 1 dedo (drag)
    // TODO: Adicionar listeners para torção com 2 dedos (twist/yaw)
}

function updateTouchDrag(clientX, clientY) {
    // TODO: Projetar ponto de toque no plano da mesa para mover cubo selecionado
}

// ===========================================================================
// 9. TÉCNICA 2: DEVICE-ORIENTATION CARRY (DESIGN DO ALUNO)
// ===========================================================================
function setupCarryTechnique() {
    // TODO: Configurar listeners do botão flutuante #btn-carry (segurar/soltar)
}

function updateCarryTechnique() {
    // TODO: Translação: projetar retículo central da tela no plano da mesa
    // TODO: Rotação: mapear o Yaw do celular diretamente na orientação do cubo
}

// ===========================================================================
// 10. AVALIAÇÃO DE TOLERÂNCIA DE DOCKING (3 DoF: X, Z, YAW)
// ===========================================================================
export function checkDockingTolerance() {
    // TODO: Calcular erro de posição (cm) e erro angular de Yaw (graus)
    // TODO: Retornar { inTolerance, posErrorCm, yawErrorDeg }
    return { inTolerance: false, posErrorCm: 0, yawErrorDeg: 0 };
}

export function confirmTrial() {
    // TODO: Checar tolerância, registrar métricas na linha do CSV
    // TODO: Avançar para o próximo trial (1 -> 2 -> 3)
    // TODO: Após o 3º trial da técnica, abrir modal de fadiga de braço
}

// ===========================================================================
// 11. INSTRUMENTAÇÃO, CSV & INTERFACE
// ===========================================================================
function setupEventListeners() {
    // TODO: Vincular cliques dos botões (Confirmar, Download CSV, Troca de Técnica)
    // TODO: Vincular botões do modal de fadiga muscular (1 a 5)
}

export function updateStatus(text, inTolerance = false) {
    // TODO: Atualizar banner de telemetria sem dicas ou spoilers
}

export function exportCSV() {
    // TODO: Gerar arquivo CSV para download com os 9 campos instrumentados
}

// ===========================================================================
// 12. LOOP DE RENDERIZAÇÃO
// ===========================================================================
function render(timestamp, frame) {
    if (frame) {
        // TODO: Processar resultados do hit-test a cada frame
        // TODO: Atualizar pose do retículo e monitorar tracking_lost
    }

    // TODO: Atualizar manipulação ativa (se Carry ativo ou monitoramento contínuo)
    // TODO: Renderizar cena
    renderer.render(scene, camera);
}

// Executa a inicialização ao carregar o módulo
init();
