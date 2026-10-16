import { describe, it, expect } from 'vitest';
import { ChestPlaneManager } from '../src/gestures/chest-plane';

describe('ChestPlaneManager — Plano de Interacción al Pecho (Chin-Pinned)', () => {
  it('inicializa con el plano ergonómico por defecto', () => {
    const manager = new ChestPlaneManager();
    const plane = manager.getPlane();
    expect(plane.isFaceTracked).toBe(false);
    expect(plane.minY).toBeCloseTo(0.42);
    expect(plane.maxY).toBeCloseTo(0.92);
  });

  it('actualiza el plano con detección de rostro anclado al mentón', () => {
    const manager = new ChestPlaneManager(1.0); // alpha = 1.0 para test instantáneo
    // Rostro en el tercio superior: top=50px, height=100px (mentón en 150px), ancho=100px, centrado en X=320px
    const videoDim = { width: 640, height: 480 };
    const faceBox = { originX: 270, originY: 50, width: 100, height: 100 };

    const plane = manager.updateFromFaceBox(faceBox, videoDim);
    expect(plane.isFaceTracked).toBe(true);

    // chinY = 150 / 480 = 0.3125. Con el margen de +0.02, minY debe estar cerca de 0.33
    expect(plane.minY).toBeGreaterThanOrEqual(0.31);
    expect(plane.minY).toBeLessThan(0.36);

    // maxY debe extenderse hacia el pecho (más abajo en la imagen, Y > minY)
    expect(plane.maxY).toBeGreaterThan(plane.minY);
    expect(plane.maxY).toBeLessThanOrEqual(0.98);
  });

  it('mapea correctamente las posiciones de la mano a los bordes de la pantalla', () => {
    const manager = new ChestPlaneManager(1.0);
    // Configurar plano explícito para test determinista
    manager.setPlane({
      minX: 0.20,
      maxX: 0.80,
      minY: 0.30, // Mentón
      maxY: 0.80, // Pecho/Escritorio
      isFaceTracked: true
    });

    const screen = { width: 1920, height: 1080 };

    // Mano a la altura del mentón (Y = 0.30) -> borde superior de pantalla (Y = 0)
    const atChin = manager.mapPointToScreen(0.5, 0.30, screen.width, screen.height);
    expect(atChin.y).toBe(0);

    // Mano abajo al pecho (Y = 0.80) -> borde inferior de pantalla (Y = 1080)
    const atChest = manager.mapPointToScreen(0.5, 0.80, screen.width, screen.height);
    expect(atChest.y).toBe(1080);

    // Mano al centro en Y (0.55) -> centro de pantalla en Y (540)
    const atMid = manager.mapPointToScreen(0.5, 0.55, screen.width, screen.height);
    expect(atMid.y).toBeCloseTo(540, -1);
  });
});
