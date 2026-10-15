export interface ActiveZoneConfig {
  ratioX: number;
  ratioY: number;
}

export interface ScreenDimensions {
  width: number;
  height: number;
}

/**
 * Mapea una coordenada normalizada de cámara [0..1] a la resolución de pantalla
 * recortando a la zona activa central (~60%) e invirtiendo el eje X (espejo).
 */
export function mapCameraToScreen(
  normX: number,
  normY: number,
  zone: ActiveZoneConfig,
  screen: ScreenDimensions
): { x: number; y: number } {
  // Invertir X para efecto espejo natural
  const mirroredX = 1.0 - normX;

  // Delimitar zona activa central
  const halfZoneX = zone.ratioX / 2;
  const halfZoneY = zone.ratioY / 2;

  const minX = 0.5 - halfZoneX;
  const maxX = 0.5 + halfZoneX;
  const minY = 0.5 - halfZoneY;
  const maxY = 0.5 + halfZoneY;

  // Clampeo y normalización dentro de la zona
  const clampedX = Math.max(minX, Math.min(maxX, mirroredX));
  const clampedY = Math.max(minY, Math.min(maxY, normY));

  const localNormX = (clampedX - minX) / zone.ratioX;
  const localNormY = (clampedY - minY) / zone.ratioY;

  return {
    x: Math.round(localNormX * screen.width),
    y: Math.round(localNormY * screen.height)
  };
}
