import { expect, test as base, type Page } from '@playwright/test';
import { decodePuzzle, parseHash } from '../../src/lib/puzzle/codec.ts';
import type { PuzzleDef } from '../../src/lib/puzzle/types.ts';

/** `test` that fails on any console error or uncaught exception. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} @ ${m.location().url}`));
      page.on('pageerror', (e) => errors.push(String(e)));
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const cells = (page: Page) => page.locator('.cell');
export const cell = (page: Page, i: number) => page.locator(`#cell-${i}`);

/** Board values as rendered: 0 unknown, 1..N color, 255 X. */
export async function boardValues(page: Page): Promise<number[]> {
  return cells(page).evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.v)));
}

/** Waits for a puzzle of the given cell count to be on screen. */
export async function waitForBoard(page: Page, count?: number) {
  if (count === undefined) await expect(cells(page).first()).toBeVisible();
  else await expect(cells(page)).toHaveCount(count);
}

/** The current puzzle, decoded from the URL hash. */
export async function currentPuzzle(page: Page): Promise<PuzzleDef> {
  const target = parseHash(await page.evaluate(() => location.hash));
  if (target.kind !== 'puzzle') throw new Error(`No puzzle in hash: ${target.kind}`);
  return decodePuzzle(target.value);
}

export async function clickCell(page: Page, i: number, button: 'left' | 'right' = 'left') {
  await cell(page, i).click({ button });
}

/** Plays the solution with real clicks (color keys + left/right click). */
export async function solve(page: Page) {
  const def = await currentPuzzle(page);
  const board = await boardValues(page);
  for (let i = 0; i < def.cells.length; i++) {
    const want = def.cells[i]!;
    const have = board[i]!;
    if (want === 0) {
      // Filled where it should be empty: right-click turns it into X.
      if (have !== 0 && have !== 255) await clickCell(page, i, 'right');
    } else if (have !== want) {
      await page.keyboard.press(String(want));
      await clickCell(page, i);
    }
  }
}

export async function openNewPuzzleDialog(page: Page) {
  await page.getByRole('button', { name: 'New puzzle…' }).first().click();
  await expect(page.locator('dialog.new-puzzle')).toBeVisible();
}

/**
 * Generates via the New puzzle dialog and waits until the new puzzle is on
 * screen (the URL changes; a same-size board would otherwise look ready).
 */
export async function generateVia(page: Page, size: string, colors: number) {
  const before = page.url();
  await openNewPuzzleDialog(page);
  const dialog = page.locator('dialog.new-puzzle');
  await dialog.getByRole('button', { name: size, exact: true }).click();
  await dialog.getByRole('button', { name: String(colors), exact: true }).click();
  await dialog.getByRole('button', { name: 'Generate' }).click();
  await expect(page).not.toHaveURL(before);
  await expect(page.getByRole('status').filter({ hasText: 'Generating' })).toHaveCount(0);
}
