import { HandFrame, GestureEvent } from '../shared/events';
import { GestureFSMInterface, GestureState } from './types';
import { isIndexPointing, isOpenPalm } from './features';
import { DEFAULT_CONFIG } from '../shared/config';
import type { AppConfig } from '../shared/config';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface BufferedPosition {
  /** Coord X normalizada de cámara (0..1, sin inversión — la aplica main.ts) */
  x: number;
  /** Coord Y normalizada de cámara (0..1) */
  y: number;
  /** Timestamp en ms (performance.now() en el process de visión) */
  t: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Tiempo máximo en PUSH_ARMED antes de descartar como falso positivo */
const PUSH_ARMED_TIMEOUT_MS = 500;

/** Máximo de frames guardados en el buffer circular (~1s a 60fps) */
const MAX_BUFFER_FRAMES = 60;

// ─── FSM ─────────────────────────────────────────────────────────────────────

/**
 * Máquina de Estados Finita de Gestos — Fase 3.
 *
 * Módulo PURO: sin dependencias de Electron, DOM, ni APIs nativas.
 * Solo consume HandFrame y emite GestureEvent.
 *
 * Estados:
 *   IDLE ──(pointing detected)──▶ POINT
 *   POINT ──(scaleRate spike)───▶ PUSH_ARMED
 *   POINT ──(open palm dwell)───▶ CLUTCH
 *   PUSH_ARMED ──(rate drops)───▶ emit CLICK → POINT
 *   PUSH_ARMED ──(timeout)──────▶ POINT
 *   CLUTCH ──(not open palm)────▶ POINT
 *   any ──(hand lost)────────────▶ IDLE
 */
export class GestureFSM implements GestureFSMInterface {
  private currentState: GestureState = 'IDLE';
  private config: AppConfig;

  // ── Tracking de handScale para detección de push ──────────────────────────
  private prevScale: number = 0;
  private prevScaleTime: number = -1;

  // ── Buffer circular de posiciones del índice ──────────────────────────────
  private positionBuffer: BufferedPosition[] = [];

  // ── Timers de estado ──────────────────────────────────────────────────────
  private pushArmedAt: number = 0;
  private clutchStartAt: number = 0;

  constructor(config: AppConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  public update(frame: HandFrame): GestureEvent | null {
    const { t, landmarks, handScale } = frame;

    // ── Mano fuera de encuadre o frame inválido ────────────────────────────
    if (!landmarks || landmarks.length < 21) {
      if (this.currentState !== 'IDLE') {
        this.reset();
        return { type: 'hand-lost' };
      }
      return null;
    }

    const indexTip = landmarks[8];

    // ── Actualizar buffer circular de posiciones ───────────────────────────
    this.positionBuffer.push({ x: indexTip.x, y: indexTip.y, t });
    // Descartar entradas anteriores a la ventana de 300ms
    const oldest = t - 300;
    while (this.positionBuffer.length > 0 && this.positionBuffer[0].t < oldest) {
      this.positionBuffer.shift();
    }
    if (this.positionBuffer.length > MAX_BUFFER_FRAMES) {
      this.positionBuffer.shift();
    }

    // ── Calcular derivada de escala (m/s normalizado) ──────────────────────
    let scaleRate = 0;
    if (this.prevScaleTime >= 0 && t > this.prevScaleTime) {
      const dtSec = (t - this.prevScaleTime) / 1000;
      scaleRate = (handScale - this.prevScale) / dtSec;
    }
    this.prevScale = handScale;
    this.prevScaleTime = t;

    // ── Posturas ───────────────────────────────────────────────────────────
    const pointing  = isIndexPointing(landmarks);
    const openPalm  = isOpenPalm(landmarks);

    // ════════════════════════════════════════════════════════════════════════
    //  IDLE
    // ════════════════════════════════════════════════════════════════════════
    if (this.currentState === 'IDLE') {
      if (pointing) {
        this.currentState = 'POINT';
        return { type: 'pointer-move', x: indexTip.x, y: indexTip.y };
      }
      return null;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  POINT
    // ════════════════════════════════════════════════════════════════════════
    if (this.currentState === 'POINT') {
      // Palma abierta → dwell hacia CLUTCH
      if (openPalm) {
        if (this.clutchStartAt === 0) {
          this.clutchStartAt = t;
        } else if (t - this.clutchStartAt >= this.config.clutch.dwellMs) {
          this.currentState = 'CLUTCH';
          this.clutchStartAt = 0;
          return { type: 'clutch', engaged: true };
        }
        // Todavía en dwell: ni mover ni avanzar
        return null;
      }
      this.clutchStartAt = 0;

      // Ya no está apuntando → volver a IDLE
      if (!pointing) {
        this.currentState = 'IDLE';
        return null;
      }

      // Spike de escala → armar push
      if (scaleRate > this.config.push.scaleRate) {
        this.currentState = 'PUSH_ARMED';
        this.pushArmedAt = t;
        return null; // el overlay se encarga de visualizar PUSH_ARMED vía state
      }

      // Movimiento normal
      return { type: 'pointer-move', x: indexTip.x, y: indexTip.y };
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PUSH_ARMED
    // ════════════════════════════════════════════════════════════════════════
    if (this.currentState === 'PUSH_ARMED') {
      // Timeout: falso positivo, descartar
      if (t - this.pushArmedAt > PUSH_ARMED_TIMEOUT_MS) {
        this.currentState = 'POINT';
        return null;
      }

      // La tasa de escala dejó de crecer (o se invierte) → click confirmado
      if (scaleRate <= 0) {
        this.currentState = 'POINT';
        // Recuperar posición pre-empuje del buffer circular
        const targetTime = this.pushArmedAt - this.config.push.bufferMs;
        const clickPos = this.getBufferedPosition(targetTime);
        return {
          type: 'click',
          at: { x: clickPos.x, y: clickPos.y },
          button: 'left',
        };
      }

      // Todavía empujando → quieto, no mover el cursor
      return null;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CLUTCH (cursor congelado)
    // ════════════════════════════════════════════════════════════════════════
    if (this.currentState === 'CLUTCH') {
      if (!openPalm) {
        this.currentState = 'POINT';
        return { type: 'clutch', engaged: false };
      }
      // Cursor congelado: ignorar todo movimiento
      return null;
    }

    return null;
  }

  public reset(): void {
    this.currentState = 'IDLE';
    this.prevScale = 0;
    this.prevScaleTime = -1;
    this.positionBuffer = [];
    this.pushArmedAt = 0;
    this.clutchStartAt = 0;
  }

  public getState(): GestureState {
    return this.currentState;
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  /**
   * Devuelve la posición del buffer más cercana a targetTime.
   * Si el buffer está vacío, retorna el centro como fallback seguro.
   */
  private getBufferedPosition(targetTime: number): { x: number; y: number } {
    if (this.positionBuffer.length === 0) {
      return { x: 0.5, y: 0.5 };
    }

    let closest = this.positionBuffer[0];
    let minDiff = Math.abs(closest.t - targetTime);

    for (const entry of this.positionBuffer) {
      const diff = Math.abs(entry.t - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }

    return { x: closest.x, y: closest.y };
  }
}
