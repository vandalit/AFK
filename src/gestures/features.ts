import { Vec3 } from '../shared/events';

// ─── Distancias ───────────────────────────────────────────────────────────────

/** Distancia euclidiana 3D entre dos puntos */
export function distance3D(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Distancia euclidiana 2D (plano de la cámara) */
export function distance2D(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calcula la escala de la mano normalizadora:
 * Distancia entre muñeca (landmark 0) y nudillo del dedo medio (landmark 9).
 */
export function computeHandScale(landmarks: Vec3[]): number {
  if (landmarks.length < 10) return 1.0;
  return distance3D(landmarks[0], landmarks[9]) || 1.0;
}

/**
 * Calcula la distancia normalizada entre la yema del pulgar (4) y la yema del índice (8)
 * en proporción a la escala de la mano (handScale).
 * Valores menores indican aproximación (pinch).
 */
export function computePinchDistance(landmarks: Vec3[], handScale: number): number {
  if (landmarks.length < 9 || handScale <= 0) return 1.0;
  return distance3D(landmarks[4], landmarks[8]) / handScale;
}

// ─── Detección de posturas ────────────────────────────────────────────────────

/**
 * Un dedo está extendido si su punta (tip) está significativamente más alta
 * que su articulación PIP (proximal interphalangeal) en el plano de imagen.
 * En coordenadas normalizadas de MediaPipe, Y = 0 es la parte superior.
 *
 * Se aplica un margen de 0.02 (2% de altura normalizada) para filtrar el ruido
 * de la detección y evitar transiciones falsas en posturas ambiguas.
 */
function isFingerExtended(tip: Vec3, pip: Vec3, margin = 0.02): boolean {
  return tip.y < pip.y - margin;
}

/**
 * Postura de APUNTADO ("Point"): índice extendido, los otros tres dedos principales
 * (medio, anular, meñique) claramente flexionados.
 *
 * Landmarks usados:
 *   Índice: tip=8, pip=6
 *   Medio:  tip=12, pip=10
 *   Anular: tip=16, pip=14
 *   Meñique: tip=20, pip=18
 */
export function isIndexPointing(landmarks: Vec3[]): boolean {
  if (landmarks.length < 21) return false;
  const indexExtended = isFingerExtended(landmarks[8],  landmarks[6]);
  const middleFolded  = !isFingerExtended(landmarks[12], landmarks[10]);
  const ringFolded    = !isFingerExtended(landmarks[16], landmarks[14]);
  const pinkyFolded   = !isFingerExtended(landmarks[20], landmarks[18]);
  return indexExtended && middleFolded && ringFolded && pinkyFolded;
}

/**
 * Postura de PALMA ABIERTA ("Clutch"): los cuatro dedos principales extendidos
 * simultáneamente. Se usa para pausar el control y descansar el brazo.
 *
 * Nota: El pulgar se omite intencionalmente porque su eje de extensión es
 * lateral (X) y su comportamiento varía entre manos derechas e izquierdas;
 * para el gesto de clutch no es necesario incluirlo.
 */
export function isOpenPalm(landmarks: Vec3[]): boolean {
  if (landmarks.length < 21) return false;
  return (
    isFingerExtended(landmarks[8],  landmarks[6])  &&  // Índice
    isFingerExtended(landmarks[12], landmarks[10]) &&  // Medio
    isFingerExtended(landmarks[16], landmarks[14]) &&  // Anular
    isFingerExtended(landmarks[20], landmarks[18])     // Meñique
  );
}
