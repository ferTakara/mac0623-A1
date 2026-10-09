import * as THREE from 'three';
import { landmarksData, wallsData } from './environment.js';
import { beacon } from './waypoint.js';

export let wimGroup;
export let wimAvatar;
export let wimBeacon;
export const WIM_SCALE = 0.014; // Reduzido em 30% (antes era 0.02)

export function buildWIM() {
    wimGroup = new THREE.Group();
    wimGroup.visible = false; // Começa invisível

    // Base do WIM (O "tabuleiro")
    const boardSize = 40 * WIM_SCALE;
    const boardGeo = new THREE.PlaneGeometry(boardSize, boardSize);
    const boardMat = new THREE.MeshStandardMaterial({ 
        color: 0x222222,
        roughness: 0.9,
        side: THREE.DoubleSide
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.rotation.x = -Math.PI / 2;
    // Eleva um pouco para não ficar exatamente no centro do controle
    board.position.set(0, 0.1, -0.2); 
    
    // Adicionar um contorno/borda para ficar bonito
    const edgeGeo = new THREE.BoxGeometry(boardSize + 0.02, 0.02, boardSize + 0.02);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.set(0, 0.09, -0.2);
    wimGroup.add(edge);
    wimGroup.add(board);

    // Miniaturas dos Landmarks
    landmarksData.forEach(lm => {
        let geo;
        if (lm.type === 'box') geo = new THREE.BoxGeometry(lm.size[0]*WIM_SCALE, lm.size[1]*WIM_SCALE, lm.size[2]*WIM_SCALE);
        else if (lm.type === 'cylinder') geo = new THREE.CylinderGeometry(lm.size[0]*WIM_SCALE, lm.size[1]*WIM_SCALE, lm.size[2]*WIM_SCALE, 8);
        else if (lm.type === 'cone') geo = new THREE.ConeGeometry(lm.size[0]*WIM_SCALE, lm.size[1]*WIM_SCALE, 8);
        
        const mat = new THREE.MeshStandardMaterial({ color: lm.color, roughness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        
        // Posição local relativa à base do WIM
        mesh.position.set(lm.pos[0] * WIM_SCALE, (lm.pos[1] * WIM_SCALE) + 0.1, (lm.pos[2] * WIM_SCALE) - 0.2);
        wimGroup.add(mesh);
    });

    // Miniaturas das Paredes
    wallsData.forEach(w => {
        const geo = new THREE.BoxGeometry(w.size[0]*WIM_SCALE, w.size[1]*WIM_SCALE, w.size[2]*WIM_SCALE);
        const mat = new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);
        
        mesh.position.set(w.pos[0] * WIM_SCALE, (w.pos[1] * WIM_SCALE) + 0.1, (w.pos[2] * WIM_SCALE) - 0.2);
        wimGroup.add(mesh);
    });

    // O Alvo (Beacon) no WIM
    const beaconGeo = new THREE.CylinderGeometry(0.2 * WIM_SCALE, 0.2 * WIM_SCALE, 4 * WIM_SCALE, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    wimBeacon = new THREE.Mesh(beaconGeo, beaconMat);
    wimGroup.add(wimBeacon);

    // O Avatar do jogador (um pequeno pino/bonequinho vermelho)
    const avatarGeo = new THREE.CylinderGeometry(0.01, 0.005, 0.04, 8);
    const avatarMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });
    wimAvatar = new THREE.Mesh(avatarGeo, avatarMat);
    wimAvatar.position.set(0, 0.1 + 0.02, -0.2); // Centro do tabuleiro
    wimAvatar.renderOrder = 999; // Sempre visível por cima de tudo
    wimGroup.add(wimAvatar);

    // Hitbox invisível maior para facilitar agarrar o avatar
    const hitGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const avatarHitbox = new THREE.Mesh(hitGeo, hitMat);
    avatarHitbox.userData.isWimAvatar = true;
    wimAvatar.add(avatarHitbox);

    return wimGroup;
}

// Atualiza a posição do avatar e do beacon no tabuleiro WIM com base no mundo real
export function updateWimAvatarFromCamera(camera) {
    if (!wimGroup.visible) return;
    
    // Atualiza a posição do mini-beacon
    if (beacon && beacon.visible) {
        wimBeacon.visible = true;
        // 0.1 é a altura base do WIM, 0.2 é o deslocamento Z
        wimBeacon.position.set(
            beacon.position.x * WIM_SCALE, 
            0.1 + (2 * WIM_SCALE), 
            (beacon.position.z * WIM_SCALE) - 0.2
        );
    } else {
        wimBeacon.visible = false;
    }

    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    
    // Converte a posição do mundo real para a posição local no WIM
    const localX = camPos.x * WIM_SCALE;
    const localZ = camPos.z * WIM_SCALE;
    
    // Atualiza apenas se não estivermos arrastando o avatar!
    // O controle de estado de arrasto será feito no main.js
    wimAvatar.position.set(localX, 0.1 + 0.02, localZ - 0.2);
}

// Converte a posição do avatar no WIM de volta para o mundo real
export function getWorldPositionFromWimAvatar() {
    const worldX = wimAvatar.position.x / WIM_SCALE;
    const worldZ = (wimAvatar.position.z + 0.2) / WIM_SCALE;
    return new THREE.Vector3(worldX, 0, worldZ);
}

// Move o Rig (e todos os seus filhos, como câmera e controles) com base no Avatar do WIM
export function applyWimAvatarToRig(rig, camera) {
    const targetWorld = getWorldPositionFromWimAvatar();
    
    // A câmera está no espaço local do rig. Queremos que a câmera acabe no targetWorld.
    // targetWorld = rig.position + camera.position
    // logo, rig.position = targetWorld - camera.position
    rig.position.x = targetWorld.x - camera.position.x;
    rig.position.z = targetWorld.z - camera.position.z;
}
