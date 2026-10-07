import * as THREE from 'three';

export let teleportGroup;
export let teleportMarker;
export let teleportLine;

export function buildTeleportVisuals() {
    teleportGroup = new THREE.Group();
    teleportGroup.visible = false; // Só aparece quando estiver mirando

    // 1. O "Fantasma" (Marker) de onde o jogador vai cair
    teleportMarker = new THREE.Group();
    
    // Um anel no chão
    const ringGeo = new THREE.RingGeometry(0.3, 0.4, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02; // Levemente acima do chão para não piscar
    teleportMarker.add(ring);

    // Um pino/seta para mostrar a direção (fantasma do jogador)
    const ghostGeo = new THREE.CylinderGeometry(0, 0.15, 0.5, 4);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 });
    const ghost = new THREE.Mesh(ghostGeo, ghostMat);
    ghost.position.y = 0.25;
    // Gira a pirâmide para apontar para a frente (no eixo Z negativo, padrão do Three.js)
    ghost.rotation.x = Math.PI / 2; 
    teleportMarker.add(ghost);

    teleportGroup.add(teleportMarker);

    // 2. A linha curva (parábola) saindo do controle até o alvo
    // Vamos criar uma geometria com vários pontos que atualizaremos a cada frame
    const lineGeo = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    teleportLine = new THREE.Line(lineGeo, lineMat);
    teleportGroup.add(teleportLine);

    return teleportGroup;
}

// Atualiza a curva de Bézier saindo da mão até o chão
export function updateTeleportCurve(controllerWorldPos, hitWorldPos) {
    // Calculamos um ponto de controle no meio do caminho, mas mais alto (para fazer o arco)
    const midPoint = new THREE.Vector3().addVectors(controllerWorldPos, hitWorldPos).multiplyScalar(0.5);
    // Adiciona altura ao ponto médio baseado na distância
    const distance = controllerWorldPos.distanceTo(hitWorldPos);
    midPoint.y += Math.min(distance * 0.3, 2.0); // O arco sobe até 2 metros dependendo da distância

    const curve = new THREE.QuadraticBezierCurve3(
        controllerWorldPos,
        midPoint,
        hitWorldPos
    );

    const points = curve.getPoints(20);
    teleportLine.geometry.setFromPoints(points);
}
