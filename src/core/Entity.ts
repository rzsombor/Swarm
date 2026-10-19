import type { Object3D } from 'three';

export interface Component {
  /** Set by `Entity.add`. */
  entity?: Entity;
  update?(dt: number): void;
}

/** A scene-graph root plus the components that give it behaviour. */
export class Entity {
  readonly components: Component[] = [];

  constructor(readonly root: Object3D) {}

  add<T extends Component>(component: T): T {
    component.entity = this;
    this.components.push(component);
    return component;
  }

  get<T extends Component>(type: abstract new (...args: never[]) => T): T | undefined {
    return this.components.find((c): c is T => c instanceof type);
  }

  update(dt: number): void {
    for (const component of this.components) component.update?.(dt);
  }
}
