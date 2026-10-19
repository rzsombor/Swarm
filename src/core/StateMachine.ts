export interface State<Id extends string> {
  enter?(from: Id | null): void;
  /** Returns the id of the state to switch to, or null to stay. */
  update?(dt: number): Id | null;
  exit?(to: Id): void;
}

export class StateMachine<Id extends string> {
  private readonly states = new Map<Id, State<Id>>();
  private currentId: Id | null = null;

  get current(): Id | null {
    return this.currentId;
  }

  add(id: Id, state: State<Id>): this {
    this.states.set(id, state);
    return this;
  }

  /** Switches state, running exit on the old one and enter on the new one. */
  go(id: Id): void {
    const next = this.states.get(id);
    if (!next) throw new Error(`Unknown state: ${id}`);
    const from = this.currentId;
    if (from !== null) this.states.get(from)?.exit?.(id);
    this.currentId = id;
    next.enter?.(from);
  }

  update(dt: number): void {
    if (this.currentId === null) return;
    const nextId = this.states.get(this.currentId)?.update?.(dt) ?? null;
    if (nextId !== null) this.go(nextId);
  }
}
