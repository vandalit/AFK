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

  /** Determina si se debe dibujar el esqueleto completo (L2 o L3) */
  public shouldRenderSkeleton(): boolean {
    return this.currentLevel === 'L2' || this.currentLevel === 'L3';
  }

  /** Determina si se debe dibujar la punta del índice (L1, L2 o L3) */
  public shouldRenderPointer(): boolean {
    return this.currentLevel !== 'L0';
  }
}
