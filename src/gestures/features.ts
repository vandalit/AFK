import { Vec3 } from '../shared/events';

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
