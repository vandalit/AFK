import { Vec3 } from '../shared/events';

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(val: number, alpha: number): number {
    if (this.y === null) {
      this.s = val;
      this.y = val;
      return val;
    }
    this.y = alpha * val + (1.0 - alpha) * (this.s ?? val);
    this.s = this.y;
    return this.y;
  }

  public last(): number | null {
    return this.y;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

class OneEuroFilter1D {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(minCutoff = 0.8, beta = 0.015, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  public filter(x: number, timestampMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      return this.xFilter.filter(x, 1.0);
    }

    const dt = (timestampMs - this.lastTime) / 1000.0;
    this.lastTime = timestampMs;

    if (dt <= 0 || isNaN(dt)) {
      return this.xFilter.last() ?? x;
    }

    const rate = 1.0 / dt;
    const prevX = this.xFilter.last() ?? x;
    const dx = (x - prevX) * rate;

    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    return this.xFilter.filter(x, this.alpha(rate, cutoff));
  }

  public updateParams(minCutoff: number, beta: number): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

/** Filtro One Euro para un vector 3D */
export class OneEuroFilter3D {
  private fx: OneEuroFilter1D;
  private fy: OneEuroFilter1D;
  private fz: OneEuroFilter1D;

  constructor(minCutoff = 0.8, beta = 0.015, dCutoff = 1.0) {
    this.fx = new OneEuroFilter1D(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter1D(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter1D(minCutoff, beta, dCutoff);
  }

  public filter(point: Vec3, timestampMs: number): Vec3 {
    return {
      x: this.fx.filter(point.x, timestampMs),
      y: this.fy.filter(point.y, timestampMs),
      z: this.fz.filter(point.z, timestampMs)
    };
  }

  public updateParams(minCutoff: number, beta: number): void {
    this.fx.updateParams(minCutoff, beta);
    this.fy.updateParams(minCutoff, beta);
    this.fz.updateParams(minCutoff, beta);
  }

  public reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

/** Conjunto de 21 filtros One Euro (uno para cada landmark de la mano) */
export class HandFilterSet {
  private filters: OneEuroFilter3D[] = [];

  constructor(minCutoff = 0.8, beta = 0.015) {
    for (let i = 0; i < 21; i++) {
      this.filters.push(new OneEuroFilter3D(minCutoff, beta));
    }
  }

  public filterLandmarks(landmarks: Vec3[], timestampMs: number): Vec3[] {
    if (landmarks.length !== 21) return landmarks;
    return landmarks.map((pt, idx) => this.filters[idx].filter(pt, timestampMs));
  }

  public updateParams(minCutoff: number, beta: number): void {
    this.filters.forEach((f) => f.updateParams(minCutoff, beta));
  }

  public reset(): void {
    this.filters.forEach((f) => f.reset());
  }
}
