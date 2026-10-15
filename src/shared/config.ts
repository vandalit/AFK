import { AffordanceLevel } from './events';

export interface AppConfig {
  oneEuro: {
    minCutoff: number;
    beta: number;
    dCutoff: number;
  };
  activeZone: {
    ratioX: number; // Porcentaje central útil horizontal (ej: 0.6 = 60%)
    ratioY: number; // Porcentaje central útil vertical (ej: 0.6 = 60%)
  };
  push: {
    scaleRate: number; // Velocidad de crecimiento de handScale que arma el push
    bufferMs: number; // Ventana de posición previa para el click (ms)
  };
  pinch: {
    enter: number; // Umbral de entrada (distancia relativa a handScale)
    exit: number; // Umbral de salida (histéresis: exit > enter)
  };
  clutch: {
    dwellMs: number; // Tiempo de palma abierta para pausar (ms)
  };
  master: {
    dwellMs: number; // Tiempo del gesto maestro on/off (ms)
  };
  affordance: {
    level: AffordanceLevel;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  oneEuro: {
    minCutoff: 0.8,
    beta: 0.015,
    dCutoff: 1.0
  },
  activeZone: {
    ratioX: 0.6,
    ratioY: 0.6
  },
  push: {
    scaleRate: 0.25,
    bufferMs: 180
  },
  pinch: {
    enter: 0.15,
    exit: 0.22
  },
  clutch: {
    dwellMs: 500
  },
  master: {
    dwellMs: 1000
  },
  affordance: {
    level: 'L3'
  }
};
