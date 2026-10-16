import { FilesetResolver, HandLandmarker, FaceDetector } from '@mediapipe/tasks-vision';
import { HandFilterSet } from '../vision/one-euro';
import { computeHandScale, computePinchDistance } from '../gestures/features';
import { ChestPlaneManager } from '../gestures/chest-plane';
import { GestureFSM } from '../gestures/fsm';
import { DEFAULT_CONFIG } from '../shared/config';
import type { AppConfig } from '../shared/config';
import type { AffordanceLevel, HandFrame, Vec3 } from '../shared/events';

// ─── ESTADO GLOBAL DEL SANDBOX ───────────────────────────────────────────────

const config: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
const filterSet = new HandFilterSet(config.oneEuro.minCutoff, config.oneEuro.beta);
const fsm = new GestureFSM(config);
const chestPlaneManager = new ChestPlaneManager(0.12);

let handLandmarker: HandLandmarker | null = null;
let faceDetector: FaceDetector | null = null;
let isCameraActive = false;
let currentAffordanceLevel: AffordanceLevel = 'L3';
let isCursorFrozen = false;

// ─── ELEMENTOS DOM ───────────────────────────────────────────────────────────

const videoEl = document.getElementById('webcam-stream') as HTMLVideoElement;
const pipOverlay = document.getElementById('pip-overlay') as HTMLCanvasElement;
const pipCtx = pipOverlay.getContext('2d')!;
const btnToggleCamera = document.getElementById('btn-toggle-camera') as HTMLButtonElement;
const camText = document.getElementById('cam-text') as HTMLSpanElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLElement;
const latencyCounter = document.getElementById('latency-counter') as HTMLElement;
const fsmBadge = document.getElementById('fsm-badge') as HTMLElement;
const planeStatusBadge = document.getElementById('plane-status-badge') as HTMLElement;

// Telemetría
const barScaleRate = document.getElementById('bar-scaleRate') as HTMLElement;
const telScaleRate = document.getElementById('telemetry-scaleRate') as HTMLElement;
const barPinchDist = document.getElementById('bar-pinchDist') as HTMLElement;
const telPinchDist = document.getElementById('telemetry-pinchDist') as HTMLElement;

// Overlay SVG
const virtualCursor = document.getElementById('virtual-cursor') as unknown as SVGCircleElement;
const volumeGroup = document.getElementById('volume-group') as unknown as SVGGElement;
const skeletonGroup = document.getElementById('skeleton-group') as unknown as SVGGElement;
const pinchConnector = document.getElementById('pinch-connector') as unknown as SVGLineElement;

// Canvas de dibujo
const drawCanvas = document.getElementById('draw-canvas') as HTMLCanvasElement;
const drawCtx = drawCanvas.getContext('2d')!;
let isHandDrawing = false;
let isMouseDrawing = false;
let lastDrawX = 0;
let lastDrawY = 0;

// Ventanas arrastrables
const windowCard1 = document.getElementById('window-card-1') as HTMLElement;
const windowCard2 = document.getElementById('window-card-2') as HTMLElement;
let draggedElement: HTMLElement | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Mouse físico drag state
let mouseDraggedElement: HTMLElement | null = null;
let mouseDragOffsetX = 0;
let mouseDragOffsetY = 0;

// Estadísticas de Target Practice
let scoreHits = 0;
let scoreTotal = 0;
const elScoreHits = document.getElementById('score-hits') as HTMLElement;
const elScoreTotal = document.getElementById('score-total') as HTMLElement;
const elScoreAccuracy = document.getElementById('score-accuracy') as HTMLElement;

// ─── AUDIO FEEDBACK SINTÉTICO (WEB AUDIO API) ────────────────────────────────

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

function playClickSound(): void {
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch {}
}

function playPinchSound(): void {
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(640, audioCtx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.07);
  } catch {}
}

// ─── INTERACTIVIDAD CON MOUSE FÍSICO ─────────────────────────────────────────

function onTargetHit(btn: HTMLElement): void {
  scoreHits++;
  scoreTotal++;
  playClickSound();
  btn.classList.add('hit');
  setTimeout(() => btn.classList.remove('hit'), 350);
  updateScoreboard();
}

// Botones de Target Practice
document.querySelectorAll('.target-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onTargetHit(btn as HTMLElement);
  });
});

// Click fuera para contar fallos
document.querySelector('main.stage-area')?.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.target-btn') && !target.closest('.draggable-window') && target.id !== 'draw-canvas') {
    scoreTotal++;
    updateScoreboard();
  }
});

// Arrastre con Mouse Físico sobre Ventanas
function setupMouseWindowDrag(card: HTMLElement): void {
  const header = card.querySelector('.window-header') || card;
  header.addEventListener('mousedown', (e: Event) => {
    const mouseEv = e as MouseEvent;
    mouseDraggedElement = card;
    const rect = card.getBoundingClientRect();
    mouseDragOffsetX = mouseEv.clientX - rect.left;
    mouseDragOffsetY = mouseEv.clientY - rect.top;
    card.classList.add('is-dragging');
    e.preventDefault();
  });
}

setupMouseWindowDrag(windowCard1);
setupMouseWindowDrag(windowCard2);

window.addEventListener('mousemove', (e: MouseEvent) => {
  if (mouseDraggedElement) {
    mouseDraggedElement.style.left = `${e.clientX - mouseDragOffsetX}px`;
    mouseDraggedElement.style.top = `${e.clientY - mouseDragOffsetY}px`;
  }

  if (isMouseDrawing) {
    const rect = drawCanvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    drawCtx.strokeStyle = '#00ffcc';
    drawCtx.lineWidth = 3;
    drawCtx.lineCap = 'round';
    drawCtx.beginPath();
    drawCtx.moveTo(lastDrawX, lastDrawY);
    drawCtx.lineTo(cx, cy);
    drawCtx.stroke();
    lastDrawX = cx;
    lastDrawY = cy;
  }
});

window.addEventListener('mouseup', () => {
  if (mouseDraggedElement) {
    mouseDraggedElement.classList.remove('is-dragging');
    mouseDraggedElement = null;
  }
  isMouseDrawing = false;
});

// Dibujo con Mouse Físico sobre el Canvas
drawCanvas.addEventListener('mousedown', (e: MouseEvent) => {
  isMouseDrawing = true;
  const rect = drawCanvas.getBoundingClientRect();
  lastDrawX = e.clientX - rect.left;
  lastDrawY = e.clientY - rect.top;
});

// Reset de posición de tarjetas
document.getElementById('btn-reset-cards')?.addEventListener('click', () => {
  windowCard1.style.left = '30px';
  windowCard1.style.top = '20px';
  windowCard2.style.left = '270px';
  windowCard2.style.top = '40px';
});

// Limpieza de Canvas
document.getElementById('btn-clear-canvas')?.addEventListener('click', () => {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
});

function resizeCanvas(): void {
  drawCanvas.width = drawCanvas.offsetWidth;
  drawCanvas.height = drawCanvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 100);

// ─── INICIALIZACIÓN DE MODELOS MEDIAPIPE (HANDS + FACE) ──────────────────────

async function initModels(): Promise<void> {
  camText.innerText = 'Cargando modelos...';
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  // 1. Hand Landmarker
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 1
  });

  // 2. Face Detector (Plano de Interacción al Pecho / Chin-Pinned)
  faceDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO'
  });

  camText.innerText = 'Cámara lista';
}

// ─── CÁMARA WEBRTC ───────────────────────────────────────────────────────────

async function toggleCamera(): Promise<void> {
  if (isCameraActive) {
    const stream = videoEl.srcObject as MediaStream;
    stream?.getTracks().forEach((track) => track.stop());
    videoEl.srcObject = null;
    isCameraActive = false;
    camText.innerText = 'Iniciar Cámara';
    btnToggleCamera.style.borderColor = 'rgba(0, 255, 204, 0.4)';
    fsm.reset();
    updateFsmBadge('IDLE');
    clearOverlay();
    return;
  }

  try {
    if (!handLandmarker || !faceDetector) {
      await initModels();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 60 }
      }
    });

    videoEl.srcObject = stream;
    await videoEl.play();
    isCameraActive = true;
    camText.innerText = 'Detener Cámara';
    btnToggleCamera.style.borderColor = 'var(--neon-green)';
    requestAnimationFrame(processLoop);
  } catch (err) {
    console.error('Error al abrir webcam:', err);
    alert('No se pudo acceder a la cámara web: ' + (err as Error).message);
    camText.innerText = 'Error Cámara';
  }
}

btnToggleCamera.addEventListener('click', toggleCamera);

// ─── BUCLE PRINCIPAL DE TRACKING & FSM ────────────────────────────────────────

let lastVideoTime = -1;
let frameCount = 0;
let lastFpsTime = performance.now();

function processLoop(): void {
  if (!isCameraActive || !handLandmarker || videoEl.paused || videoEl.ended) {
    return;
  }

  const startTime = performance.now();

  if (videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime;

    // Dimensiones reales de video
    const videoWidth = videoEl.videoWidth || 640;
    const videoHeight = videoEl.videoHeight || 480;
    pipOverlay.width = videoWidth;
    pipOverlay.height = videoHeight;

    // ── 1. Detección de Rostro & Plano al Pecho ─────────────────────────────
    if (faceDetector) {
      const faceResult = faceDetector.detectForVideo(videoEl, startTime);
      if (faceResult.detections && faceResult.detections.length > 0) {
        const box = faceResult.detections[0].boundingBox;
        if (box) {
          chestPlaneManager.updateFromFaceBox(box, { width: videoWidth, height: videoHeight });
          planeStatusBadge.innerText = 'ROSTRO FIJADO (MENTÓN)';
          planeStatusBadge.style.color = 'var(--neon-green)';
        }
      } else {
        planeStatusBadge.innerText = 'ZONA ERGONÓMICA BASE';
        planeStatusBadge.style.color = 'var(--neon-amber)';
      }
    }

    // Dibujar el plano del pecho y el rostro sobre el PiP
    drawPiPOverlay(videoWidth, videoHeight);

    // ── 2. Detección de Manos ───────────────────────────────────────────────
    const handResult = handLandmarker.detectForVideo(videoEl, startTime);
    const latency = performance.now() - startTime;
    latencyCounter.innerText = `${Math.round(latency)} ms`;

    // Medidor de FPS
    frameCount++;
    if (startTime - lastFpsTime >= 500) {
      const fps = Math.round((frameCount * 1000) / (startTime - lastFpsTime));
      fpsCounter.innerText = `${fps}`;
      frameCount = 0;
      lastFpsTime = startTime;
    }

    if (handResult.landmarks && handResult.landmarks.length > 0) {
      const rawLandmarks: Vec3[] = handResult.landmarks[0].map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z
      }));

      // A. Filtro One Euro
      const smoothed = filterSet.filterLandmarks(rawLandmarks, startTime);

      // B. Escala normalizadora
      const handScale = computeHandScale(smoothed);

      // C. Empaquetar HandFrame
      const frame: HandFrame = {
        t: startTime,
        landmarks: smoothed,
        handedness: 'Right',
        handScale,
        score: 1.0
      };

      // D. Actualizar FSM
      const event = fsm.update(frame);
      const fsmState = fsm.getState();
      updateFsmBadge(fsmState);

      // E. Mapeo a pantalla mediante el Plano Ergonómico al Pecho (Chin-Pinned)
      const screenDim = { width: window.innerWidth, height: window.innerHeight };
      const pts = smoothed.map((lm) =>
        chestPlaneManager.mapPointToScreen(lm.x, lm.y, screenDim.width, screenDim.height)
      );

      const pointer = pts[8]; // yema del índice

      // Telemetría en vivo
      const pinchDist = computePinchDistance(smoothed, handScale);
      updateTelemetry(pinchDist, fsmState);

      // F. Renderizar afordancia vectorial SVG
      renderAffordanceOverlay(pts, fsmState);

      // G. Procesar evento de FSM sobre la interfaz web
      handleHandGestureEvent(event, pointer);

    } else {
      // Mano fuera de encuadre
      const event = fsm.update({ t: startTime, landmarks: [], handedness: 'Right', handScale: 0 });
      updateFsmBadge(fsm.getState());
      if (event?.type === 'drag-end') {
        releaseHandDrag();
      }
      clearOverlay();
    }
  }

  requestAnimationFrame(processLoop);
}

// ─── DIBUJO DEL PLANO DEL PECHO EN EL PIP OVERLAY ───────────────────────────

function drawPiPOverlay(w: number, h: number): void {
  pipCtx.clearRect(0, 0, w, h);
  const plane = chestPlaneManager.getPlane();

  const px = plane.minX * w;
  const py = plane.minY * h;
  const pw = (plane.maxX - plane.minX) * w;
  const ph = (plane.maxY - plane.minY) * h;

  // Rectángulo del plano del pecho (anclado al mentón)
  pipCtx.strokeStyle = plane.isFaceTracked ? '#00ffcc' : '#f59e0b';
  pipCtx.lineWidth = 2;
  pipCtx.setLineDash([6, 3]);
  pipCtx.strokeRect(px, py, pw, ph);

  // Relleno sutil
  pipCtx.fillStyle = plane.isFaceTracked ? 'rgba(0, 255, 204, 0.12)' : 'rgba(245, 158, 11, 0.08)';
  pipCtx.fillRect(px, py, pw, ph);

  // Línea superior anclada al mentón
  pipCtx.setLineDash([]);
  pipCtx.strokeStyle = '#38bdf8';
  pipCtx.lineWidth = 3;
  pipCtx.beginPath();
  pipCtx.moveTo(px, py);
  pipCtx.lineTo(px + pw, py);
  pipCtx.stroke();
}

// ─── MANIPULACIÓN DE EVENTOS DE GESTOS EN LA WEB ─────────────────────────────

let lastHoveredElement: Element | null = null;

function handleHandGestureEvent(
  event: import('../shared/events').GestureEvent | null,
  pointer: { x: number; y: number }
): void {
  // Simulación de cursor hover continuo
  const el = document.elementFromPoint(pointer.x, pointer.y);
  if (el !== lastHoveredElement) {
    lastHoveredElement?.classList.remove('hover-sim');
    el?.classList.add('hover-sim');
    lastHoveredElement = el;
  }

  // Si se está arrastrando una ventana con Pinch / Drag de mano
  if (draggedElement) {
    draggedElement.style.left = `${pointer.x - dragOffsetX}px`;
    draggedElement.style.top = `${pointer.y - dragOffsetY}px`;
  }

  // Si se está dibujando en el canvas con el índice (Pinch o Trazo)
  if (isHandDrawing) {
    const rect = drawCanvas.getBoundingClientRect();
    if (
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom
    ) {
      const cx = pointer.x - rect.left;
      const cy = pointer.y - rect.top;
      drawCtx.strokeStyle = '#00ffcc';
      drawCtx.lineWidth = 3;
      drawCtx.lineCap = 'round';
      drawCtx.beginPath();
      drawCtx.moveTo(lastDrawX, lastDrawY);
      drawCtx.lineTo(cx, cy);
      drawCtx.stroke();
      lastDrawX = cx;
      lastDrawY = cy;
    }
  }

  if (!event) return;

  switch (event.type) {
    case 'drag-start': {
      playPinchSound();

      // Chequear si el usuario pellizcó sobre una ventana arrastrable
      const hit = document.elementFromPoint(pointer.x, pointer.y);
      const windowCard = hit?.closest('.draggable-window') as HTMLElement | null;
      if (windowCard) {
        draggedElement = windowCard;
        const rect = windowCard.getBoundingClientRect();
        dragOffsetX = pointer.x - rect.left;
        dragOffsetY = pointer.y - rect.top;
        windowCard.classList.add('is-dragging');
      }

      // Chequear si pellizcó sobre el canvas para dibujar
      const rect = drawCanvas.getBoundingClientRect();
      if (
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom
      ) {
        isHandDrawing = true;
        lastDrawX = pointer.x - rect.left;
        lastDrawY = pointer.y - rect.top;
      }
      break;
    }

    case 'drag-end': {
      releaseHandDrag();
      break;
    }

    case 'click': {
      // Posición del click recuperada del buffer pre-empuje (180ms atrás)
      const clickPos = chestPlaneManager.mapPointToScreen(
        event.at.x,
        event.at.y,
        window.innerWidth,
        window.innerHeight
      );

      const clickedEl = document.elementFromPoint(clickPos.x, clickPos.y);
      if (clickedEl) {
        const targetBtn = clickedEl.closest('.target-btn') as HTMLElement | null;
        if (targetBtn) {
          onTargetHit(targetBtn);
        } else {
          scoreTotal++;
          (clickedEl as HTMLElement).click?.();
          updateScoreboard();
        }
      }
      break;
    }

    case 'clutch': {
      isCursorFrozen = event.engaged;
      break;
    }
  }
}

function releaseHandDrag(): void {
  if (draggedElement) {
    draggedElement.classList.remove('is-dragging');
    draggedElement = null;
  }
  isHandDrawing = false;
}

function updateScoreboard(): void {
  elScoreHits.innerText = `${scoreHits}`;
  elScoreTotal.innerText = `${scoreTotal}`;
  const pct = scoreTotal > 0 ? Math.round((scoreHits / scoreTotal) * 100) : 0;
  elScoreAccuracy.innerText = `${pct}%`;
}

// ─── RENDERIZADO DE AFORDANCIA VECTORIAL (L0 - L3) ───────────────────────────

const FINGER_CHAINS = [
  [0, 1, 2, 3, 4],       // Pulgar
  [0, 5, 6, 7, 8],       // Índice
  [0, 9, 10, 11, 12],    // Medio
  [0, 13, 14, 15, 16],   // Anular
  [0, 17, 18, 19, 20],   // Meñique
];

const CAPSULE_RADII: Record<number, number[]> = {
  0: [9, 7.5, 6, 5, 4],
  1: [8, 6.5, 5, 4, 3.5],
  2: [8, 6.5, 5, 4, 3.5],
  3: [7, 6, 4.5, 3.5, 3],
  4: [6, 5, 3.5, 3, 2.5],
};

function renderAffordanceOverlay(pts: { x: number; y: number }[], fsmState: string): void {
  if (currentAffordanceLevel === 'L0') {
    clearOverlay();
    return;
  }

  // 1. Puntero del índice (L1, L2, L3)
  const tip = pts[8];
  virtualCursor.setAttribute('cx', `${tip.x}`);
  virtualCursor.setAttribute('cy', `${tip.y}`);
  virtualCursor.style.display = 'block';

  // Estados visuales del puntero
  if (fsmState === 'PUSH_ARMED') {
    virtualCursor.className.baseVal = 'virtual-cursor push-armed';
  } else if (fsmState === 'DRAG') {
    virtualCursor.className.baseVal = 'virtual-cursor dragging';
  } else {
    virtualCursor.className.baseVal = 'virtual-cursor';
  }

  // Línea conectora entre pulgar e índice en Pinch (DRAG)
  if (fsmState === 'DRAG') {
    const thumbTip = pts[4];
    pinchConnector.setAttribute('x1', `${thumbTip.x}`);
    pinchConnector.setAttribute('y1', `${thumbTip.y}`);
    pinchConnector.setAttribute('x2', `${tip.x}`);
    pinchConnector.setAttribute('y2', `${tip.y}`);
    pinchConnector.style.display = 'block';
  } else {
    pinchConnector.style.display = 'none';
  }

  // 2. Nivel L2: Esqueleto articular
  if (currentAffordanceLevel === 'L2') {
    volumeGroup.innerHTML = '';
    let skelSvg = '';
    for (const chain of FINGER_CHAINS) {
      for (let i = 0; i < chain.length - 1; i++) {
        const p1 = pts[chain[i]];
        const p2 = pts[chain[i + 1]];
        skelSvg += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="rgba(0, 255, 204, 0.4)" stroke-width="2"/>`;
      }
    }
    for (const p of pts) {
      skelSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#fff" opacity="0.8"/>`;
    }
    skeletonGroup.innerHTML = skelSvg;
    return;
  }

  // 3. Nivel L3: Silueta volumétrica de cápsulas + palma
  if (currentAffordanceLevel === 'L3') {
    skeletonGroup.innerHTML = '';
    let volSvg = '';

    // Cápsulas de falanges
    FINGER_CHAINS.forEach((chain, fingerIdx) => {
      const radii = CAPSULE_RADII[fingerIdx];
      for (let i = 0; i < chain.length - 1; i++) {
        const p1 = pts[chain[i]];
        const p2 = pts[chain[i + 1]];
        const r = radii[i] || 4;
        volSvg += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#00ffcc" stroke-width="${r * 2}" stroke-linecap="round" stroke-opacity="0.35"/>`;
      }
    });

    // Palma rellena
    const palmKnuckles = [0, 5, 9, 13, 17].map((idx) => pts[idx]);
    const d = palmKnuckles.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
    volSvg += `<path d="${d}" fill="#00ffcc" fill-opacity="0.18"/>`;

    // Articulaciones brillantes
    for (const p of pts) {
      volSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#ffffff" opacity="0.7"/>`;
    }

    volumeGroup.innerHTML = volSvg;
  }
}

function clearOverlay(): void {
  virtualCursor.style.display = 'none';
  pinchConnector.style.display = 'none';
  volumeGroup.innerHTML = '';
  skeletonGroup.innerHTML = '';
  lastHoveredElement?.classList.remove('hover-sim');
  lastHoveredElement = null;
}

// ─── TELEMETRÍA Y CONTROLES ──────────────────────────────────────────────────

function updateFsmBadge(state: string): void {
  fsmBadge.className = `fsm-badge state-${state}`;
  fsmBadge.innerText = state;
}

function updateTelemetry(pinchDist: number, fsmState: string): void {
  telPinchDist.innerText = pinchDist.toFixed(2);
  const pinchPct = Math.min(100, Math.max(0, (pinchDist / 0.4) * 100));
  barPinchDist.style.width = `${pinchPct}%`;
  if (fsmState === 'DRAG') {
    barPinchDist.className = 'gauge-bar-fill warning';
  } else {
    barPinchDist.className = 'gauge-bar-fill';
  }
}

// ─── SLIDERS Y AJUSTES DINÁMICOS ─────────────────────────────────────────────

function bindSlider(
  id: string,
  displayId: string,
  unit: string,
  onChange: (val: number) => void
): void {
  const slider = document.getElementById(id) as HTMLInputElement;
  const display = document.getElementById(displayId) as HTMLElement;
  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    display.innerText = `${val.toFixed(2)}${unit}`;
    onChange(val);
  });
}

bindSlider('slider-minCutoff', 'val-minCutoff', '', (v) => {
  config.oneEuro.minCutoff = v;
  filterSet.updateParams(v, config.oneEuro.beta);
});

bindSlider('slider-beta', 'val-beta', '', (v) => {
  config.oneEuro.beta = v;
  filterSet.updateParams(config.oneEuro.minCutoff, v);
});

bindSlider('slider-activeZone', 'val-activeZone', '%', (v) => {
  config.activeZone.ratioX = v;
  config.activeZone.ratioY = v;
});

bindSlider('slider-scaleRate', 'val-scaleRate', '', (v) => {
  config.push.scaleRate = v;
});

bindSlider('slider-bufferMs', 'val-bufferMs', ' ms', (v) => {
  config.push.bufferMs = v;
});

bindSlider('slider-pinchEnter', 'val-pinchEnter', '', (v) => {
  config.pinch.enter = v;
});

bindSlider('slider-pinchExit', 'val-pinchExit', '', (v) => {
  config.pinch.exit = v;
});

// Selector de Nivel de Afordancia
document.querySelectorAll('.level-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.level-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const level = btn.getAttribute('data-level') as AffordanceLevel;
    currentAffordanceLevel = level;
    document.getElementById('val-affordance')!.innerText = `${level}`;
  });
});

console.log('[Sandbox] AFK Live Web Sandbox inicializado exitosamente con Plano al Pecho.');
