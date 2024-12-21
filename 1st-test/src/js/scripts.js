import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls'
import * as CANNON from 'cannon-es';

import posx from './resources/skybox/posx.jpg';
import posy from './resources/skybox/posy.jpg';
import negy from './resources/skybox/negy.jpg';
import negx from './resources/skybox/negx.jpg';
import posz from './resources/skybox/posz.jpg';
import negz from './resources/skybox/negz.jpg';
import checker from './resources/checkerboard.png';
import cross from './resources/crosshair.png';

import concrete from './resources/freepbr/concrete3-metallic.png';
import arbedo from './resources/freepbr/concrete3-albedo.png';
import normal from './resources/freepbr/concrete3-normal.png';
import roughness from './resources/freepbr/concrete3-roughness.png';
import Tconcrete from './resources/freepbr/vintage-tile1_metallic.png';
import Tarbedo from './resources/freepbr/vintage-tile1_albedo.png';
import Tnormal from './resources/freepbr/vintage-tile1_normal.png';
import Troughness from './resources/freepbr/vintage-tile1_roughness.png';


const KEYS = {
  'a': 65,
  's': 83,
  'w': 87,
  'd': 68,
  'Shift': 16,
  'Escape': 27,
};

function clamp(x, a, b) {
  return Math.min(Math.max(x, a), b);
}

class InputController {
  constructor(target) {
    this.target_ = target || document;
    this.initialize_();    
  }

  initialize_() {
    this.current_ = {
      leftButton: false,
      rightButton: false,
      mouseXDelta: 0,
      mouseYDelta: 0,
      mouseX: 0,
      mouseY: 0,
    };
    this.previous_ = null;
    this.keys_ = {};
    this.previousKeys_ = {};
    this.target_.addEventListener('mousedown', (e) => this.onMouseDown_(e), false);
    this.target_.addEventListener('mousemove', (e) => this.onMouseMove_(e), false);
    this.target_.addEventListener('mouseup', (e) => this.onMouseUp_(e), false);
    this.target_.addEventListener('keydown', (e) => this.onKeyDown_(e), false);
    this.target_.addEventListener('keyup', (e) => this.onKeyUp_(e), false);
  }

  onMouseMove_(e) {
    this.current_.mouseX = e.pageX - window.innerWidth / 2;
    this.current_.mouseY = e.pageY - window.innerHeight / 2;

    if (this.previous_ === null) {
      this.previous_ = {...this.current_};
    }

    this.current_.mouseXDelta = this.current_.mouseX - this.previous_.mouseX;
    this.current_.mouseYDelta = this.current_.mouseY - this.previous_.mouseY;
  }

  onMouseDown_(e) {
    this.onMouseMove_(e);

    switch (e.button) {
      case 0: {
        this.current_.leftButton = true;
        break;
      }
      case 2: {
        this.current_.rightButton = true;
        break;
      }
    }
  }

  onMouseUp_(e) {
    this.onMouseMove_(e);

    switch (e.button) {
      case 0: {
        this.current_.leftButton = false;
        break;
      }
      case 2: {
        this.current_.rightButton = false;
        break;
      }
    }
  }

  onKeyDown_(e) {
    this.keys_[e.keyCode] = true;
  }

  onKeyUp_(e) {
    this.keys_[e.keyCode] = false;
  }

  key(keyCode) {
    return !!this.keys_[keyCode];
  }

  isReady() {
    return this.previous_ !== null;
  }

  update(_) {
    if (this.previous_ !== null) {
      this.current_.mouseXDelta = this.current_.mouseX - this.previous_.mouseX;
      this.current_.mouseYDelta = this.current_.mouseY - this.previous_.mouseY;

      this.previous_ = {...this.current_};
    }
  }
};

// camera related
class FirstPersonCamera {
  constructor(camera, objects) {
    this.camera_ = camera;
    this.input_ = new InputController();
    this.rotation_ = new THREE.Quaternion();
    // camera start point
    this.translation_ = new THREE.Vector3(0, 2, 0);
    // camera sense
    this.phi_ = 0;
    this.phiSpeed_ = 8;
    this.theta_ = 0;
    this.thetaSpeed_ = 5;
    this.headBobActive_ = false;
    this.headBobTimer_ = 0;
    this.objects_ = objects;
    this.requestedFirstLock = true;
    this.fwd = 0;
    this.lft = 0;
  }

  update(timeElapsedS) {
    this.updateRotation_(timeElapsedS);
    this.updateCamera_(timeElapsedS);
    this.updateTranslation_(timeElapsedS);
    this.updateHeadBob_(timeElapsedS);
    this.input_.update(timeElapsedS);
    // this.updateLock_();
  }

  updateCamera_(_) {
    this.camera_.quaternion.copy(this.rotation_);
    this.camera_.position.copy(this.translation_);
    this.camera_.position.y += Math.sin(this.headBobTimer_ * 10) * 0.0625;

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.rotation_);

    const dir = forward.clone();

    forward.multiplyScalar(100);
    forward.add(this.translation_);

    let closest = forward;
    const result = new THREE.Vector3();
    const ray = new THREE.Ray(this.translation_, dir);
    for (let i = 0; i < this.objects_.length; ++i) {
      if (ray.intersectBox(this.objects_[i], result)) {
        if (result.distanceTo(ray.origin) < closest.distanceTo(ray.origin)) {
          closest = result.clone();
        }
      }
    }

    this.camera_.lookAt(closest);
  }

  updateHeadBob_(timeElapsedS) {
    if (this.headBobActive_) {
      const wavelength = Math.PI;
      const nextStep = 1 + Math.floor(((this.headBobTimer_ + 0.000001) * 10) / wavelength);
      const nextStepTime = nextStep * wavelength / 10;
      this.headBobTimer_ = Math.min(this.headBobTimer_ + timeElapsedS, nextStepTime);

      if (this.headBobTimer_ == nextStepTime) {
        this.headBobActive_ = false;
      }
    }
  }

  // movement speed
  updateTranslation_(timeElapsedS) {
    const forwardVelocity = (this.input_.key(KEYS.w) ? 1 : 0) + (this.input_.key(KEYS.s) ? -1 : 0)
    const strafeVelocity = (this.input_.key(KEYS.a) ? 1 : 0) + (this.input_.key(KEYS.d) ? -1 : 0)

    const qx = new THREE.Quaternion();
    qx.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.phi_);

    const movSpeed = (this.input_.key(KEYS.Shift) ? -1.4 : -0.8);

    // speed z
    const forward = new THREE.Vector3(0, 0, movSpeed);
    forward.applyQuaternion(qx);
    forward.multiplyScalar(forwardVelocity * timeElapsedS * 10);

    // speed x
    const left = new THREE.Vector3(movSpeed, 0, 0);
    left.applyQuaternion(qx);
    left.multiplyScalar(strafeVelocity * timeElapsedS * 10);

    this.fwd = forward;
    this.lft = left;

    this.translation_.add(forward);
    this.translation_.add(left);

    if (forwardVelocity != 0 || strafeVelocity != 0) {
      this.headBobActive_ = true;
    }


    
  }

  updateRotation_(timeElapsedS) {
    const xh = this.input_.current_.mouseXDelta / window.innerWidth;
    const yh = this.input_.current_.mouseYDelta / window.innerHeight;

    this.phi_ += -xh * this.phiSpeed_;
    this.theta_ = clamp(this.theta_ + -yh * this.thetaSpeed_, -Math.PI / 3, Math.PI / 3);

    const qx = new THREE.Quaternion();
    qx.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.phi_);
    const qz = new THREE.Quaternion();
    qz.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.theta_);

    const q = new THREE.Quaternion();
    q.multiply(qx);
    q.multiply(qz);

    this.rotation_.copy(q);
  }

  // updateLock_(){
  //   const lock = (this.input_.key(KEYS.Escape) ? 1 : 0);
  //   if(!lock){
  //     document.body.requestPointerLock();
  //     if(this.requestedFirstLock){
  //       this.input_.initialize_();
  //       this.requestedFirstLock = false;
  //     }
  //   }
  //   else{
  //     document.body.requestPointerLock(true);
  //   }
  // }

}

// world
class FirstPersonCameraDemo {
  constructor() {
    this.initialize_();
  }

  initialize_() {
    this.initializeRenderer_();
    this.initializeLights_();
    this.initializeScene_();
    this.initializePostFX_();
    this.initializeDemo_();

    this.previousRAF_ = null;
    this.raf_();
    this.onWindowResize_();
  }

  initializeDemo_() {
    // this.controls_ = new FirstPersonControls(
    //     this.camera_, this.threejs_.domElement);
    // this.controls_.lookSpeed = 0.8;
    // this.controls_.movementSpeed = 5;

    this.fpsCamera_ = new FirstPersonCamera(this.camera_, this.objects_);
  }

  initializeRenderer_() {
    this.threejs_ = new THREE.WebGLRenderer({
      antialias: true,
    });
    this.threejs_.shadowMap.enabled = true;
    this.threejs_.shadowMap.type = THREE.PCFSoftShadowMap;
    this.threejs_.setPixelRatio(window.devicePixelRatio);
    this.threejs_.physicallyCorrectLights = true;
    this.threejs_.outputEncoding = THREE.sRGBEncoding;

    document.body.appendChild(this.threejs_.domElement);

    // const menuPanel = document.getElementById('menuPanel');
    // const startButton = document.getElementById('startButton');
    // startButton.addEventListener('click',  () => {
    //     controls.lock()
    //   },
    //   false
    // );
  
    // const controls = new PointerLockControls(this.camera_, this.threejs_.domElement);
  
    // controls.addEventListener('change', function(e) {
    //   this.fpsCamera_.input_.current_.mouseX = e.pageX - window.innerWidth / 2;
    //   this.fpsCamera_.input_.current_.mouseY = e.pageY - window.innerHeight / 2;
  
    //   if (this.fpsCamera_.input_.current_.previous_ === null) {
    //     this.fpsCamera_.input_.current_.previous_ = {...this.fpsCamera_.input_.current_};
    //   }
  
    //   this.fpsCamera_.input_.current_.current_.mouseXDelta = this.fpsCamera_.input_.current_.current_.mouseX - this.fpsCamera_.input_.current_.previous_.mouseX;
    //   this.fpsCamera_.input_.current_.current_.mouseYDelta = this.fpsCamera_.input_.current_.current_.mouseY - this.fpsCamera_.input_.current_.previous_.mouseY;
    // });
    // controls.addEventListener('lock', () => (menuPanel.style.display = 'none'))
    // controls.addEventListener('unlock', () => (menuPanel.style.display = 'block'))


    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 0.1;
    const far = 1000.0;
    this.camera_ = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera_.position.set(0, 2, 0);

    this.scene_ = new THREE.Scene();

    this.uiCamera_ = new THREE.OrthographicCamera(
        -1, 1, 1 * aspect, -1 * aspect, 1, 1000);
    this.uiScene_ = new THREE.Scene();
  }

  initializeScene_() {
    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
      posx,
      negx,
      posy,
      negy,
      posz,
      negz,
  ]);

    texture.encoding = THREE.sRGBEncoding;
    this.scene_.background = texture;

    const mapLoader = new THREE.TextureLoader();
    const maxAnisotropy = this.threejs_.capabilities.getMaxAnisotropy();
    const checkerboard = mapLoader.load(checker);
    checkerboard.anisotropy = maxAnisotropy;
    checkerboard.wrapS = THREE.RepeatWrapping;
    checkerboard.wrapT = THREE.RepeatWrapping;
    checkerboard.repeat.set(32, 32);
    checkerboard.encoding = THREE.sRGBEncoding;


    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100, 10, 10),
        new THREE.MeshStandardMaterial({map: checkerboard}));
    plane.castShadow = false;
    plane.receiveShadow = true;
    plane.rotation.x = -Math.PI / 2;
    this.scene_.add(plane);
    
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      this.loadBoxMaterial_(0.2)
    );
    //box.position.set(0, 2, -10);
    box.castShadow = true;
    box.receiveShadow = true;
    this.scene_.add(box);

    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      wireframe: false
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    this.scene_.add(boxMesh);


    // #region walls
    const concreteMaterial = this.loadConcreteMaterial_(4);

    const wall1 = new THREE.Mesh(
      new THREE.BoxGeometry(100, 100, 4),
      concreteMaterial);
    wall1.position.set(0, -40, -50);
    wall1.castShadow = true;
    wall1.receiveShadow = true;
    this.scene_.add(wall1);

    const wall2 = new THREE.Mesh(
      new THREE.BoxGeometry(100, 100, 4),
      concreteMaterial);
    wall2.position.set(0, -40, 50);
    wall2.castShadow = true;
    wall2.receiveShadow = true;
    this.scene_.add(wall2);

    const wall3 = new THREE.Mesh(
      new THREE.BoxGeometry(4, 100, 100),
      concreteMaterial);
    wall3.position.set(50, -40, 0);
    wall3.castShadow = true;
    wall3.receiveShadow = true;
    this.scene_.add(wall3);

    const wall4 = new THREE.Mesh(
      new THREE.BoxGeometry(4, 100, 100),
      concreteMaterial);
    wall4.position.set(-50, -40, 0);
    wall4.castShadow = true;
    wall4.receiveShadow = true;
    this.scene_.add(wall4);
    //#endregion


    const ballGeo = new THREE.SphereGeometry(3);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      wireframe: false
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = true;
    ballMesh.receiveShadow = true;
    this.scene_.add(ballMesh);

    // Create Box3 for each mesh in the scene so that we can
    // do some easy intersection tests.
    const meshes = [
      wall1, wall2, wall3, wall4
    ];

    this.objects_ = [];
    this.meshes_ = [plane, box, boxMesh, wall1, wall2, wall3, wall4, ballMesh];


    for (let i = 0; i < meshes.length; ++i) {
      const b = new THREE.Box3();
      b.setFromObject(meshes[i]);
      this.objects_.push(b);
    }

    // #region Crosshair
    const crosshair = mapLoader.load(cross);
    crosshair.anisotropy = maxAnisotropy;

    this.sprite_ = new THREE.Sprite(
      new THREE.SpriteMaterial({map: crosshair, color: 0xffffff, fog: false, depthTest: false, depthWrite: false}));
    this.sprite_.scale.set(0.10, 0.10 * this.camera_.aspect, 1)
    this.sprite_.position.set(0, 0, -10);


    this.uiScene_.add(this.sprite_);
      //#endregion

  }

  initializeLights_() {
    const distance = 50.0;
    const angle = Math.PI / 4.0;
    const penumbra = 0.5;
    const decay = 1.0;

    let light = new THREE.SpotLight(
        0xFFFFFF, 100.0, distance, angle, penumbra, decay);
    light.castShadow = true;
    light.shadow.bias = -0.00001;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 100;

    light.position.set(25, 25, 0);
    light.lookAt(0, 0, 0);
    this.scene_.add(light);

    const upColour = 0xFFFF80;
    const downColour = 0x808080;
    light = new THREE.HemisphereLight(upColour, downColour, 0.5);
    light.color.setHSL( 0.6, 1, 0.6 );
    light.groundColor.setHSL( 0.095, 1, 0.75 );
    light.position.set(0, 4, 0);
    this.scene_.add(light);
  }

  loadConcreteMaterial_(tiling) {
    const maxAnisotropy = this.threejs_.capabilities.getMaxAnisotropy();

    const metalMap = new THREE.TextureLoader().load(concrete);
    metalMap.anisotropy = maxAnisotropy;
    metalMap.wrapS = THREE.RepeatWrapping;
    metalMap.wrapT = THREE.RepeatWrapping;
    metalMap.repeat.set(tiling, tiling);

    const albedo = new THREE.TextureLoader().load(arbedo);
    albedo.anisotropy = maxAnisotropy;
    albedo.wrapS = THREE.RepeatWrapping;
    albedo.wrapT = THREE.RepeatWrapping;
    albedo.repeat.set(tiling, tiling);
    albedo.encoding = THREE.sRGBEncoding;

    const normalMap = new THREE.TextureLoader().load(normal);
    normalMap.anisotropy = maxAnisotropy;
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(tiling, tiling);

    const roughnessMap = new THREE.TextureLoader().load(roughness);
    roughnessMap.anisotropy = maxAnisotropy;
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.set(tiling, tiling);

    const material = new THREE.MeshStandardMaterial({
      metalnessMap: metalMap,
      map: albedo,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
    });

    return material;
  }

  loadBoxMaterial_(tiling) {
    const maxAnisotropy = this.threejs_.capabilities.getMaxAnisotropy();

    const metalMap = new THREE.TextureLoader().load(Tconcrete);
    metalMap.anisotropy = maxAnisotropy;
    metalMap.wrapS = THREE.RepeatWrapping;
    metalMap.wrapT = THREE.RepeatWrapping;
    metalMap.repeat.set(tiling, tiling);

    const albedo = new THREE.TextureLoader().load(Tarbedo);
    albedo.anisotropy = maxAnisotropy;
    albedo.wrapS = THREE.RepeatWrapping;
    albedo.wrapT = THREE.RepeatWrapping;
    albedo.repeat.set(tiling, tiling);
    albedo.encoding = THREE.sRGBEncoding;

    const normalMap = new THREE.TextureLoader().load(Tnormal);
    normalMap.anisotropy = maxAnisotropy;
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(tiling, tiling);

    const roughnessMap = new THREE.TextureLoader().load(Troughness);
    roughnessMap.anisotropy = maxAnisotropy;
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.set(tiling, tiling);

    const material = new THREE.MeshStandardMaterial({
      metalnessMap: metalMap,
      map: albedo,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
    });

    return material;
  }

  initializePostFX_() {
  }

  onWindowResize_() {
    this.camera_.aspect = window.innerWidth / window.innerHeight;
    this.camera_.updateProjectionMatrix();

    this.uiCamera_.left = -this.camera_.aspect;
    this.uiCamera_.right = this.camera_.aspect;
    this.uiCamera_.updateProjectionMatrix();

    this.threejs_.setSize(window.innerWidth, window.innerHeight);
  }

  raf_() {
    requestAnimationFrame((t) => {
      if (this.previousRAF_ === null) {
        this.previousRAF_ = t;
      }

      this.step_(t - this.previousRAF_);
      this.threejs_.autoClear = true;
      this.threejs_.render(this.scene_, this.camera_);
      this.threejs_.autoClear = false;
      this.threejs_.render(this.uiScene_, this.uiCamera_);
      this.previousRAF_ = t;
      this.raf_();
      this.threejs_.setAnimationLoop(this.animate_);
    });
  }


  step_(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;

    // this.controls_.update(timeElapsedS);
    this.fpsCamera_.update(timeElapsedS);
  }
}


let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new FirstPersonCameraDemo();

  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);


  var geometry = new THREE.CylinderGeometry(5,5,7, 8, 1, false, 0, Math.PI);
  var material = new THREE.MeshNormalMaterial();
  var halfPipe = new THREE.Mesh( geometry, material);
  halfPipe.position.set(0,10,0)
  _APP.scene_.add(halfPipe);


  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0,-9.81,0)
  });

  // #region bodies

  // camera hit box
  const cameraMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshBasicMaterial({
      wireframe: true
    })
  );
  _APP.scene_.add(cameraMesh);
  const cameraBody = new CANNON.Body({
    mass: 100,
    shape: new CANNON.Box(new CANNON.Vec3(1,1,1)),
    type: CANNON.Body.STATIC,
  });
  world.addBody(cameraBody);

  const bodys = [];

  // plane physical body
  const groundPhysMat = new CANNON.Material();
  const groundBody = new CANNON.Body({
    shape: new CANNON.Box(new CANNON.Vec3(50,50,0.1)),
    type: CANNON.Body.STATIC,
    material: groundPhysMat
  })
  world.addBody(groundBody);
  bodys.push(groundBody);
  groundBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);

  // checker box
  const box2PhyMat = new THREE.Material();
  const box2Body = new CANNON.Body({
    shape: new CANNON.Box(new CANNON.Vec3(2,2,2)),
    mass: 1,
    position: new CANNON.Vec3(1,20,10),
    material:box2PhyMat
  });
  world.addBody(box2Body);
  bodys.push(box2Body);
  // rotação
  box2Body.angularVelocity.set(0, 10, 0);
  box2Body.angularDamping = 0.5;

  // small box
  const boxPhyMat = new THREE.Material();
  const boxBody = new CANNON.Body({
    shape: new CANNON.Box(new CANNON.Vec3(1,1,1)),
    mass: 1,
    position: new CANNON.Vec3(0,2,-10),
    material:boxPhyMat,
  });
  world.addBody(boxBody);
  bodys.push(boxBody);
  // rotação
  boxBody.angularVelocity.set(0, 10, 0);
  boxBody.angularDamping = 0.5;

  // axis
  const axis = new THREE.AxesHelper;
  _APP.scene_.add(axis);
  axis.position.set(0, 1, 0);

  const wallPhysMat = new CANNON.Material();
  const wall1Body = new CANNON.Body({
    shape: new CANNON.Box(new CANNON.Vec3(50,50,2)),
    type: CANNON.Body.STATIC,
    material: wallPhysMat
  })
  world.addBody(wall1Body);
  bodys.push(wall1Body);
  wall1Body.position.set(0, -40, -50);

  const wall2Body = new CANNON.Body({
    shape: new CANNON.Box(new CANNON.Vec3(50,50,2)),
    type: CANNON.Body.STATIC,
    material: wallPhysMat
  })
  world.addBody(wall2Body);
  bodys.push(wall2Body);
  wall2Body.position.set(0, -40, 50);

  const wall3Body = new CANNON.Body({
    shape: new CANNON.Box(new CANNON.Vec3(2,50,50)),
    type: CANNON.Body.STATIC,
    material: wallPhysMat
  })
  world.addBody(wall3Body);
  bodys.push(wall3Body);
  wall3Body.position.set(50, -40, 0);

  const wall4Body = new CANNON.Body({
    shape: new CANNON.Box(new CANNON.Vec3(2,50,50)),
    type: CANNON.Body.STATIC,
    material: wallPhysMat
  })
  world.addBody(wall4Body);
  bodys.push(wall4Body);
  wall4Body.position.set(-50, -40, 0);


  // ball
  const ballPhyMat = new THREE.Material();
  const ballBody = new CANNON.Body({
    shape: new CANNON.Sphere(3),
    mass: 0.5,
    position: new CANNON.Vec3(5,2,5),
    material:ballPhyMat
  });
  world.addBody(ballBody);
  bodys.push(ballBody);


  // #endregion

  // animation
  const timeStep = 1/60;
  function animate(){
    world.step(timeStep);


    for(let i=0; i< _APP.meshes_.length; ++i){
      _APP.meshes_[i].position.copy(bodys[i].position);
      _APP.meshes_[i].quaternion.copy(bodys[i].quaternion);
    }

    cameraBody.position.copy(_APP.fpsCamera_.translation_);
    cameraMesh.position.copy(cameraBody.position);
    cameraBody.quaternion.copy(_APP.fpsCamera_.rotation_);
    cameraMesh.quaternion.copy(cameraBody.quaternion);

    renderer.render(_APP.scene_, _APP.camera_);
  }
  renderer.setAnimationLoop(animate);

});