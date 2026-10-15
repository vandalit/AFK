/**
 Constantes de canales de IPC para comunicación entre Main y Renderers
 */
export const IPC_CHANNELS = {
  /** Vision -> Main: envía fotograma de landmarks procesados */
  VISION_FRAME: 'vision:frame',
  /** Main -> Overlay: distribuye landmarks y estado de gesto */
  OVERLAY_FRAME: 'overlay:frame',
  /** Main -> Overlay: actualiza nivel de afordancia (L0..L3) */
  AFFORDANCE_LEVEL_CHANGE: 'overlay:affordance-level',
  /** Control global: Activar / Desactivar tracking */
  TOGGLE_TRACKING: 'app:toggle-tracking',
  /** Notificación de cambio de estado de tracking */
  TRACKING_STATE_CHANGED: 'app:tracking-state-changed',
  /** Actualización de parámetros en caliente */
  UPDATE_CONFIG: 'config:update',
  /** Obtener configuración actual */
  GET_CONFIG: 'config:get'
} as const;
