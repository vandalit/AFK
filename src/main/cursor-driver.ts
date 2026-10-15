/**
 * Interfaz de bajo nivel para inyección de eventos de cursor al sistema operativo.
 */
export interface CursorDriver {
  init(): Promise<void>;
  move(x: number, y: number): void;
  down(button?: 'left' | 'right'): void;
  up(button?: 'left' | 'right'): void;
  click(button?: 'left' | 'right'): void;
  destroy(): void;
}

/**
 * Driver nulo utilizado durante la Fase 0 (Spike).
 * No inyecta eventos al sistema operativo para permitir validación segura del tracking visual.
 */
export class NullCursorDriver implements CursorDriver {
  public async init(): Promise<void> {
    console.log('[CursorDriver] NullCursorDriver activo (Fase 0 - Spike, sin inyección al SO).');
  }

  public move(_x: number, _y: number): void {
    // No-op en Fase 0
  }

  public down(_button: 'left' | 'right' = 'left'): void {
    // No-op en Fase 0
  }

  public up(_button: 'left' | 'right' = 'left'): void {
    // No-op en Fase 0
  }

  public click(_button: 'left' | 'right' = 'left'): void {
    // No-op en Fase 0
  }

  public destroy(): void {
    // No-op
  }
}
