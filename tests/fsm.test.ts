import { describe, it, expect } from 'vitest';
import { GestureFSM } from '../src/gestures/fsm';
import { HandFrame } from '../src/shared/events';

describe('GestureFSM', () => {
  it('debe iniciar en estado IDLE', () => {
    const fsm = new GestureFSM();
    expect(fsm.getState()).toBe('IDLE');
  });

  it('debe mantener estado stub en Fase 0 sin lanzar excepciones', () => {
    const fsm = new GestureFSM();
    const mockFrame: HandFrame = {
      t: 1000,
      landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
      handedness: 'Right',
      handScale: 0.2
    };

    const event = fsm.update(mockFrame);
    expect(event).toBeNull();
    expect(fsm.getState()).toBe('IDLE');
  });

  it('debe poder reiniciar su estado a IDLE', () => {
    const fsm = new GestureFSM();
    fsm.reset();
    expect(fsm.getState()).toBe('IDLE');
  });
});
