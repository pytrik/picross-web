/** One undoable step: a set of cells with their before/after values. */
export interface Change {
  cells: number[];
  before: number[];
  after: number[];
}

/** Unlimited per-puzzle undo/redo, in memory only (SPEC §6.5). */
export class History {
  #undo: Change[] = [];
  #redo: Change[] = [];

  push(change: Change): void {
    if (change.cells.length === 0) return;
    this.#undo.push(change);
    this.#redo = [];
  }

  undo(): Change | null {
    const change = this.#undo.pop();
    if (!change) return null;
    this.#redo.push(change);
    return change;
  }

  redo(): Change | null {
    const change = this.#redo.pop();
    if (!change) return null;
    this.#undo.push(change);
    return change;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }
}
