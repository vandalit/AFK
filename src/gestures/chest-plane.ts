export interface ChestPlane {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  isFaceTracked: boolean;
}

export interface BoundingBoxPixels {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface VideoDimensions {
  width: number;
  height: number;
}

/**
 * Gestor del Plano Ergonómico de Interacción al Pecho.
 *
 * Ancla el borde superior del canvas interactivo a la altura del mentón (chin-pinned)
 * y expande el plano horizontalmente hasta los hombros y hacia abajo a la altura del pecho/escritorio.
 * De esta manera, el usuario controla la pantalla cómodamente a nivel del pecho sin requerir
 * tener la mano frente al rostro.
 */
export class ChestPlaneManager {
  private plane: ChestPlane = {
    minX: 0.20,
    maxX: 0.80,
    minY: 0.42,
    maxY: 0.92,
    isFaceTracked: false
  };

  private smoothingAlpha: number;

  constructor(smoothingAlpha = 0.15) {
    this.smoothingAlpha = smoothingAlpha;
  }

  /**
   * Actualiza el plano a partir del bounding box del rostro reportado por FaceDetector.
   * Si no se detecta rostro, mantiene suavemente la posición previa o fallback.
   */
  public updateFromFaceBox(
    box: BoundingBoxPixels | null,
    videoDim: VideoDimensions
  ): ChestPlane {
    if (!box || videoDim.width <= 0 || videoDim.height <= 0) {
      this.plane.isFaceTracked = false;
      return this.plane;
    }

    // Coordenadas normalizadas del rostro [0..1]
    const faceCenterX = (box.originX + box.width / 2) / videoDim.width;
    const faceW = box.width / videoDim.width;
    const faceH = box.height / videoDim.height;
    const chinY = (box.originY + box.height) / videoDim.height;

    // Proyección del plano al pecho:
    // - Ancho: aproximadamente 2.8x el ancho del rostro (amplitud biacromial de hombros)
    // - Alto: 2.2x el alto del rostro hacia el pecho/escritorio
    const shoulderSpan = Math.max(0.40, Math.min(0.85, faceW * 2.8));
    const chestDepth = Math.max(0.35, Math.min(0.58, faceH * 2.3));

    const targetMinX = Math.max(0.05, faceCenterX - shoulderSpan / 2);
    const targetMaxX = Math.min(0.95, faceCenterX + shoulderSpan / 2);
    const targetMinY = Math.max(0.10, chinY + 0.02); // Justo bajo el mentón
    const targetMaxY = Math.min(0.98, targetMinY + chestDepth);

    // Suavizado EMA para prevenir vibraciones
    const a = this.smoothingAlpha;
    this.plane.minX += (targetMinX - this.plane.minX) * a;
    this.plane.maxX += (targetMaxX - this.plane.maxX) * a;
    this.plane.minY += (targetMinY - this.plane.minY) * a;
    this.plane.maxY += (targetMaxY - this.plane.maxY) * a;
    this.plane.isFaceTracked = true;

    return this.plane;
  }

  /**
   * Mapea un punto normalizado de cámara [0..1] a la resolución de pantalla
   * utilizando el plano del pecho calibrado con efecto espejo.
   */
  public mapPointToScreen(
    camX: number,
    camY: number,
    screenWidth: number,
    screenHeight: number
  ): { x: number; y: number } {
    // Invertir X para efecto espejo natural
    const mirroredX = 1.0 - camX;
    const mirroredPlaneMinX = 1.0 - this.plane.maxX;
    const mirroredPlaneMaxX = 1.0 - this.plane.minX;

    const spanX = Math.max(0.1, mirroredPlaneMaxX - mirroredPlaneMinX);
    const spanY = Math.max(0.1, this.plane.maxY - this.plane.minY);

    // Normalizar dentro del plano del pecho
    const localNormX = (mirroredX - mirroredPlaneMinX) / spanX;
    const localNormY = (camY - this.plane.minY) / spanY;

    // Clampeo seguro [0..1] con ligero margen para alcanzar esquinas fácilmente
    const clampedX = Math.max(0, Math.min(1, localNormX));
    const clampedY = Math.max(0, Math.min(1, localNormY));

    return {
      x: Math.round(clampedX * screenWidth),
      y: Math.round(clampedY * screenHeight)
    };
  }

  public getPlane(): ChestPlane {
    return { ...this.plane };
  }

  public setPlane(plane: Partial<ChestPlane>): void {
    this.plane = { ...this.plane, ...plane };
  }
}
