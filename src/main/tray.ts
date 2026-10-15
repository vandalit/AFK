import { Tray, Menu, nativeImage, app } from 'electron';
import { AffordanceLevel } from '../shared/events';

export interface TrayCallbacks {
  onToggleTracking: () => void;
  onSelectAffordanceLevel: (level: AffordanceLevel) => void;
  onQuit: () => void;
}

export class AppTray {
  private tray: Tray | null = null;
  private isTrackingActive = true;
  private currentAffordanceLevel: AffordanceLevel = 'L3';
  private callbacks: TrayCallbacks;

  constructor(callbacks: TrayCallbacks) {
    this.callbacks = callbacks;
  }

  public init(): void {
    // Generar un icono nativo en memoria de 16x16 px para no depender de archivos externos
    const icon = this.createDefaultIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('AFK — Control de Gestos & Afordancia');
    this.updateContextMenu();
  }

  public setTrackingState(active: boolean): void {
    this.isTrackingActive = active;
    this.updateContextMenu();
  }

  public setAffordanceLevel(level: AffordanceLevel): void {
    this.currentAffordanceLevel = level;
    this.updateContextMenu();
  }

  private updateContextMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Estado: ${this.isTrackingActive ? '🟢 Activo' : '⏸️ En Pausa'}`,
        enabled: false
      },
      {
        label: this.isTrackingActive ? 'Pausar Control' : 'Reanudar Control',
        click: () => this.callbacks.onToggleTracking(),
        accelerator: 'CmdOrCtrl+Alt+Space'
      },
      { type: 'separator' },
      {
        label: 'Capa de Afordancia',
        submenu: [
          {
            label: 'L3: Mano Completa',
            type: 'radio',
            checked: this.currentAffordanceLevel === 'L3',
            click: () => this.callbacks.onSelectAffordanceLevel('L3')
          },
          {
            label: 'L2: Esqueleto Articular',
            type: 'radio',
            checked: this.currentAffordanceLevel === 'L2',
            click: () => this.callbacks.onSelectAffordanceLevel('L2')
          },
          {
            label: 'L1: Puntas de Dedos',
            type: 'radio',
            checked: this.currentAffordanceLevel === 'L1',
            click: () => this.callbacks.onSelectAffordanceLevel('L1')
          },
          {
            label: 'L0: Solo Cursor (Invisible)',
            type: 'radio',
            checked: this.currentAffordanceLevel === 'L0',
            click: () => this.callbacks.onSelectAffordanceLevel('L0')
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Salir de AFK',
        click: () => this.callbacks.onQuit()
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private createDefaultIcon(): Electron.NativeImage {
    // Icono SVG básico de una mano/cursor de 16x16
    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6" fill="#00ffcc" />
      </svg>
    `;
    return nativeImage.createFromBuffer(Buffer.from(svgIcon));
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
