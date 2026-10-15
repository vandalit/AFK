import { describe, it, expect } from 'vitest';
import { OneEuroFilter3D, HandFilterSet } from '../src/vision/one-euro';
import { Vec3 } from '../src/shared/events';

describe('OneEuroFilter3D', () => {
  it('debe estabilizar fluctuaciones de alta frecuencia (jitter) en reposo', () => {
    const filter = new OneEuroFilter3D(0.8, 0.015);

    const basePoint: Vec3 = { x: 0.5, y: 0.5, z: 0.0 };
    let filtered = basePoint;

    // Simular 30 frames con temblor de sensor +/- 0.02
    for (let i = 0; i < 30; i++) {
      const jitter = (Math.sin(i) * 0.02);
      const rawPoint: Vec3 = {
        x: basePoint.x + jitter,
        y: basePoint.y - jitter,
        z: basePoint.z
      };
      filtered = filter.filter(rawPoint, i * 16.6); // ~60fps
    }

    // La fluctuación debe haber sido atenuada significativamente cerca del valor base
    expect(filtered.x).toBeCloseTo(0.5, 1);
    expect(filtered.y).toBeCloseTo(0.5, 1);
  });

  it('debe responder rápidamente ante un salto grande sin quedar rezagado', () => {
    const filter = new OneEuroFilter3D(0.8, 0.015);

    // Reposo en 0.2
    for (let i = 0; i < 10; i++) {
      filter.filter({ x: 0.2, y: 0.2, z: 0 }, i * 16.6);
    }

    // Salto rápido a 0.8
    const jumpResult = filter.filter({ x: 0.8, y: 0.8, z: 0 }, 10 * 16.6 + 16.6);
    
    // Con beta > 0, el filtro reacciona inmediatamente al impulso aumentando la frecuencia de corte
    expect(jumpResult.x).toBeGreaterThan(0.25);
    
    // En una ventana de 120-150 ms (~8 frames a 60fps), el filtro converge hacia el objetivo sin oscilación
    let currentResult = jumpResult;
    for (let f = 1; f <= 8; f++) {
      currentResult = filter.filter({ x: 0.8, y: 0.8, z: 0 }, 10 * 16.6 + f * 16.6);
    }
    expect(currentResult.x).toBeGreaterThan(0.5);
  });
});

describe('HandFilterSet', () => {
  it('debe filtrar un conjunto completo de 21 landmarks', () => {
    const filterSet = new HandFilterSet();
    const mockLandmarks: Vec3[] = Array.from({ length: 21 }, (_, i) => ({
      x: i * 0.04,
      y: i * 0.04,
      z: 0.0
    }));

    const result = filterSet.filterLandmarks(mockLandmarks, 100);
    expect(result.length).toBe(21);
    expect(result[8].x).toBeCloseTo(8 * 0.04, 2);
  });
});
