import { describe, it, expect } from 'vitest';
import { isIndexPointing, isOpenPalm } from '../src/gestures/features';
import { GestureFSM } from '../src/gestures/fsm';
import type { Vec3 } from '../src/shared/events';
import type { HandFrame } from '../src/shared/events';
import { DEFAULT_CONFIG } from '../src/shared/config';

// ─── Helpers de fixtures ──────────────────────────────────────────────────────

/** Genera 21 landmarks todos en el centro (postura neutra/ambigua) */
function neutralLandmarks(): Vec3[] {
  return Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
}

/**
 * Genera landmarks con postura de "apuntado":
 *   - Índice extendido (tip.y << pip.y)
 *   - Medio, anular, meñique flexionados (tip.y > pip.y)
 */
function pointingLandmarks(): Vec3[] {
  const lm = neutralLandmarks();
  // Índice extendido: tip(8) y pip(7) y mcp(6) decrecientes en Y
  lm[5]  = { x: 0.5, y: 0.60, z: 0 }; // MCP índice
  lm[6]  = { x: 0.5, y: 0.50, z: 0 }; // PIP índice
  lm[7]  = { x: 0.5, y: 0.38, z: 0 }; // DIP índice
  lm[8]  = { x: 0.5, y: 0.25, z: 0 }; // TIP índice — bien extendida
  // Medio flexionado: tip(12) por debajo de pip(10)
  lm[9]  = { x: 0.52, y: 0.58, z: 0 };
  lm[10] = { x: 0.52, y: 0.50, z: 0 }; // PIP medio
  lm[11] = { x: 0.52, y: 0.54, z: 0 };
  lm[12] = { x: 0.52, y: 0.62, z: 0 }; // TIP medio — doblado
  // Anular flexionado
  lm[13] = { x: 0.50, y: 0.58, z: 0 };
  lm[14] = { x: 0.50, y: 0.50, z: 0 }; // PIP anular
  lm[15] = { x: 0.50, y: 0.54, z: 0 };
  lm[16] = { x: 0.50, y: 0.60, z: 0 }; // TIP anular — doblado
  // Meñique flexionado
  lm[17] = { x: 0.48, y: 0.58, z: 0 };
  lm[18] = { x: 0.48, y: 0.50, z: 0 }; // PIP meñique
  lm[19] = { x: 0.48, y: 0.54, z: 0 };
  lm[20] = { x: 0.48, y: 0.60, z: 0 }; // TIP meñique — doblado
  return lm;
}

/**
 * Genera landmarks con postura de "palma abierta":
 *   - Todos los 4 dedos principales extendidos.
 */
function openPalmLandmarks(): Vec3[] {
  const lm = neutralLandmarks();
  // Índice extendido
  lm[6]  = { x: 0.5,  y: 0.50, z: 0 };
  lm[8]  = { x: 0.5,  y: 0.25, z: 0 };
  // Medio extendido
  lm[10] = { x: 0.52, y: 0.50, z: 0 };
  lm[12] = { x: 0.52, y: 0.22, z: 0 };
  // Anular extendido
  lm[14] = { x: 0.50, y: 0.50, z: 0 };
  lm[16] = { x: 0.50, y: 0.24, z: 0 };
  // Meñique extendido
  lm[18] = { x: 0.48, y: 0.50, z: 0 };
  lm[20] = { x: 0.48, y: 0.26, z: 0 };
  return lm;
}

function makeFrame(lm: Vec3[], t = 1000, scale = 0.20): HandFrame {
  return { t, landmarks: lm, handedness: 'Right', handScale: scale };
}

// ─── Tests de detección de posturas ──────────────────────────────────────────

describe('isIndexPointing()', () => {
  it('devuelve false con landmarks neutros (todos en el centro)', () => {
    expect(isIndexPointing(neutralLandmarks())).toBe(false);
  });

  it('devuelve true con postura de apuntado correcta', () => {
    expect(isIndexPointing(pointingLandmarks())).toBe(true);
  });

  it('devuelve false con palma abierta (todos los dedos extendidos)', () => {
    expect(isIndexPointing(openPalmLandmarks())).toBe(false);
  });

  it('devuelve false con menos de 21 landmarks', () => {
    expect(isIndexPointing(Array(10).fill({ x: 0.5, y: 0.5, z: 0 }))).toBe(false);
  });
});

describe('isOpenPalm()', () => {
  it('devuelve false con landmarks neutros', () => {
    expect(isOpenPalm(neutralLandmarks())).toBe(false);
  });

  it('devuelve true con palma completamente abierta', () => {
    expect(isOpenPalm(openPalmLandmarks())).toBe(true);
  });

  it('devuelve false con solo el índice extendido', () => {
    expect(isOpenPalm(pointingLandmarks())).toBe(false);
  });
});

// ─── Tests de la FSM (Fase 3) ─────────────────────────────────────────────────

describe('GestureFSM — transiciones de estado', () => {
  it('estado inicial es IDLE', () => {
    const fsm = new GestureFSM();
    expect(fsm.getState()).toBe('IDLE');
  });

  it('frame con landmarks neutros: permanece en IDLE y devuelve null', () => {
    const fsm = new GestureFSM();
    const result = fsm.update(makeFrame(neutralLandmarks()));
    expect(result).toBeNull();
    expect(fsm.getState()).toBe('IDLE');
  });

  it('frame de apuntado: transiciona IDLE → POINT y emite pointer-move', () => {
    const fsm = new GestureFSM();
    const event = fsm.update(makeFrame(pointingLandmarks()));
    expect(fsm.getState()).toBe('POINT');
    expect(event?.type).toBe('pointer-move');
  });

  it('movimiento normal en POINT emite pointer-move continuo', () => {
    const fsm = new GestureFSM();
    fsm.update(makeFrame(pointingLandmarks(), 1000, 0.20)); // IDLE → POINT
    const event = fsm.update(makeFrame(pointingLandmarks(), 1016, 0.20));
    expect(event?.type).toBe('pointer-move');
    expect(fsm.getState()).toBe('POINT');
  });

  it('frame vacío (sin landmarks) en POINT emite hand-lost y vuelve a IDLE', () => {
    const fsm = new GestureFSM();
    fsm.update(makeFrame(pointingLandmarks(), 1000, 0.20)); // → POINT
    const event = fsm.update({ t: 1016, landmarks: [], handedness: 'Right', handScale: 0 });
    expect(event?.type).toBe('hand-lost');
    expect(fsm.getState()).toBe('IDLE');
  });

  it('reset() siempre vuelve a IDLE', () => {
    const fsm = new GestureFSM();
    fsm.update(makeFrame(pointingLandmarks()));
    expect(fsm.getState()).toBe('POINT');
    fsm.reset();
    expect(fsm.getState()).toBe('IDLE');
  });

  it('spike de handScale en POINT → PUSH_ARMED', () => {
    const fsm = new GestureFSM();
    // IDLE → POINT con escala inicial pequeña
    fsm.update(makeFrame(pointingLandmarks(), 1000, 0.10));
    // Siguiente frame: escala creció abruptamente (ej: rate ~5/s >> threshold 0.25)
    const event = fsm.update(makeFrame(pointingLandmarks(), 1100, 0.60));
    expect(fsm.getState()).toBe('PUSH_ARMED');
    expect(event).toBeNull(); // en PUSH_ARMED todavía no se emite click
  });

  it('PUSH_ARMED: cuando la tasa cae a ≤0 emite click en posición del buffer', () => {
    const fsm = new GestureFSM();
    fsm.update(makeFrame(pointingLandmarks(), 1000, 0.10)); // IDLE→POINT
    fsm.update(makeFrame(pointingLandmarks(), 1100, 0.60)); // POINT→PUSH_ARMED

    // Tasa de escala vuelve a 0 (dejó de empujar)
    const event = fsm.update(makeFrame(pointingLandmarks(), 1200, 0.60));
    expect(event?.type).toBe('click');
    if (event?.type === 'click') {
      expect(typeof event.at.x).toBe('number');
      expect(typeof event.at.y).toBe('number');
      expect(event.button).toBe('left');
    }
    expect(fsm.getState()).toBe('POINT');
  });

  it('PUSH_ARMED: timeout sin confirmación → vuelve a POINT sin click', () => {
    const fsm = new GestureFSM();
    fsm.update(makeFrame(pointingLandmarks(), 1000, 0.10)); // IDLE→POINT
    fsm.update(makeFrame(pointingLandmarks(), 1100, 0.60)); // POINT→PUSH_ARMED

    // Seguimos empujando más de 500ms sin que la tasa caiga → timeout
    const event = fsm.update(makeFrame(pointingLandmarks(), 1700, 0.90)); // +600ms
    expect(event).toBeNull();
    expect(fsm.getState()).toBe('POINT');
  });

  it('palma abierta por dwellMs → CLUTCH emite clutch:engaged=true', () => {
    const config = { ...DEFAULT_CONFIG, clutch: { dwellMs: 100 } }; // dwell corto para tests
    const fsm = new GestureFSM(config);
    fsm.update(makeFrame(pointingLandmarks(), 1000, 0.20)); // IDLE→POINT

    // Open palm sostenido: primer frame inicia el timer
    fsm.update(makeFrame(openPalmLandmarks(), 1016, 0.20));
    // Segundo frame dentro del dwell: todavía no dispara
    fsm.update(makeFrame(openPalmLandmarks(), 1050, 0.20));
    // Tercer frame que supera dwellMs (100ms)
    const event = fsm.update(makeFrame(openPalmLandmarks(), 1120, 0.20));

    expect(event?.type).toBe('clutch');
    if (event?.type === 'clutch') {
      expect(event.engaged).toBe(true);
    }
    expect(fsm.getState()).toBe('CLUTCH');
  });

  it('CLUTCH: cerrar la mano emite clutch:engaged=false y vuelve a POINT', () => {
    const config = { ...DEFAULT_CONFIG, clutch: { dwellMs: 50 } };
    const fsm = new GestureFSM(config);
    fsm.update(makeFrame(pointingLandmarks(), 1000, 0.20));   // IDLE→POINT
    fsm.update(makeFrame(openPalmLandmarks(), 1016, 0.20));   // dwell start
    fsm.update(makeFrame(openPalmLandmarks(), 1070, 0.20));   // → CLUTCH

    // Cierra la mano (regresa a apuntado)
    const event = fsm.update(makeFrame(pointingLandmarks(), 1090, 0.20));
    expect(event?.type).toBe('clutch');
    if (event?.type === 'clutch') {
      expect(event.engaged).toBe(false);
    }
    expect(fsm.getState()).toBe('POINT');
  });
});
