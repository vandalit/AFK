import { HandFrame } from '../shared/events';
import { AffordanceFadeController } from './affordance-fade';
import { mapCameraToScreen } from '../gestures/calibration';
import { DEFAULT_CONFIG } from '../shared/config';
import { IPC_CHANNELS } from '../shared/ipc-channels';

const indexDot = document.getElementById('index-dot') as SVGCircleElement | null;
const skeletonGroup = document.getElementById('skeleton-group') as SVGGElement | null;

const fadeController = new AffordanceFadeController(DEFAULT_CONFIG.affordance.level);

// 21 conexiones óseas estándar de MediaPipe HandLandmarker
const HAND_CONNECTIONS: [number, number][] = [
  // Pulgar
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Índice
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Medio
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Anular
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Meñique
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Conexiones de palma
  [5, 9], [9, 13], [13, 17]
];

function updateRenderer(frame: HandFrame | null): void {
  if (!indexDot) return;

  if (!frame || !frame.landmarks || frame.landmarks.length < 21) {
    // Ocultar elementos fuera de encuadre
    indexDot.setAttribute('cx', '-100');
    indexDot.setAttribute('cy', '-100');
    if (skeletonGroup) skeletonGroup.innerHTML = '';
    return;
  }

  const screenDim = { width: window.innerWidth, height: window.innerHeight };

  // 1. Mapear coordenadas de cámara a pantalla con zona activa
  const screenPoints = frame.landmarks.map((lm) =>
    mapCameraToScreen(lm.x, lm.y, DEFAULT_CONFIG.activeZone, screenDim)
  );

  // 2. Coordenada de la punta del índice (Landmark 8)
  const indexTip = screenPoints[8];

  if (fadeController.shouldRenderPointer()) {
    indexDot.setAttribute('cx', indexTip.x.toString());
    indexDot.setAttribute('cy', indexTip.y.toString());
    indexDot.style.display = 'block';
  } else {
    indexDot.style.display = 'none';
  }

  // 3. Renderizar esqueleto si está en nivel L2 o L3
  if (skeletonGroup && fadeController.shouldRenderSkeleton()) {
    let svgContent = '';
    
    // Dibujar huesos
    for (const [from, to] of HAND_CONNECTIONS) {
      const p1 = screenPoints[from];
      const p2 = screenPoints[to];
      svgContent += `<line class="bone-line" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" />`;
    }

    // Dibujar articulaciones
    for (let i = 0; i < screenPoints.length; i++) {
      if (i === 8) continue; // La punta del índice tiene su propio marcador destacado
      const pt = screenPoints[i];
      svgContent += `<circle class="joint-node" cx="${pt.x}" cy="${pt.y}" r="3" />`;
    }

    skeletonGroup.innerHTML = svgContent;
  } else if (skeletonGroup) {
    skeletonGroup.innerHTML = '';
  }
}

// Escuchar eventos IPC desde Electron Main
const isElectron = typeof window !== 'undefined' && 'electron' in window;
if (isElectron) {
  const ipc = (window as any).electron?.ipcRenderer;
  if (ipc) {
    ipc.on(IPC_CHANNELS.OVERLAY_FRAME, (_event: any, frame: HandFrame | null) => {
      updateRenderer(frame);
    });

    ipc.on(IPC_CHANNELS.AFFORDANCE_LEVEL_CHANGE, (_event: any, level: any) => {
      fadeController.setLevel(level);
    });
  }
}

console.log('[Overlay] Hand Renderer listo y a la espera de frames.');
