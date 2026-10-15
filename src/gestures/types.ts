export type { Vec3, HandFrame, GestureEvent } from '../shared/events';

export type GestureState =
  | 'OFF'
  | 'IDLE'
  | 'POINT'
  | 'PUSH_ARMED'
  | 'CLICK'
  | 'DRAG'
  | 'CLUTCH';

export interface GestureFSMInterface {
  update(frame: import('../shared/events').HandFrame): import('../shared/events').GestureEvent | null;
  reset(): void;
  getState(): GestureState;
}
