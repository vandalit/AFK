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
import { GestureFSM } from '../gestures/fsm';

let visionWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: AppTray | null = null;
let shortcutManager: ShortcutManager | null = null;
const cursorDriver = createCursorDriver();
const fsm = new GestureFSM(DEFAULT_CONFIG);

let isTrackingActive = true;
let isCursorFrozen = false; // true cuando CLUTCH está activo
let currentAffordanceLevel: AffordanceLevel = DEFAULT_CONFIG.affordance.level;

function toggleTracking(): void {
  isTrackingActive = !isTrackingActive;
  console.log(`[Main] Tracking: ${isTrackingActive ? '🟢 ACTIVO' : '⏸️ EN PAUSA'}`);
  tray?.setTrackingState(isTrackingActive);

  if (!isTrackingActive) {
    fsm.reset();
    isCursorFrozen = false;
    sendOverlayPayload(null, 'idle');
  }
}

function setAffordanceLevel(level: AffordanceLevel): void {
  currentAffordanceLevel = level;
  tray?.setAffordanceLevel(level);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(IPC_CHANNELS.AFFORDANCE_LEVEL_CHANGE, level);
  }
}

/** Helper: envía OverlayFramePayload al renderer de afordancia */
function sendOverlayPayload(
  frame: HandFrame | null,
  gesture: OverlayFramePayload['currentGesture']
): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const payload: OverlayFramePayload = {
    frame,
    currentGesture: gesture,
    affordanceLevel: currentAffordanceLevel,
  };
  overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_FRAME, payload);
}

async function bootstrap(): Promise<void> {
  await cursorDriver.init();

  const preloadPath = join(__dirname, '../preload/index.js');

  // 1. Ventana de visión (oculta, backgroundThrottling: false)
  visionWindow = createVisionWindow(preloadPath);

  // 2. Ventana overlay (transparente, click-through)
  overlayWindow = createOverlayWindow(preloadPath);

  // 3. System Tray
  tray = new AppTray({
    onToggleTracking: toggleTracking,
    onSelectAffordanceLevel: setAffordanceLevel,
    onQuit: () => app.quit(),
  });
  tray.init();

  // 4. Atajo global de emergencia
  shortcutManager = new ShortcutManager(toggleTracking);
  shortcutManager.register();

  // 5. Dimensiones de la pantalla primaria
  const primaryDisplay = screen.getPrimaryDisplay();
  const screenDimensions = {
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height,
  };

  // 6. Bus central de IPC: Visión → FSM → CursorDriver + Overlay
  ipcMain.on(IPC_CHANNELS.VISION_FRAME, (_event, frame: HandFrame | null) => {
    if (!isTrackingActive) return;

    // ── Mano perdida ────────────────────────────────────────────────────────
    if (!frame) {
      fsm.reset();
      isCursorFrozen = false;
      sendOverlayPayload(null, 'hand-lost');
      return;
    }

    // ── Procesar frame con la FSM ───────────────────────────────────────────
    const event = fsm.update(frame);
    const fsmState = fsm.getState();

    // Mapear estado FSM a etiqueta de overlay
    let gestureLabel: OverlayFramePayload['currentGesture'] = 'idle';
    if (fsmState === 'PUSH_ARMED') gestureLabel = 'PUSH_ARMED';
    else if (fsmState === 'CLUTCH')     gestureLabel = 'CLUTCH';
    else if (fsmState === 'POINT')      gestureLabel = 'pointer-move';

    // ── Routing de eventos de la FSM ────────────────────────────────────────
    if (event) {
      switch (event.type) {

        case 'pointer-move': {
          if (!isCursorFrozen) {
            const { x, y } = mapCameraToScreen(event.x, event.y, DEFAULT_CONFIG.activeZone, screenDimensions);
            cursorDriver.move(x, y);
          }
          break;
        }

        case 'click': {
          if (!isCursorFrozen) {
            // 1. Mover cursor a la posición pre-empuje (buffer)
            const { x, y } = mapCameraToScreen(event.at.x, event.at.y, DEFAULT_CONFIG.activeZone, screenDimensions);
            cursorDriver.move(x, y);
            // 2. Disparar el click en esa posición
            cursorDriver.click('left');
            console.log(`[Main] 🖱️ Click en (${x}, ${y})`);
          }
          gestureLabel = 'click';
          break;
        }

        case 'clutch': {
          isCursorFrozen = event.engaged;
          console.log(`[Main] ✋ Clutch: ${isCursorFrozen ? 'ENGANCHADO (cursor congelado)' : 'liberado'}`);
          gestureLabel = 'clutch';
          break;
        }

        case 'hand-lost': {
          isCursorFrozen = false;
          gestureLabel = 'hand-lost';
          break;
        }
      }
    }

    // ── Enviar payload al overlay ───────────────────────────────────────────
    sendOverlayPayload(frame, gestureLabel);
  });

  console.log('[Main] AFK Inicializado exitosamente (Fase 3 - Click, Buffer Pre-Click & Clutch).');
}

app.whenReady().then(bootstrap);

app.on('will-quit', () => {
  shortcutManager?.unregisterAll();
  tray?.destroy();
  cursorDriver.destroy();
});

app.on('window-all-closed', () => {
  // La app vive en el Tray; no cerrar aunque se cierren las ventanas.
});
