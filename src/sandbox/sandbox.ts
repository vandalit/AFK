import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandFilterSet } from '../vision/one-euro';
import { computeHandScale, computePinchDistance } from '../gestures/features';
import { mapCameraToScreen } from '../gestures/calibration';
import { GestureFSM } from '../gestures/fsm';
import { DEFAULT_CONFIG } from '../shared/config';
import type { AppConfig } from '../shared/config';
import type { AffordanceLevel, HandFrame, Vec3 } from '../shared/events';

// ─── ESTADO GLOBAL DEL SANDBOX ───────────────────────────────────────────────

const config: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
const filterSet = new HandFilterSet(config.oneEuro.minCutoff, config.oneEuro.beta);
const fsm = new GestureFSM(config);

let landmarker: HandLandmarker | null = null;
let isCameraActive = false;
let currentAffordanceLevel: AffordanceLevel = 'L3';
let isCursorFrozen = false;

// ─── ELEMENTOS DOM ───────────────────────────────────────────────────────────

const videoEl = document.getElementById('webcam-stream') as HTMLVideoElement;
const btnToggleCamera = document.getElementById('btn-toggle-camera') as HTMLButtonElement;
const camText = document.getElementById('cam-text') as HTMLSpanElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLElement;
const latencyCounter = document.getElementById('latency-counter') as HTMLElement;
const fsmBadge = document.getElementById('fsm-badge') as HTMLElement;

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
let isDrawing = false;
let lastDrawX = 0;
let lastDrawY = 0;

// Ventanas arrastrables
const windowCard1 = document.getElementById('window-card-1') as HTMLElement;
const windowCard2 = document.getElementById('window-card-2') as HTMLElement;
let draggedElement: HTMLElement | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

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
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
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

// ─── INICIALIZACIÓN DE MEDIAPIPE ─────────────────────────────────────────────

async function initMediaPipe(): Promise<void> {
  camText.innerText = 'Cargando modelos...';
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 1
  });

  camText.innerText = 'Cámara lista';
}

// ─── CÁMARA WEBRTC ───────────────────────────────────────────────────────────

async function toggleCamera(): Promise<void> {
  if (isCameraActive) {
    // Apagar
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

  // Encender
  try {
    if (!landmarker) {
      await initMediaPipe();
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
  if (!isCameraActive || !landmarker || videoEl.paused || videoEl.ended) {
    return;
  }

  const startTime = performance.now();

  if (videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime;

    const result = landmarker.detectForVideo(videoEl, startTime);
    const latency = performance.now() - startTime;
    latencyCounter.innerText = `${Math.round(latency)} ms`;

    // FPS Meter
    frameCount++;
    if (startTime - lastFpsTime >= 500) {
      const fps = Math.round((frameCount * 1000) / (startTime - lastFpsTime));
      fpsCounter.innerText = `${fps}`;
      frameCount = 0;
      lastFpsTime = startTime;
    }

    if (result.landmarks && result.landmarks.length > 0) {
      const rawLandmarks: Vec3[] = result.landmarks[0].map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z
      }));

      // 1. One Euro Filter
      const smoothed = filterSet.filterLandmarks(rawLandmarks, startTime);

      // 2. Escala normalizadora
      const handScale = computeHandScale(smoothed);

      // 3. Empaquetar HandFrame
      const frame: HandFrame = {
        t: startTime,
        landmarks: smoothed,
        handedness: 'Right',
        handScale,
        score: 1.0
      };

      // 4. Actualizar FSM
      const event = fsm.update(frame);
      const fsmState = fsm.getState();
      updateFsmBadge(fsmState);

      // 5. Mapeo a pantalla completa
      const screenDim = { width: window.innerWidth, height: window.innerHeight };
      const pts = smoothed.map((lm) =>
        mapCameraToScreen(lm.x, lm.y, config.activeZone, screenDim)
      );

      const pointer = pts[8]; // yema del índice

      // Telemetría en vivo
      const pinchDist = computePinchDistance(smoothed, handScale);
      updateTelemetry(pinchDist, fsmState);

      // 6. Renderizar afordancia vectorial SVG
      renderAffordanceOverlay(pts, fsmState);

      // 7. Procesar evento de FSM sobre la interfaz web
      handleGestureEvent(event, pointer);

    } else {
      // Mano fuera de encuadre
      const event = fsm.update({ t: startTime, landmarks: [], handedness: 'Right', handScale: 0 });
      updateFsmBadge(fsm.getState());
      if (event?.type === 'drag-end') {
        releaseDrag();
      }
      clearOverlay();
    }
  }

  requestAnimationFrame(processLoop);
}

// ─── MANIPULACIÓN DE EVENTOS SINTÉTICOS EN LA WEB ─────────────────────────────

let lastHoveredElement: Element | null = null;

function handleGestureEvent(
  event: import('../shared/events').GestureEvent | null,
  pointer: { x: number; y: number }
): void {
  // Simulación de cursor hover
  const el = document.elementFromPoint(pointer.x, pointer.y);
  if (el !== lastHoveredElement) {
    lastHoveredElement?.classList.remove('hover-sim');
    el?.classList.add('hover-sim');
    lastHoveredElement = el;
  }

  // Si se está arrastrando una ventana con Pinch / Drag
  if (draggedElement) {
    draggedElement.style.left = `${pointer.x - dragOffsetX}px`;
    draggedElement.style.top = `${pointer.y - dragOffsetY}px`;
  }

  // Si se está dibujando en el canvas de test
  if (isDrawing) {
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
        isDrawing = true;
        lastDrawX = pointer.x - rect.left;
        lastDrawY = pointer.y - rect.top;
      }
      break;
    }

    case 'drag-end': {
      releaseDrag();
      break;
    }

    case 'click': {
      playClickSound();
      scoreTotal++;
      // Buscar el elemento en la posición del buffer pre-click
      const clickPos = mapCameraToScreen(event.at.x, event.at.y, config.activeZone, {
        width: window.innerWidth,
        height: window.innerHeight
      });

      const clickedEl = document.elementFromPoint(clickPos.x, clickPos.y);
      if (clickedEl) {
        // Disparar click nativo
        (clickedEl as HTMLElement).click?.();

        // Verificar si es un botón de target practice
        const targetBtn = clickedEl.closest('.target-btn');
        if (targetBtn) {
          scoreHits++;
          targetBtn.classList.add('hit', 'active-sim');
          setTimeout(() => targetBtn.classList.remove('hit', 'active-sim'), 300);
        }
      }

      updateScoreboard();
      break;
    }

    case 'clutch': {
      isCursorFrozen = event.engaged;
      break;
    }
  }
}

function releaseDrag(): void {
  if (draggedElement) {
    draggedElement.classList.remove('is-dragging');
    draggedElement = null;
  }
  isDrawing = false;
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
  // L0: completamente invisible
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

// Canvas Clear
document.getElementById('btn-clear-canvas')?.addEventListener('click', () => {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
});

function resizeCanvas(): void {
  const rect = drawCanvas.getBoundingClientRect();
  drawCanvas.width = rect.width;
  drawCanvas.height = rect.height;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

console.log('[Sandbox] AFK Live Web Sandbox inicializado exitosamente.');
