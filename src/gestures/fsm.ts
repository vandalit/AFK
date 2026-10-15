import { HandFrame, GestureEvent } from '../shared/events';
import { GestureFSMInterface, GestureState } from './types';

/**
 * Máquina de Estados Finita (FSM) de Gestos.
 * Módulo puro: Cero dependencias de Electron o APIs del navegador.
 * En la Fase 0 (Spike) se mantiene como interfaz vacía/stub según requisitos.
 */
export class GestureFSM implements GestureFSMInterface {
  private currentState: GestureState = 'IDLE';

  constructor() {}

  public update(_frame: HandFrame): GestureEvent | null {
    // Fase 0 (Spike): Stub vacío
    return null;
  }

  public reset(): void {
    this.currentState = 'IDLE';
  }

  public getState(): GestureState {
    return this.currentState;
  }
}
