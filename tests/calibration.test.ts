import { describe, it, expect } from 'vitest';
import { mapCameraToScreen } from '../src/gestures/calibration';
import { computeHandScale, distance3D } from '../src/gestures/features';
import { Vec3 } from '../src/shared/events';

describe('Calibration & Mapping', () => {
  const zone = { ratioX: 0.6, ratioY: 0.6 };
  const screen = { width: 1920, height: 1080 };

  it('debe mapear el centro de la cámara exactamente al centro de la pantalla con espejo', () => {
    // Si la cámara detecta el punto en el centro (0.5, 0.5)
    const result = mapCameraToScreen(0.5, 0.5, zone, screen);
    expect(result.x).toBe(960);
    expect(result.y).toBe(540);
  });

  it('debe invertir el eje X (espejo) correctamente', () => {
    // Movimiento a la derecha de la persona en el espacio (normX pequeño en cámara no espejada)
    // Con espejo X, debe proyectarse a la derecha de la pantalla (x mayor)
    const rightSide = mapCameraToScreen(0.3, 0.5, zone, screen);
    const leftSide = mapCameraToScreen(0.7, 0.5, zone, screen);
    
    expect(rightSide.x).toBeGreaterThan(leftSide.x);
  });

  it('debe clampear a los bordes de la pantalla cuando la mano llega al límite de la zona activa', () => {
    // Fuera de la zona activa en X
    const clampedLeft = mapCameraToScreen(0.9, 0.5, zone, screen);
    expect(clampedLeft.x).toBe(0);

    const clampedRight = mapCameraToScreen(0.1, 0.5, zone, screen);
    expect(clampedRight.x).toBe(1920);
  });
});

describe('Feature Extraction', () => {
  it('debe calcular distancias euclidianas 3D correctamente', () => {
    const p1: Vec3 = { x: 0, y: 0, z: 0 };
    const p2: Vec3 = { x: 3, y: 4, z: 0 };
    expect(distance3D(p1, p2)).toBe(5);
  });

  it('debe calcular handScale entre la muñeca (0) y el nudillo medio (9)', () => {
    const landmarks: Vec3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    landmarks[0] = { x: 0, y: 0, z: 0 };
    landmarks[9] = { x: 0, y: 0.25, z: 0 };

    const scale = computeHandScale(landmarks);
    expect(scale).toBeCloseTo(0.25, 3);
  });
});
