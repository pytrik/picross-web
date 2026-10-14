import { decodePuzzle, encodePuzzle, type HashTarget } from '../puzzle/codec.ts';
import { puzzleKey } from '../puzzle/key.ts';
import { PuzzleError, type PuzzleDef } from '../puzzle/types.ts';

/** A puzzle plus the identifiers derived from where it came from. */
export interface LoadedPuzzle {
  def: PuzzleDef;
  /** Canonical hash body (without `#`). */
  hash: string;
  /** Storage key (SPEC §7.2). */
  key: string;
}

export function fromDefinition(def: PuzzleDef): LoadedPuzzle {
  const hash = encodePuzzle(def);
  return { def, hash, key: puzzleKey({ hash }) };
}

/**
 * Resolves a hash target to a puzzle (SPEC §11). Async from day one so a
 * database-backed `id=` source can slot in without touching callers.
 */
export async function resolvePuzzle(target: HashTarget): Promise<LoadedPuzzle> {
  switch (target.kind) {
    case 'puzzle':
      return fromDefinition(decodePuzzle(target.value));
    case 'id':
      // Future: GET /api/puzzles/<id> → PuzzleDef, key `id:<id>`, hash `id=<id>`.
      throw new PuzzleError('Puzzle links by id are not supported yet');
    default:
      throw new PuzzleError('No puzzle in link');
  }
}
