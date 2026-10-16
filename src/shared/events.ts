/** Coordenada 3D normalizada [0..1] reportada por MediaPipe */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Fotograma de mano con los 21 landmarks filtrados y normalizados */
export interface HandFrame {
  /** Timestamp de captura en milisegundos */
  t: number;
  /** 21 puntos de la mano filtrados por One Euro */
  landmarks: Vec3[];
  /** Lateralidad detectada */
  handedness: 'Left' | 'Right';
  /** Distancia normalizadora muñeca - nudillo dedo medio */
  handScale: number;
  /** Nivel de confianza opcional reportado por el modelo */
  score?: number;
}

/** Eventos emitidos por la FSM de gestos */
export type GestureEvent =
  | { type: 'pointer-move'; x: number; y: number }
  | { type: 'click'; at: { x: number; y: number }; button: 'left' }
  | { type: 'drag-start'; at: { x: number; y: number } }
  | { type: 'drag-end'; at: { x: number; y: number } }
  | { type: 'pinch'; amount: number }
  | { type: 'grab'; amount: number }
  | { type: 'clutch'; engaged: boolean }
  | { type: 'master-toggle' }
  | { type: 'hand-lost' };

/** Niveles de afordancia gráfica de la capa de manos */
export type AffordanceLevel = 'L0' | 'L1' | 'L2' | 'L3';

/** Payload transmitido desde Main hacia el Overlay en cada frame */
export interface OverlayFramePayload {
  frame: HandFrame | null;
  /** Estado/evento actual de la FSM para feedback visual reactivo */
  currentGesture: GestureEvent['type'] | 'idle' | 'PUSH_ARMED' | 'CLUTCH';
  affordanceLevel: AffordanceLevel;
  screenPointer?: { x: number; y: number };
}
