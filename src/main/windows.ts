import { BrowserWindow, screen } from 'electron';
import { join } from 'path';

export interface AppWindows {
  visionWindow: BrowserWindow | null;
  overlayWindow: BrowserWindow | null;
}

const isDev = process.env.NODE_ENV === 'development' || !process.defaultApp;

export function createVisionWindow(preloadPath: string): BrowserWindow {
  const win = new BrowserWindow({
    title: 'AFK - Vision Worker',
    width: 640,
    height: 480,
    show: false, // Ventana oculta
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      backgroundThrottling: false // CRÍTICO: Previene reducción de FPS al estar oculta
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/vision/index.html`);
  } else {
    win.loadFile(join(__dirname, '../renderer/vision/index.html'));
  }

  // Opcional para debug en desarrollo:
  // win.webContents.openDevTools({ mode: 'detach' });

  return win;
}

export function createOverlayWindow(preloadPath: string): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  const win = new BrowserWindow({
    title: 'AFK - Vectorial Affordance Layer',
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // No roba el foco de las ventanas activas
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  // Asegurar que se mantenga por encima incluso de la barra de tareas
  win.setAlwaysOnTop(true, 'screen-saver');

  // CRÍTICO: Click-through total para no interceptar clicks del mouse
  win.setIgnoreMouseEvents(true, { forward: true });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay/index.html`);
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay/index.html'));
  }

  return win;
}
