import { AffordanceLevel } from '../shared/events';

export class AffordanceFadeController {
  private currentLevel: AffordanceLevel = 'L3';

  constructor(initialLevel: AffordanceLevel = 'L3') {
    this.currentLevel = initialLevel;
  }

  public setLevel(level: AffordanceLevel): void {
    this.currentLevel = level;
  }

  public getLevel(): AffordanceLevel {
    return this.currentLevel;
  }

  /** L3: Silueta volumétrica con cápsulas y palma */
  public shouldRenderVolume(): boolean {
    return this.currentLevel === 'L3';
  }

  /** L2 o L3: Esqueleto articular (líneas y nodos) */
  public shouldRenderSkeleton(): boolean {
    return this.currentLevel === 'L2' || this.currentLevel === 'L3';
  }

  /** L1, L2 o L3: Círculo del puntero en la yema del índice */
  public shouldRenderPointer(): boolean {
    return this.currentLevel !== 'L0';
  }
}
