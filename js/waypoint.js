import * as THREE from 'three';
import { landmarksData, wallsData } from './environment.js';

export let beacon;
export const WAYPOINT_TOLERANCE_RADIUS = 1.0;
const BOUNDS = 18; // Ampliado para aproveitar melhor os cantos das salas

export function buildWaypoint(scene) {
    // Pilar brilhante para ser visto de longe
    const geo = new THREE.CylinderGeometry(0.2, 0.2, 4, 16);
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.6,
        emissive: 0x00ffff,
        emissiveIntensity: 0.8
    });
    beacon = new THREE.Mesh(geo, mat);
    
    // Anel no chão demarcando o raio de tolerância (0.75 a 1.5 unidades)
    const ringGeo = new THREE.RingGeometry(WAYPOINT_TOLERANCE_RADIUS - 0.05, WAYPOINT_TOLERANCE_RADIUS, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.98; // Quase encostando no chão
    beacon.add(ring);

    beacon.position.set(0, 2, -5); // Posição inicial
    beacon.visible = false;
    scene.add(beacon);
}

export function spawnNextWaypoint() {
    if (!beacon) return;
    
    let x, z;
    let isValid = false;
    let attempts = 0;
    
    // Tenta sortear uma posição válida que não colida com landmarks e paredes
    while (!isValid && attempts < 100) {
        x = (Math.random() * BOUNDS * 2) - BOUNDS;
        z = (Math.random() * BOUNDS * 2) - BOUNDS;
        
        isValid = true;
        
        // 1. Checagem contra os Landmarks
        for (let lm of landmarksData) {
            const dx = x - lm.pos[0];
            const dz = z - lm.pos[2];
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < lm.radius + WAYPOINT_TOLERANCE_RADIUS) {
                isValid = false;
                break;
            }
        }

        // 2. Checagem contra as Paredes (AABB)
        if (isValid) {
            for (let w of wallsData) {
                // Dimensões da parede (comprimento / 2)
                const halfX = w.size[0] / 2;
                const halfZ = w.size[2] / 2;
                
                // Limites da parede + tolerância
                const minX = w.pos[0] - halfX - WAYPOINT_TOLERANCE_RADIUS;
                const maxX = w.pos[0] + halfX + WAYPOINT_TOLERANCE_RADIUS;
                const minZ = w.pos[2] - halfZ - WAYPOINT_TOLERANCE_RADIUS;
                const maxZ = w.pos[2] + halfZ + WAYPOINT_TOLERANCE_RADIUS;
                
                if (x > minX && x < maxX && z > minZ && z < maxZ) {
                    isValid = false;
                    break;
                }
            }
        }
        
        attempts++;
    }
    
    beacon.position.set(x, 2, z);
}

export function checkWaypointTolerance(camera) {
    if (!beacon || !beacon.visible) return { distance: 0, withinTolerance: false };
    
    // Pegar posição global da câmera (cabeça do jogador)
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    
    // Calcula a distância 2D apenas no plano XZ (ignorando a altura Y da cabeça)
    const dx = camPos.x - beacon.position.x;
    const dz = camPos.z - beacon.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    return {
        distance: distance,
        withinTolerance: distance <= WAYPOINT_TOLERANCE_RADIUS
    };
}
