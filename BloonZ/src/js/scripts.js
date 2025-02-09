import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { PointerLockControlsCannon } from '../js/PointerLockControlsCannon.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// three.js variables
let camera, scene, renderer, stats;
let material;


// cannon.js variables
let world;
let controls;
const timeStep = 1 / 60;
let lastCallTime = performance.now();
let cameraShape;
let cameraBody;
let physicsMaterial;
const balls = [];       // CANNON BODIES
const ballMeshes = [];  // THREE GEOMETRIES

const boxes = [];       // STATIC BODIES
const boxMeshes = [];   // STATIC MESHES

const enemyBodies = []; // BALLOON BODIES
const enemyModels = []; // BALLOON MODELS
const enemyMeshes = []; // BALLOON GLTF


const instructions = document.getElementById('instructions');

initThree();
initCannon();
initPointerLock();
animate();

function initThree() {
    // Camera
    camera = new THREE.PerspectiveCamera(
        75, // campo de visão (field of view)
        window.innerWidth / window.innerHeight, // aspect largura/altura
        0.1, // near
        100//far
    ); 

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 0, 500);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(scene.fog.color);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Stats.js
    stats = new Stats();
    document.body.appendChild(stats.dom);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const sun = new THREE.SpotLight(0xffffdd, 0.5, 0, Math.PI/3, 0.5);
    sun.position.set(0, 40, 0);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 1000;
    sun.shadow.camera.fov = 30;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    scene.add(sun);
    scene.add(sun.target);

    // Generic material
    material = new THREE.MeshStandardMaterial({ color: 0xdddddd });

    // Floor
    const floorGeometry = new THREE.PlaneBufferGeometry(300, 300, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeometry, material);
    floor.receiveShadow = true;
    scene.add(floor);



    // #region Crosshair
    const crosshair = new THREE.TextureLoader().load('js/resources/crosshair.png');
    crosshair.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: crosshair, 
            color: 0xff69B4, 
            fog: false, 
            depthTest: false, 
            depthWrite: false
        })
    );
    sprite.scale.set(0.125* camera.aspect,0.125 * camera.aspect, 1)
    sprite.position.set(0, 0, -5);
    camera.add(sprite);

    window.addEventListener('resize', onWindowResize);
    //#endregion
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// OBJECTS
function initCannon() {
    const textureLoader = new THREE.TextureLoader();
    world = new CANNON.World();
    // Tweak contact properties.
    // Contact stiffness - use to make softer/harder contacts
    world.defaultContactMaterial.contactEquationStiffness = 1e9;
    // Stabilization time in number of timesteps
    world.defaultContactMaterial.contactEquationRelaxation = 4;
    const solver = new CANNON.GSSolver();
    solver.iterations = 7;
    solver.tolerance = 0.1;
    world.solver = new CANNON.SplitSolver(solver);
    world.gravity.set(0, 0, 0); // y = -20

    // material interaction
    physicsMaterial = new CANNON.Material('physics');
    const physics_physics = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
        friction: 0.0,
        restitution: 0.5
    });
    world.addContactMaterial(physics_physics);


    // camera
    const radiusTop = 0.5;
    const radiusBottom = 0.5;
    const height = 2.5;
    const numSegments = 30;

    cameraShape = new CANNON.Cylinder(radiusTop, radiusBottom, height, numSegments);
    cameraBody = new CANNON.Body({ mass: 3, material: physicsMaterial  });
    cameraBody.addShape(cameraShape);
    cameraBody.position.set(0,height/2,0);
    cameraBody.linearDamping = 0.9;
    world.addBody(cameraBody);
    cameraBody.angularFactor.set(0, 1, 0);

    const cylinderGeometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, numSegments);
    const cameraMesh = new THREE.Mesh(cylinderGeometry, material);
    cameraMesh.castShadow = true;
    cameraMesh.receiveShadow = true;
    scene.add(cameraMesh);
    boxes.push(cameraBody);
    boxMeshes.push(cameraMesh);
    

    // plane
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);


    //#region shoot
    const shootVelocity = 10
    const ballShape = new CANNON.Sphere(0.015)
    const ballGeometry = new THREE.SphereBufferGeometry(ballShape.radius, 32, 32)

    // Returns a vector pointing the the diretion the camera is at
    function getShootDirection() {
        const vector = new THREE.Vector3(0, 0, 1);
        vector.unproject(camera);
        const ray = new THREE.Ray(cameraBody.position, vector.sub(cameraBody.position).normalize());
        return ray.direction;
    }

    window.addEventListener('click', (event) => {
        if (!controls.enabled) {
            return;
        }
        if(balls.length >= 15){
            removeObject(ballMeshes.shift(),balls.shift());
        }

        const ballBody = new CANNON.Body({ mass: 1 });
        ballBody.addShape(ballShape);

        ballBody.addEventListener('preStep', () => {
            ballBody.velocity.y = 0;
        });

        const ballMesh = new THREE.Mesh(ballGeometry, material);
        ballMesh.castShadow = true;
        ballMesh.receiveShadow = true;
        scene.add(ballMesh);
        world.addBody(ballBody);
        balls.push(ballBody);
        ballMeshes.push(ballMesh);

        ballBody.addEventListener('collide', (e) => {
            if (enemyBodies.includes(e.body)) {
                console.log("Bola colidiu com o balão!");
                //Remove balão
                const index = enemyBodies.indexOf(e.body)
                scene.remove(enemyModels.splice(index,1)[0]);
                scene.remove(enemyMeshes.splice(index,1)[0]);
                scene.remove(enemyBodies.splice(index,1)[0]);

                //Remove bolinha
                const i = balls.indexOf(ballBody);
                scene.remove(ballMeshes.splice(i,1)[0]);
                scene.remove(balls.splice(i,1)[0]);

            }
        });

        setTimeout((e) => {
            try{
                removeObject(ballMeshes.shift(), balls.shift()); // Remover o objeto por tempo
            }
            catch{
                console.log("Bolinha já removida")
            }
            
        }, 5000);

        const shootDirection = getShootDirection();
        ballBody.velocity.set(
            shootDirection.x * shootVelocity,
            shootDirection.y * shootVelocity,
            shootDirection.z * shootVelocity
        );

        // Move the ball outside the player sphere
        const x = cameraBody.position.x + shootDirection.x * (0.1 * 1.02 + ballShape.radius);
        const y = cameraBody.position.y + shootDirection.y * (0.1 * 1.02 + ballShape.radius);
        const z = cameraBody.position.z + shootDirection.z * (0.1 * 1.02 + ballShape.radius);
        ballBody.position.set(x, y, z);
        ballMesh.position.copy(ballBody.position);
    });
//#endregion

    function createWall(geometry, mat, position){
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(geometry[0],geometry[1],geometry[2]),
            mat
        );
        const Body = new CANNON.Body({mass:0});
        Body.position.set(position[0], position[1], position[2]);
        Body.addShape(new CANNON.Box(new CANNON.Vec3(geometry[0]/2,geometry[1]/2,geometry[2]/2)));
        Body.linearDamping = 0.01;
        Body.angularDamping = 0.01;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        world.addBody(Body);
        scene.add(mesh);
        boxes.push(Body);
        boxMeshes.push(mesh);

        return Body;
    }

    function createBalloon(gltfModel){

        // como fazer um hitbox literalmente box
        // const bbox = new THREE.Box3().setFromObject(gltfModel); // Cria um bounding box a partir do modelo
        // const size = new THREE.Vector3();
        // bbox.getSize(size); // Obtém as dimensões (largura, altura, profundidade)
        // const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);

        const raio = 0.31
        const shape = new CANNON.Sphere(raio);//Box(halfExtents);
        const Body = new CANNON.Body({
            mass: 1, // Ajuste a massa conforme necessário
            position: new CANNON.Vec3(0, 0, 0), // Posição inicial
            shape: shape,
            color: 0xffffff
        });

        const helperGeometry = new THREE.SphereGeometry(raio)//, size.y, size.z);
        const helperMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            wireframe: false 
        });
        const Mesh = new THREE.Mesh(helperGeometry, helperMaterial);
        Mesh.castShadow = true;
        Mesh.receiveShadow = true;

        enemyMeshes.push(Mesh);
        scene.add(Mesh);

        world.addBody(Body);
        enemyBodies.push(Body);


        return Body;
    }

    createWall([5, 5, 5], material, [0, 2.5, -10]);

    let loadedModel;
    const assetLoader = new GLTFLoader();

    for(let i=1; i<6; i++){
        assetLoader.load('../src/js/assets/balloonR/scene.gltf', function(gltf){
            loadedModel = gltf.scene;
            scene.add(gltf.scene);
            loadedModel.scale.set(4, 4, 4);
            const modelBody = createBalloon(loadedModel);
            enemyModels.push(loadedModel);
            // movimentação do inimigo
            const aleatorio = Math.ceil(Math.random()*5);
            modelBody.position.set(1+i*aleatorio,1, 1+i*aleatorio);
            modelBody.linearDamping = 0.9;
        }, undefined, 
        function(error){
            console.error(error);
        });
    }

    

}
function initPointerLock() {
    controls = new PointerLockControlsCannon(camera, cameraBody);
    scene.add(controls.getObject());

    instructions.addEventListener('click', () => {
        controls.lock();
    });

    controls.addEventListener('lock', () => {
        controls.enabled = true;
        instructions.style.display = 'none';
    });

    controls.addEventListener('unlock', () => {
        controls.enabled = false;
        instructions.style.display = null;
    });
}

function removeObject(mesh, body) {
    scene.remove(mesh);
    world.removeBody(body);
}

const offset = new THREE.Vector3(0.1, -0.61, -1.01);
function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() / 1000;
  const dt = time - lastCallTime;
  lastCallTime = time;

  if (controls.enabled) {
    world.step(timeStep, dt);

    // Update ball positions
    for (let i = 0; i < balls.length; i++) {
      ballMeshes[i].position.copy(balls[i].position);
      ballMeshes[i].quaternion.copy(balls[i].quaternion);
    }

    cameraBody.force.y = -50;

    
    // Update box positions
    for (let i = 0; i < boxes.length; i++) {
      boxMeshes[i].position.copy(boxes[i].position);
      boxMeshes[i].quaternion.copy(boxes[i].quaternion);
    }

    for(let i=0; i< enemyBodies.length; i++){
        enemyBodies[i].position.set(enemyBodies[i].position.x , enemyBodies[i].position.y, enemyBodies[i].position.z);

        enemyModels[i].position.set(enemyBodies[i].position.x, enemyBodies[i].position.y, enemyBodies[i].position.z);
        enemyModels[i].quaternion.set(enemyBodies[i].quaternion.x, enemyBodies[i].quaternion.y, enemyBodies[i].quaternion.z, enemyBodies[i].quaternion.w);
        // para visualizar
        enemyMeshes[i].position.set(enemyBodies[i].position.x, enemyBodies[i].position.y, enemyBodies[i].position.z);
        enemyMeshes[i].quaternion.set(enemyBodies[i].quaternion.x, enemyBodies[i].quaternion.y, enemyBodies[i].quaternion.z, enemyBodies[i].quaternion.w);
        enemyModels[i].position.add(offset);
        
    }
    const cameraPosition = cameraBody.position;
    
    const speed = 0.03; // Velocidade do balão
    for (let i = 0; i < enemyBodies.length; i++) {
      const balloonPosition = enemyBodies[i].position;

      // Calcula a direção da câmera
      const direction = new CANNON.Vec3(
        cameraPosition.x - balloonPosition.x,
        cameraPosition.y - balloonPosition.y,
        cameraPosition.z - balloonPosition.z
      );
      direction.normalize();

      // Define a velocidade do balão para movê-lo em direção à câmera
      const move = new CANNON.Vec3(
        direction.x * speed,
        direction.y * speed,
        direction.z * speed
      );

      enemyBodies[i].position.set(
        enemyBodies[i].position.x + move.x,
        enemyBodies[i].position.y + move.y*2, 
        enemyBodies[i].position.z + move.z
      )
    }

  

  }
  controls.update(dt);
  renderer.render(scene, camera);
  stats.update();
}

