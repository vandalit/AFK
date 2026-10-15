import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { CameraManager } from './camera';
import { HandFilterSet } from './one-euro';
import { HandFrame, Vec3 } from '../shared/events';
import { computeHandScale } from '../gestures/features';
import { DEFAULT_CONFIG } from '../shared/config';
import { IPC_CHANNELS } from '../shared/ipc-channels';

const statusEl = document.getElementById('status') as HTMLDivElement;
const videoEl = document.getElementById('webcam') as HTMLVideoElement;

let landmarker: HandLandmarker | null = null;
const cameraManager = new CameraManager(videoEl);
const filterSet = new HandFilterSet(DEFAULT_CONFIG.oneEuro.minCutoff, DEFAULT_CONFIG.oneEuro.beta);

// Acceso seguro al canal de IPC expuesto por preload o Electron
const isElectron = typeof window !== 'undefined' && 'electron' in window;
const ipcRenderer = isElectron ? (window as any).electron?.ipcRenderer : null;

async function initLandmarker(): Promise<void> {
  statusEl.innerText = 'Cargando modelos MediaPipe Vision (WASM/GPU)...';
  
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

  statusEl.innerText = 'MediaPipe inicializado con éxito. Iniciando cámara...';
}

let lastVideoTime = -1;

function processFrame(): void {
  if (!landmarker || !videoEl || videoEl.paused || videoEl.ended) {
    requestAnimationFrame(processFrame);
    return;
  }

  const nowMs = performance.now();
  if (videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime;

    const result = landmarker.detectForVideo(videoEl, nowMs);

    if (result.landmarks && result.landmarks.length > 0) {
      const rawLandmarks: Vec3[] = result.landmarks[0].map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z
      }));

      // 1. Filtrado adaptativo con One Euro
      const smoothed = filterSet.filterLandmarks(rawLandmarks, nowMs);

      // 2. Normalización de escala invariante a distancia
      const handScale = computeHandScale(smoothed);

      // 3. Lateralidad detectada
      const handednessStr = result.handedness?.[0]?.[0]?.categoryName || 'Right';
      const handedness = handednessStr === 'Left' ? 'Left' : 'Right';
      const score = result.handedness?.[0]?.[0]?.score ?? 1.0;

      const frame: HandFrame = {
        t: nowMs,
        landmarks: smoothed,
        handedness,
        handScale,
        score
      };

      // 4. Envío al proceso Main vía IPC
      if (ipcRenderer) {
        ipcRenderer.send(IPC_CHANNELS.VISION_FRAME, frame);
      }
    } else {
      // Mano fuera de encuadre
      if (ipcRenderer) {
        ipcRenderer.send(IPC_CHANNELS.VISION_FRAME, null);
      }
    }
  }

  requestAnimationFrame(processFrame);
}

async function start(): Promise<void> {
  try {
    await initLandmarker();
    await cameraManager.start();
    statusEl.innerText = 'Tracking activo a alta velocidad.';
    requestAnimationFrame(processFrame);
  } catch (err) {
    console.error('[Vision] Error fatal al iniciar:', err);
    statusEl.innerText = 'Error: ' + (err as Error).message;
  }
}

start();
