import { globalShortcut } from 'electron';

export class ShortcutManager {
  private defaultShortcut = 'CommandOrControl+Alt+Space';
  private onToggleCallback: () => void;

  constructor(onToggle: () => void) {
    this.onToggleCallback = onToggle;
  }

  public register(): boolean {
    const success = globalShortcut.register(this.defaultShortcut, () => {
      console.log('[Shortcut] Atajo global activado:', this.defaultShortcut);
      this.onToggleCallback();
    });

    if (!success) {
      console.warn('[Shortcut] No se pudo registrar el atajo global:', this.defaultShortcut);
    } else {
      console.log('[Shortcut] Atajo global registrado:', this.defaultShortcut);
    }

    return success;
  }

  public unregisterAll(): void {
    globalShortcut.unregisterAll();
  }
}
