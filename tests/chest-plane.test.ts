import { describe, it, expect } from 'vitest';
import { ChestPlaneManager } from '../src/gestures/chest-plane';

describe('ChestPlaneManager — Plano de Interacción al Pecho (Chin-Pinned)', () => {
  it('inicializa con el plano ergonómico por defecto', () => {
    const manager = new ChestPlaneManager();
    const plane = manager.getPlane();
    expect(plane.isFaceTracked).toBe(false);
    expect(plane.minY).toBeCloseTo(0.42);
    // maxY calculado proporcionalmente a 16:9 desde minY
    expect(plane.maxY).toBeGreaterThan(plane.minY);
    expect(plane.maxY).toBeLessThanOrEqual(0.98);
    // screenAspectRatio inicializa a 16/9 por defecto
    expect(plane.screenAspectRatio).toBeCloseTo(16 / 9);
  });

  it('actualiza el plano con detección de rostro anclado al mentón y proporción fidedigna', () => {
    const manager = new ChestPlaneManager(1.0); // alpha = 1.0 para test instantáneo
    // Rostro en el tercio superior: top=50px, height=100px (mentón en 150px), ancho=100px, centrado en X=320px
    const videoDim = { width: 640, height: 480 };
    const faceBox = { originX: 270, originY: 50, width: 100, height: 100 };

    const plane = manager.updateFromFaceBox(faceBox, videoDim);
    expect(plane.isFaceTracked).toBe(true);

    // chinY = 150 / 480 = 0.3125. Con el margen de +0.02, minY debe estar cerca de 0.33
    expect(plane.minY).toBeGreaterThanOrEqual(0.31);
    expect(plane.minY).toBeLessThan(0.36);

    // maxY fidedigno: no choca con el borde de sensor (1.0), permitiendo margen de seguridad
    expect(plane.maxY).toBeGreaterThan(plane.minY);
    expect(plane.maxY).toBeLessThanOrEqual(0.98);
  });

  it('acepta screenAspectRatio y amplitudeRatio como parámetros en updateFromFaceBox', () => {
    const manager = new ChestPlaneManager(1.0);
    const videoDim = { width: 640, height: 480 };
    const faceBox = { originX: 270, originY: 50, width: 100, height: 100 };

    manager.updateFromFaceBox(faceBox, videoDim, 21 / 9, 0.8);
    expect(manager.getPlane().screenAspectRatio).toBeCloseTo(21 / 9);
    expect(manager.getPlane().amplitudeRatio).toBeCloseTo(0.8);
  });

  it('mapea correctamente las posiciones de la mano a los bordes de la pantalla', () => {
    const manager = new ChestPlaneManager(1.0);
    // Configurar plano explícito para test determinista
    manager.setPlane({
      minX: 0.20,
      maxX: 0.80,
      minY: 0.30, // Mentón
      maxY: 0.70, // Límite inferior de interacción
      isFaceTracked: true,
      screenAspectRatio: 16 / 9
    });

    const screen = { width: 1920, height: 1080 };

    // Mano a la altura del mentón (Y = 0.30) -> borde superior de pantalla (Y = 0)
    const atChin = manager.mapPointToScreen(0.5, 0.30, screen.width, screen.height);
    expect(atChin.y).toBe(0);

    // Mano en el límite inferior activo (Y = 0.70) -> borde inferior de pantalla (Y = 1080)
    const atBottom = manager.mapPointToScreen(0.5, 0.70, screen.width, screen.height);
    expect(atBottom.y).toBe(1080);

    // Mano al centro en Y (entre 0.30 y 0.70 = 0.50) -> centro de pantalla en Y (540)
    const atMid = manager.mapPointToScreen(0.5, 0.50, screen.width, screen.height);
    expect(atMid.y).toBeCloseTo(540, -1);
  });

  it('detecta proximidad a los bordes para zonas de seguridad de affordance', () => {
    const manager = new ChestPlaneManager(1.0);
    const proxEdge = manager.checkBoundaryProximity(0.02, 0.5);
    expect(proxEdge.nearLeft).toBe(true);
    expect(proxEdge.anyNear).toBe(true);

    const proxCenter = manager.checkBoundaryProximity(0.5, 0.5);
    expect(proxCenter.anyNear).toBe(false);
  });
});
