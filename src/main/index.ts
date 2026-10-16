import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import { createVisionWindow, createOverlayWindow } from './windows';
import { ShortcutManager } from './shortcuts';
import { AppTray } from './tray';
import { createCursorDriver } from './cursor-driver';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { HandFrame, AffordanceLevel, OverlayFramePayload } from '../shared/events';
import { DEFAULT_CONFIG } from '../shared/config';
import { mapCameraToScreen } from '../gestures/calibration';

let visionWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: AppTray | null = null;
let shortcutManager: ShortcutManager | null = null;
const cursorDriver = createCursorDriver();

let isTrackingActive = true;
let currentAffordanceLevel: AffordanceLevel = DEFAULT_CONFIG.affordance.level;

function toggleTracking(): void {
  isTrackingActive = !isTrackingActive;
  console.log(`[Main] Estado de tracking cambiado a: ${isTrackingActive ? '🟢 ACTIVO' : '⏸️ EN PAUSA'}`);
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

  // 5. Dimensiones de la pantalla primaria para mapeo
  const primaryDisplay = screen.getPrimaryDisplay();
  const screenDimensions = {
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height
  };

  // 6. Cableado de IPC: Visión -> Inyección Cursor SO + Overlay
  ipcMain.on(IPC_CHANNELS.VISION_FRAME, (_event, frame: HandFrame | null) => {
    if (!isTrackingActive) return;

    if (frame && frame.landmarks && frame.landmarks.length >= 21) {
      // Landmark 8: Punta del dedo índice
      const indexTip = frame.landmarks[8];

      // Mapeo espacial de cámara a pantalla con zona activa e inversión de eje X
      const screenCoord = mapCameraToScreen(
        indexTip.x,
        indexTip.y,
        DEFAULT_CONFIG.activeZone,
        screenDimensions
      );

      // Inyección física del cursor en el sistema operativo
      cursorDriver.move(screenCoord.x, screenCoord.y);
    }

    // Reenvío enriquecido hacia la capa de afordancia (OverlayFramePayload)
    // currentGesture = 'idle' hasta que la FSM (Fase 3) emita eventos reales
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const overlayPayload: OverlayFramePayload = {
        frame,
        currentGesture: 'idle',
        affordanceLevel: currentAffordanceLevel,
      };
      overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_FRAME, overlayPayload);
    }
  });

  console.log('[Main] AFK Inicializado exitosamente (Fase 2 - Capa Vectorial de Afordancia).');
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
