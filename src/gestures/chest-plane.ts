export interface ChestPlane {
  minX: number;
  maxX: number;
  minY: number;
  /**
   * Borde inferior del plano interactivo (calibrado fidedignamente según screenAspectRatio).
   * No requiere descender la mano al borde del sensor (1.0) para tocar el fondo de pantalla.
   */
  maxY: number;
  isFaceTracked: boolean;
  /**
   * Aspect ratio of the target display (screenWidth / screenHeight).
   * Used to guarantee 1:1 isotropic movement in physical space.
   */
  screenAspectRatio: number;
  /**
   * Factor de amplitud interactiva (por defecto 1.0).
   * Escalable mediante el slider de calibración 'Zona Activa'.
   */
  amplitudeRatio: number;
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

export interface BoundaryProximity {
  nearLeft: boolean;
  nearRight: boolean;
  nearTop: boolean;
  nearBottom: boolean;
  anyNear: boolean;
}

/**
 * Gestor del Plano Ergonómico de Interacción al Pecho.
 *
 * Ancla el borde superior del canvas interactivo a la altura del mentón (chin-pinned)
 * y expande el plano horizontalmente hasta los hombros y hacia abajo según el Aspect Ratio
 * de la pantalla. De esta manera, el usuario barre la pantalla cómodamente a nivel del pecho
 * sin fatiga y sin riesgo de perder tracking al chocar con el límite del sensor de la cámara.
 */
export class ChestPlaneManager {
  private plane: ChestPlane = {
    minX: 0.20,
    maxX: 0.80,
    minY: 0.42,
    maxY: 0.76,   // Proporcional 16:9 desde minY
    isFaceTracked: false,
    screenAspectRatio: 16 / 9,
    amplitudeRatio: 1.0
  };

  private smoothingAlpha: number;

  constructor(smoothingAlpha = 0.15, screenAspectRatio = 16 / 9, amplitudeRatio = 1.0) {
    this.smoothingAlpha = smoothingAlpha;
    this.plane.screenAspectRatio = screenAspectRatio;
    this.plane.amplitudeRatio = amplitudeRatio;
    this.recalculateDefaultBounds();
  }

  private recalculateDefaultBounds(): void {
    const spanX = this.plane.maxX - this.plane.minX;
    const effectiveAspect = Math.min(1.45, this.plane.screenAspectRatio || (16 / 9));
    const spanY = Math.max(0.35, spanX / effectiveAspect) * this.plane.amplitudeRatio;
    this.plane.maxY = Math.min(0.94, this.plane.minY + spanY);
  }

  /**
   * Actualiza el plano a partir del bounding box del rostro reportado por FaceDetector.
   * Si no se detecta rostro, mantiene suavemente la posición previa o fallback.
   *
   * EJES DINÁMICOS Y FIDEDIGNOS:
   * - minY (tope): anclado justo bajo el mentón (chin-pinned)
   * - maxY (fondo): aprovecha la altura natural del torso/pecho, evitando compresión
   *   excesiva en monitores panorámicos para un control vertical generoso y cómodo.
   */
  public updateFromFaceBox(
    box: BoundingBoxPixels | null,
    videoDim: VideoDimensions,
    screenAspectRatio?: number,
    amplitudeRatio?: number
  ): ChestPlane {
    if (!box || videoDim.width <= 0 || videoDim.height <= 0) {
      this.plane.isFaceTracked = false;
      return this.plane;
    }

    if (screenAspectRatio !== undefined && screenAspectRatio > 0) {
      this.plane.screenAspectRatio = screenAspectRatio;
    }
    if (amplitudeRatio !== undefined && amplitudeRatio > 0) {
      this.plane.amplitudeRatio = amplitudeRatio;
    }

    // Coordenadas normalizadas del rostro [0..1]
    const faceCenterX = (box.originX + box.width / 2) / videoDim.width;
    const faceW = box.width / videoDim.width;
    const chinY = (box.originY + box.height) / videoDim.height;

    // Ancho del plano: ~2.8x el ancho del rostro (amplitud biacromial)
    const shoulderSpan = Math.max(0.40, Math.min(0.85, faceW * 2.8));

    const targetMinX = Math.max(0.05, faceCenterX - shoulderSpan / 2);
    const targetMaxX = Math.min(0.95, faceCenterX + shoulderSpan / 2);
    const targetMinY = Math.max(0.05, chinY + 0.02); // Justo bajo el mentón

    // EJE Y FIDEDIGNO: Aprovechamiento ergonómico del espacio vertical del torso
    const spanX = targetMaxX - targetMinX;
    const amp = this.plane.amplitudeRatio || 1.0;
    const effectiveAspect = Math.min(1.45, this.plane.screenAspectRatio || (16 / 9));
    const naturalSpanY = Math.max(0.35, spanX / effectiveAspect) * amp;
    // Margen seguro hasta 0.94 del encuadre para no perder tracking en el borde extremo
    const targetMaxY = Math.min(0.94, targetMinY + naturalSpanY);

    // Suavizado EMA
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

    // Clampeo seguro [0..1]
    const clampedX = Math.max(0, Math.min(1, localNormX));
    const clampedY = Math.max(0, Math.min(1, localNormY));

    return {
      x: Math.round(clampedX * screenWidth),
      y: Math.round(clampedY * screenHeight)
    };
  }

  /**
   * Comprueba si un punto de cámara está cerca del límite del sensor o del plano interactivo,
   * para activar feedback visual de affordance (zonas de seguridad).
   */
  public checkBoundaryProximity(camX: number, camY: number, threshold = 0.06): BoundaryProximity {
    const nearLeft = camX <= threshold;
    const nearRight = camX >= (1.0 - threshold);
    const nearTop = camY <= (this.plane.minY + threshold);
    const nearBottom = camY >= (1.0 - threshold) || camY >= (this.plane.maxY - threshold);

    return {
      nearLeft,
      nearRight,
      nearTop,
      nearBottom,
      anyNear: nearLeft || nearRight || nearTop || nearBottom
    };
  }

  public setAmplitudeRatio(ratio: number): void {
    if (ratio > 0) {
      this.plane.amplitudeRatio = ratio;
      this.recalculateDefaultBounds();
    }
  }

  public getPlane(): ChestPlane {
    return { ...this.plane };
  }

  public setPlane(plane: Partial<ChestPlane>): void {
    this.plane = { ...this.plane, ...plane };
  }
}
