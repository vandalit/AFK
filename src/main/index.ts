import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { createVisionWindow, createOverlayWindow } from './windows';
import { ShortcutManager } from './shortcuts';
import { AppTray } from './tray';
import { NullCursorDriver } from './cursor-driver';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { HandFrame, AffordanceLevel } from '../shared/events';
import { DEFAULT_CONFIG } from '../shared/config';

let visionWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: AppTray | null = null;
let shortcutManager: ShortcutManager | null = null;
const cursorDriver = new NullCursorDriver();

let isTrackingActive = true;
let currentAffordanceLevel: AffordanceLevel = DEFAULT_CONFIG.affordance.level;

function toggleTracking(): void {
  isTrackingActive = !isTrackingActive;
  console.log(`[Main] Estado de tracking cambiado a: ${isTrackingActive ? 'ACTIVO' : 'PAUSADO'}`);
  tray?.setTrackingState(isTrackingActive);

  if (!isTrackingActive && overlayWindow && !overlayWindow.isDestroyed()) {
    // Al pausar, limpiamos la capa vectorial enviando null
    overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_FRAME, null);
  }
}

function setAffordanceLevel(level: AffordanceLevel): void {
  currentAffordanceLevel = level;
  tray?.setAffordanceLevel(level);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(IPC_CHANNELS.AFFORDANCE_LEVEL_CHANGE, level);
  }
}

async function bootstrap(): Promise<void> {
  await cursorDriver.init();

  const preloadPath = join(__dirname, '../preload/index.js');

  // 1. Crear ventana de visión (oculta)
  visionWindow = createVisionWindow(preloadPath);

  // 2. Crear ventana overlay (transparente, click-through)
  overlayWindow = createOverlayWindow(preloadPath);

  // 3. Inicializar System Tray
  tray = new AppTray({
    onToggleTracking: toggleTracking,
    onSelectAffordanceLevel: setAffordanceLevel,
    onQuit: () => app.quit()
  });
  tray.init();

  // 4. Registrar atajo global
  shortcutManager = new ShortcutManager(toggleTracking);
  shortcutManager.register();

  // 5. Cableado de IPC: Visión -> Main -> Overlay
  ipcMain.on(IPC_CHANNELS.VISION_FRAME, (_event, frame: HandFrame | null) => {
    if (!isTrackingActive) return;

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_FRAME, frame);
    }
  });

  console.log('[Main] AFK Inicializado exitosamente (Fase 0 - Spike).');
}

app.whenReady().then(bootstrap);

app.on('will-quit', () => {
  shortcutManager?.unregisterAll();
  tray?.destroy();
  cursorDriver.destroy();
});

app.on('window-all-closed', () => {
  // Prevenir que la app se cierre si las ventanas se cierran; la app vive en el Tray
});
