import { HandFrame } from '../shared/events';
import type { OverlayFramePayload } from '../shared/events';
import { AffordanceFadeController } from './affordance-fade';
import { mapCameraToScreen } from '../gestures/calibration';
import { DEFAULT_CONFIG } from '../shared/config';
import { IPC_CHANNELS } from '../shared/ipc-channels';

// ─── Elementos del DOM ──────────────────────────────────────────────────────

const indexDot  = document.getElementById('index-dot')    as SVGCircleElement | null;
const volumeGroup    = document.getElementById('volume-group')   as SVGGElement | null;
const skeletonGroup  = document.getElementById('skeleton-group') as SVGGElement | null;

const fadeController = new AffordanceFadeController(DEFAULT_CONFIG.affordance.level);

// ─── Topología ósea de MediaPipe HandLandmarker (21 nodos) ───────────────────

/** Cadenas de falanges para cada dedo: [proximal..distal] */
const FINGER_CHAINS: number[][] = [
  [0, 1, 2, 3, 4],       // Pulgar
  [0, 5, 6, 7, 8],       // Índice
  [0, 9, 10, 11, 12],    // Medio
  [0, 13, 14, 15, 16],   // Anular
  [0, 17, 18, 19, 20],   // Meñique
];

/** Nudillos base que forman la palma */
const PALM_KNUCKLES = [0, 5, 9, 13, 17, 0];

/** Radio de la cápsula por falange (px). El índice 0 = base de dedo, aumenta hacia la punta */
const CAPSULE_RADII: Record<number, number[]> = {
  0: [9, 7.5, 6, 5, 4],     // Pulgar (más grueso)
  1: [8, 6.5, 5, 4, 3.5],   // Índice
  2: [8, 6.5, 5, 4, 3.5],   // Medio
  3: [7, 6, 4.5, 3.5, 3],   // Anular
  4: [6, 5, 3.5, 3, 2.5],   // Meñique
};

// ─── Helpers SVG ─────────────────────────────────────────────────────────────

/** Genera un elemento <line> grueso con caps redondeados para simular cápsula/falange */
function capsuleLine(
  x1: number, y1: number,
  x2: number, y2: number,
  r: number,
  opacity: number,
  gradId: string
): string {
  return `<line
    x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
    x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
    stroke="url(#${gradId})"
    stroke-width="${(r * 2).toFixed(1)}"
    stroke-linecap="round"
    stroke-opacity="${opacity.toFixed(2)}"
  />`;
}

/** Genera el polígono relleno de la palma */
function palmPolygon(pts: { x: number; y: number }[], opacity: number): string {
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  return `<path d="${d}" fill="url(#palmGrad)" fill-opacity="${opacity.toFixed(2)}" stroke="none" />`;
}

// ─── Renderizador principal ───────────────────────────────────────────────────

function updateRenderer(payload: OverlayFramePayload | HandFrame | null): void {
  if (!indexDot) return;

  // Compatibilidad: acepta tanto OverlayFramePayload como HandFrame desnudo (legado)
  let frame: HandFrame | null = null;
  let currentGesture: string = 'idle';

  if (payload && 'frame' in payload) {
    // Nuevo formato OverlayFramePayload
    frame = (payload as OverlayFramePayload).frame;
    currentGesture = (payload as OverlayFramePayload).currentGesture ?? 'idle';
  } else {
    // Legado: HandFrame directo
    frame = payload as HandFrame | null;
  }

  // ── Sin mano: limpiar todo ───────────────────────────────────────────────
  if (!frame || !frame.landmarks || frame.landmarks.length < 21) {
    indexDot.setAttribute('cx', '-200');
    indexDot.setAttribute('cy', '-200');
    indexDot.classList.remove('push-armed');
    if (volumeGroup)   volumeGroup.innerHTML   = '';
    if (skeletonGroup) skeletonGroup.innerHTML = '';
    return;
  }

  const screenDim = { width: window.innerWidth, height: window.innerHeight };

  // 1. Mapear los 21 landmarks de cámara a pantalla con zona activa
  const pts = frame.landmarks.map((lm) =>
    mapCameraToScreen(lm.x, lm.y, DEFAULT_CONFIG.activeZone, screenDim)
  );

  // 2. Puntero del índice (L1/L2/L3)
  if (fadeController.shouldRenderPointer()) {
    indexDot.setAttribute('cx', pts[8].x.toString());
    indexDot.setAttribute('cy', pts[8].y.toString());
    indexDot.style.display = 'block';

    // Feedback de estado: PUSH_ARMED pone el punto rojo, DRAG ámbar
    if (currentGesture === 'PUSH_ARMED') {
      indexDot.classList.add('push-armed');
      indexDot.classList.remove('dragging');
    } else if (currentGesture === 'DRAG') {
      indexDot.classList.remove('push-armed');
      indexDot.classList.add('dragging');
    } else {
      indexDot.classList.remove('push-armed');
      indexDot.classList.remove('dragging');
    }
  } else {
    indexDot.style.display = 'none';
  }

  // 3. Nivel L3: silueta volumétrica con cápsulas + palma
  if (volumeGroup && fadeController.shouldRenderVolume()) {
    let svg = '';

    // Degradés de falanges (por dedo) — definidos inline en el grupo
    svg += `<defs>
      <linearGradient id="fingerGrad0" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#a78bfa" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.50"/>
      </linearGradient>
      <linearGradient id="fingerGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#00ffcc" stop-opacity="0.90"/>
        <stop offset="100%" stop-color="#0891b2" stop-opacity="0.55"/>
      </linearGradient>
      <linearGradient id="fingerGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#38bdf8" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.50"/>
      </linearGradient>
      <linearGradient id="fingerGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#c4b5fd" stop-opacity="0.80"/>
        <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.45"/>
      </linearGradient>
      <linearGradient id="fingerGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#fb7185" stop-opacity="0.80"/>
        <stop offset="100%" stop-color="#be123c" stop-opacity="0.45"/>
      </linearGradient>
      <radialGradient id="palmGrad" cx="50%" cy="50%" r="60%">
        <stop offset="0%"   stop-color="#6d28d9" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.15"/>
      </radialGradient>
      <filter id="handGlow">
        <feGaussianBlur stdDeviation="3.5" result="blur"/>
        <feComposite  in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>`;

    // Palma (polígono convexa entre nudillos base)
    const palmPts = PALM_KNUCKLES.map((i) => pts[i]);
    svg += palmPolygon(palmPts, 0.55);

    // Falanges de cada dedo como cápsulas encadenadas
    FINGER_CHAINS.forEach((chain, fingerIdx) => {
      const radii = CAPSULE_RADII[fingerIdx];
      const gradId = `fingerGrad${fingerIdx}`;

      // Saltamos el segmento muñeca-nudillo (0→base) para el pulgar e índice en palma
      const startSeg = fingerIdx === 0 ? 0 : 1; // pulgar parte de la muñeca
      for (let s = startSeg; s < chain.length - 1; s++) {
        const from = pts[chain[s]];
        const to   = pts[chain[s + 1]];
        const r    = radii[s];
        const opacity = 0.72 - s * 0.06; // se adelgaza hacia la punta
        svg += capsuleLine(from.x, from.y, to.x, to.y, r, opacity, gradId);
      }

      // Articulaciones como círculos sobre cada nodo (sin la punta del índice que ya tiene su marcador)
      chain.forEach((lmIdx, segIdx) => {
        if (lmIdx === 8) return; // la punta del índice la gestiona indexDot
        const p = pts[lmIdx];
        const jr = Math.max(2, radii[segIdx] * 0.45);
        svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${jr.toFixed(1)}" fill="rgba(255,255,255,0.75)" />`;
      });
    });

    volumeGroup.innerHTML = svg;
    volumeGroup.setAttribute('filter', 'url(#handGlow)');
    if (skeletonGroup) skeletonGroup.innerHTML = ''; // L3 NO muestra el esqueleto de palitos

  } else if (volumeGroup) {
    volumeGroup.innerHTML = '';
  }

  // 4. Nivel L2: esqueleto articular (líneas y nodos simples)
  if (skeletonGroup && fadeController.shouldRenderSkeleton() && !fadeController.shouldRenderVolume()) {
    const BONE_CONNECTIONS: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];

    let svg = '';
    for (const [from, to] of BONE_CONNECTIONS) {
      const p1 = pts[from], p2 = pts[to];
      svg += `<line class="bone-line" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" />`;
    }
    for (let i = 0; i < pts.length; i++) {
      if (i === 8) continue;
      svg += `<circle class="joint-node" cx="${pts[i].x}" cy="${pts[i].y}" r="3" />`;
    }
    skeletonGroup.innerHTML = svg;
  } else if (skeletonGroup) {
    skeletonGroup.innerHTML = '';
  }
}

// ─── Bus de eventos IPC (Electron) ───────────────────────────────────────────

const isElectron = typeof window !== 'undefined' && 'electron' in window;
if (isElectron) {
  const ipc = (window as any).electron?.ipcRenderer;
  if (ipc) {
    ipc.on(IPC_CHANNELS.OVERLAY_FRAME, (_event: any, payload: OverlayFramePayload | HandFrame | null) => {
      updateRenderer(payload);
    });

    ipc.on(IPC_CHANNELS.AFFORDANCE_LEVEL_CHANGE, (_event: any, level: any) => {
      fadeController.setLevel(level);
    });
  }
}

console.log('[Overlay] Hand Renderer v2 (Fase 2 — Afordancia Volumétrica L0-L3) listo.');
