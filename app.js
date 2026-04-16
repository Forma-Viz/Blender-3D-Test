import * as THREE from 'https://esm.sh/three@0.180.0';
import { OrbitControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';

import { cameraSteps } from './js-camera/View.js';
import { parentBaseSteps } from './js-objects/Parent_Base.js';
import { poleSteps } from './js-objects/Pole.js';
import { boltLargeSteps } from './js-objects/Bolt_Large.js';

// DOM
const canvas = document.getElementById('scene');
const titleEl = document.getElementById('stepTitle');
const descEl = document.getElementById('stepDescription');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const stepButtonsEl = document.getElementById('stepButtons');
const copyViewBtn = document.getElementById('copyViewBtn');

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Camera
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.position.set(8, 6, 8);

// Renderer
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 1.4));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
dirLight.position.set(8, 10, 6);
scene.add(dirLight);

// Optional helper
scene.add(new THREE.GridHelper(20, 20));

// State
let currentStep = 0;
let model = null;
let isAnimating = false;
let animationFrameRequested = false;

// ==========================
// 🆕 FADE SUPPORT HELPERS
// ==========================

function getMaterialsArray(material) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function setObjectOpacity(object3D, opacity) {
  object3D.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    const materials = getMaterialsArray(child.material);

    materials.forEach((mat) => {
      mat.transparent = true;
      mat.opacity = opacity;
      mat.needsUpdate = true;
    });
  });
}

function setObjectVisible(object3D, visible) {
  object3D.traverse((child) => {
    child.visible = visible;
  });
}

// ==========================
// STEP DATA (UPDATED)
// ==========================

const stepDefinitions = [
  {
    step: 1,
    title: "Raised (Hidden)",
    description: "Bases are hidden above."
  },
  {
    step: 2,
    title: "Lowered (Fade In)",
    description: "Bases fade in and move into place."
  }
];

function collectObjectMoves(stepNumber) {
  const moves = [];

  if (parentBaseSteps[stepNumber]) moves.push(parentBaseSteps[stepNumber]);
  if (poleSteps[stepNumber]) moves.push(poleSteps[stepNumber]);
  if (boltLargeSteps[stepNumber]) moves.push(boltLargeSteps[stepNumber]);

  return moves;
}

const steps = stepDefinitions.map((stepDef) => {
  const cam = cameraSteps[stepDef.step] || {
    camera: [8, 6, 8],
    target: [0, 1, 0]
  };

  return {
    title: stepDef.title,
    description: stepDef.description,
    camera: cam.camera,
    target: cam.target,
    objectMoves: collectObjectMoves(stepDef.step)
  };
});

// Camera animation
const startPos = new THREE.Vector3();
const startTarget = new THREE.Vector3();
const endPos = new THREE.Vector3();
const endTarget = new THREE.Vector3();

// Object animation
let objectAnimations = [];

let animStart = 0;
const animDuration = 1200;

// ---------- Rendering ----------

function renderScene() {
  renderer.render(scene, camera);
}

function requestRenderIfNotRequested() {
  if (animationFrameRequested || isAnimating) return;

  animationFrameRequested = true;
  requestAnimationFrame(() => {
    animationFrameRequested = false;
    controls.update();
    renderScene();
  });
}

controls.addEventListener('change', () => {
  if (!isAnimating) requestRenderIfNotRequested();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  requestRenderIfNotRequested();
});

// ---------- Helpers ----------

function frameModelToView(object3D) {
  const box = new THREE.Box3().setFromObject(object3D);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  controls.target.copy(center);

  camera.position.set(
    center.x + maxDim * 1.4,
    center.y + maxDim * 0.9,
    center.z + maxDim * 1.4
  );

  camera.updateProjectionMatrix();
}

function buildStepButtons() {
  stepButtonsEl.innerHTML = '';
  steps.forEach((step, i) => {
    const btn = document.createElement('button');
    btn.textContent = `${i + 1}`;
    btn.addEventListener('click', () => goToStep(i));
    stepButtonsEl.appendChild(btn);
  });
}

function updateStepUI() {
  const step = steps[currentStep];
  titleEl.textContent = step.title;
  descEl.textContent = step.description;

  document.querySelectorAll('.step-buttons button').forEach((btn, i) => {
    btn.classList.toggle('active', i === currentStep);
  });
}

// ---------- Step Navigation ----------

function goToStep(index) {
  if (index < 0 || index >= steps.length) return;

  currentStep = index;
  updateStepUI();

  const step = steps[index];

  startPos.copy(camera.position);
  startTarget.copy(controls.target);

  endPos.set(...step.camera);
  endTarget.set(...step.target);

  // OBJECT + FADE SETUP
  objectAnimations = [];

  if (step.objectMoves && model) {
    step.objectMoves.forEach((move) => {
      const obj = model.getObjectByName(move.name);

      if (!obj) {
        console.warn(`Object not found: ${move.name}`);
        return;
      }

      let currentOpacity = 1;

      obj.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = getMaterialsArray(child.material);
          if (mats.length && mats[0].opacity !== undefined) {
            currentOpacity = mats[0].opacity;
          }
        }
      });

      if ((move.opacity ?? 1) > 0) {
        setObjectVisible(obj, true);
      }

      objectAnimations.push({
        object: obj,
        startPos: obj.position.clone(),
        endPos: new THREE.Vector3(...move.position),
        startOpacity: currentOpacity,
        endOpacity: move.opacity ?? 1
      });
    });
  }

  animStart = performance.now();
  isAnimating = true;

  requestAnimationFrame(animateStep);
}

// ---------- Step Animation ----------

function animateStep(now) {
  if (!isAnimating) return;

  const t = Math.min((now - animStart) / animDuration, 1);
  const eased = 1 - Math.pow(1 - t, 3);

  camera.position.lerpVectors(startPos, endPos, eased);
  controls.target.lerpVectors(startTarget, endTarget, eased);

  objectAnimations.forEach((anim) => {
    anim.object.position.lerpVectors(anim.startPos, anim.endPos, eased);

    const opacity =
      anim.startOpacity + (anim.endOpacity - anim.startOpacity) * eased;

    setObjectOpacity(anim.object, opacity);
  });

  renderScene();

  if (t < 1) {
    requestAnimationFrame(animateStep);
  } else {
    isAnimating = false;

    objectAnimations.forEach((anim) => {
      if (anim.endOpacity <= 0) {
        setObjectVisible(anim.object, false);
      }
    });

    renderScene();
  }
}

// ---------- Model Load ----------

const loader = new GLTFLoader();

loader.load(
  './models/your-model.glb',
  (gltf) => {
    model = gltf.scene;
    scene.add(model);

    frameModelToView(model);
    buildStepButtons();

    // INITIAL HIDDEN STATE
    const parentBase = model.getObjectByName("Parent_Base");
    if (parentBase) {
      parentBase.position.set(0, 10, 0);
      setObjectOpacity(parentBase, 0);
      setObjectVisible(parentBase, false);
    }

    updateStepUI();
    renderScene();
  }
);

// ---------- Debug ----------

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'p') {
    console.log('Camera Position:', camera.position.x, camera.position.y, camera.position.z);
    console.log('Target Point:', controls.target.x, controls.target.y, controls.target.z);
  }
});

// ==========================
// 📋 COPY VIEW BUTTON (REMOVE WHEN DONE)
// ==========================

copyViewBtn.addEventListener('click', () => {
  const cam = camera.position;
  const target = controls.target;

  const text = `Step Placeholder
Title: Placeholder
Description: Placeholder
Camera Position: x=${cam.x.toFixed(2)}, y=${cam.y.toFixed(2)}, z=${cam.z.toFixed(2)}
Target Point: x=${target.x.toFixed(2)}, y=${target.y.toFixed(2)}, z=${target.z.toFixed(2)}
`;

  navigator.clipboard.writeText(text)
    .then(() => {
      copyViewBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyViewBtn.textContent = 'Copy View';
      }, 1000);
    });
});