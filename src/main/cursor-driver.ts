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
 * Driver nulo utilizado para desarrollo en entornos no nativos (WSL/Linux) o pruebas.
 */
export class NullCursorDriver implements CursorDriver {
  public async init(): Promise<void> {
    console.log('[CursorDriver] NullCursorDriver activo.');
  }

  public move(x: number, y: number): void {
    // No-op en Null driver
  }

  public down(_button: 'left' | 'right' = 'left'): void {
    // No-op
  }

  public up(_button: 'left' | 'right' = 'left'): void {
    // No-op
  }

  public click(_button: 'left' | 'right' = 'left'): void {
    // No-op
  }

  public destroy(): void {
    // No-op
  }
}

/**
 * Driver nativo de Windows usando User32.dll vía koffi FFI.
 * Ejecuta SetCursorPos y mouse_event con latencia ultra-baja.
 */
export class WindowsCursorDriver implements CursorDriver {
  private setCursorPosFn: ((x: number, y: number) => boolean) | null = null;
  private mouseEventFn: ((flags: number, dx: number, dy: number, data: number, extra: number) => void) | null = null;

  // Constantes de eventos de mouse en Win32
  private static readonly MOUSEEVENTF_LEFTDOWN = 0x0002;
  private static readonly MOUSEEVENTF_LEFTUP = 0x0004;
  private static readonly MOUSEEVENTF_RIGHTDOWN = 0x0008;
  private static readonly MOUSEEVENTF_RIGHTUP = 0x0010;

  public async init(): Promise<void> {
    try {
      // Carga dinámica de koffi para prevenir fallos en entornos de build cruzado
      const koffi = await import('koffi');
      const user32 = koffi.default.load('user32.dll');

      this.setCursorPosFn = user32.func('__stdcall', 'SetCursorPos', 'bool', ['int', 'int']);
      this.mouseEventFn = user32.func('__stdcall', 'mouse_event', 'void', [
        'uint32',
        'uint32',
        'uint32',
        'uint32',
        'uintptr_t'
      ]);

      console.log('[CursorDriver] WindowsCursorDriver inicializado con éxito (user32.dll).');
    } catch (err) {
      console.error('[CursorDriver] Error al inicializar WindowsCursorDriver con koffi:', err);
      throw err;
    }
  }

  public move(x: number, y: number): void {
    if (this.setCursorPosFn) {
      this.setCursorPosFn(Math.round(x), Math.round(y));
    }
  }

  public down(button: 'left' | 'right' = 'left'): void {
    if (this.mouseEventFn) {
      const flag =
        button === 'left'
          ? WindowsCursorDriver.MOUSEEVENTF_LEFTDOWN
          : WindowsCursorDriver.MOUSEEVENTF_RIGHTDOWN;
      this.mouseEventFn(flag, 0, 0, 0, 0);
    }
  }

  public up(button: 'left' | 'right' = 'left'): void {
    if (this.mouseEventFn) {
      const flag =
        button === 'left'
          ? WindowsCursorDriver.MOUSEEVENTF_LEFTUP
          : WindowsCursorDriver.MOUSEEVENTF_RIGHTUP;
      this.mouseEventFn(flag, 0, 0, 0, 0);
    }
  }

  public click(button: 'left' | 'right' = 'left'): void {
    this.down(button);
    // Simular tiempo de pulsación físico mínimo
    setTimeout(() => {
      this.up(button);
    }, 20);
  }

  public destroy(): void {
    this.setCursorPosFn = null;
    this.mouseEventFn = null;
  }
}

/**
 * Factoría de drivers con detección de plataforma en tiempo de ejecución.
 */
export function createCursorDriver(): CursorDriver {
  if (process.platform === 'win32') {
    return new WindowsCursorDriver();
  }
  console.log(
    `[CursorDriver] Entorno '${process.platform}' detectado. Utilizando NullCursorDriver (inyección nativa reservada para Windows host).`
  );
  return new NullCursorDriver();
}
