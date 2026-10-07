import * as THREE from 'three';

export let environmentGroup;

export function buildNavigationEnvironment(scene) {
    environmentGroup = new THREE.Group();
    environmentGroup.visible = false; // Começa invisível (Modo padrão é Manipulação)

    // Chão grande (40x40 unidades)
    const floorSize = 40;
    const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0x111111,
        roughness: 0.9,
        metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    environmentGroup.add(floor);

    // Grid para ajudar na noção de escala e distância
    const gridHelper = new THREE.GridHelper(floorSize, floorSize, 0x555555, 0x2a2a2a);
    gridHelper.position.y = 0.01; // Levemente acima do chão para não "piscar" (Z-fighting)
    environmentGroup.add(gridHelper);

    // Landmarks (Pontos de referência grandes e coloridos)
    const landmarks = [
        // Tipo, Cor, Posição [x, y, z], Tamanhos (variam por tipo)
        { type: 'box', color: 0xff3333, pos: [-10, 2.5, -10], size: [2, 5, 2] },         // Monolito Vermelho
        { type: 'cylinder', color: 0x33ff33, pos: [12, 4, -12], size: [1.5, 1.5, 8, 16] }, // Torre Verde
        { type: 'cone', color: 0x3388ff, pos: [-12, 3, 10], size: [3, 6, 16] },          // Pirâmide Azul
        { type: 'box', color: 0xffaa00, pos: [10, 1.5, 12], size: [3, 3, 3] },           // Bloco Laranja
        { type: 'cylinder', color: 0xaa33ff, pos: [0, 5, -16], size: [1, 1, 10, 16] }      // Pilar Roxo central-fundo
    ];

    landmarks.forEach(lm => {
        let geo;
        if (lm.type === 'box') geo = new THREE.BoxGeometry(...lm.size);
        else if (lm.type === 'cylinder') geo = new THREE.CylinderGeometry(...lm.size);
        else if (lm.type === 'cone') geo = new THREE.ConeGeometry(...lm.size);
        
        const mat = new THREE.MeshStandardMaterial({ color: lm.color, roughness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...lm.pos);
        environmentGroup.add(mesh);
    });

    scene.add(environmentGroup);
    return environmentGroup;
}
