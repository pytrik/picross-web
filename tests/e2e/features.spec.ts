import { boardValues, cell, cells, clickCell, expect, gotoPuzzle, solve, test } from './helpers.ts';

const X = 255;

// Row clues: [2], [0], [1], [0], [1, 1]. Column clues: [1, 1], [1], [1], [0], [1].
const SMALL = ['11...', '.....', '..1..', '.....', '1...1'];

/** n×n board of 5×5 blocks in a checkerboard: short clues (3 runs per line). */
const blocks = (n: number) =>
  Array.from({ length: n }, (_, r) => (Math.floor(r / 5) % 2 ? '.....11111' : '11111.....').repeat(n / 10));

const rowClue = (page: import('@playwright/test').Page, r: number) => page.locator('.row-clue').nth(r);

async function dragCells(page: import('@playwright/test').Page, from: number, to: number, hold?: () => Promise<void>) {
  const a = (await cell(page, from).boundingBox())!;
  const b = (await cell(page, to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await hold?.();
  await page.mouse.up();
}

async function setOption(page: import('@playwright/test').Page, name: string, on: boolean) {
  await page.getByRole('button', { name: 'Options…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Options' });
  await dialog.getByRole('checkbox', { name }).setChecked(on);
  await dialog.getByRole('button', { name: 'Done' }).click();
}

test('impossible lines are flagged, and the option turns it off (persisted)', async ({ page }) => {
  await gotoPuzzle(page, SMALL);
  await clickCell(page, 2);
  await expect(page.locator('.row-clue.err')).toHaveCount(0);
  await clickCell(page, 0);
  await clickCell(page, 1);
  await expect(rowClue(page, 0)).toHaveClass(/err/);
  await expect(rowClue(page, 0)).toHaveAttribute('aria-label', 'Row 1 clue: 2, impossible');

  await setOption(page, 'Flag impossible lines', false);
  await expect(page.locator('.err')).toHaveCount(0);
  await page.reload();
  await expect(cells(page)).toHaveCount(25);
  await expect(rowClue(page, 0)).toHaveAttribute('aria-label', 'Row 1 clue: 2');
});

test('auto-X marks finished lines, and one undo reverts the stroke', async ({ page }) => {
  await gotoPuzzle(page, SMALL);
  await clickCell(page, 0);
  await clickCell(page, 1);
  expect((await boardValues(page)).filter((v) => v === X)).toHaveLength(0);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');

  await setOption(page, 'Auto-X finished lines', true);
  await dragCells(page, 0, 1);
  const board = await boardValues(page);
  const xs = board.flatMap((v, i) => (v === X ? [i] : []));
  // Row 1 (clue 2) and column 2 (clue 1) are finished; column 1 (1, 1) isn't.
  expect(xs).toEqual([2, 3, 4, 6, 11, 16, 21]);

  await page.keyboard.press('Control+z');
  expect(await boardValues(page)).toEqual(new Array(25).fill(0));
});

test('a drag shows a run counter while it spans 2+ cells', async ({ page }) => {
  await gotoPuzzle(page, SMALL);
  await dragCells(page, 5, 8, async () => {
    await expect(page.locator('.counter')).toHaveText('4');
  });
  await expect(page.locator('.counter')).toHaveCount(0);
});

test('recent puzzles list, reopen, Back, and delete', async ({ page }) => {
  const first = await gotoPuzzle(page, SMALL);
  await clickCell(page, 0);
  const second = await gotoPuzzle(page, ['1....', '.1...', '..1..', '...1.', '....1']);
  await clickCell(page, 0);

  await page.getByRole('button', { name: 'Recent…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recent puzzles' });
  const items = dialog.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Current');
  await expect(items.nth(0)).toContainText('5×5 · 1 color');
  await expect(items.nth(0)).toContainText('In progress');
  await expect(items.nth(0).getByRole('button', { name: /Delete/ })).toHaveCount(0);

  await items.nth(1).getByRole('button').first().click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`#${first.replace(/[.]/g, '\\.')}$`));
  await expect(cell(page, 0)).toHaveAttribute('data-v', '1');
  await expect(cell(page, 6)).toHaveAttribute('data-v', '0');

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#${second.replace(/[.]/g, '\\.')}$`));

  await page.getByRole('button', { name: 'Recent…' }).click();
  await items.nth(1).getByRole('button', { name: /Delete/ }).click();
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText('Current');
});

test('zoom buttons and keys enlarge cells; clues stay stuck while scrolling', async ({ page }) => {
  await gotoPuzzle(page, blocks(30));
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  await expect(zoomOut).toBeDisabled();
  const before = (await cell(page, 0).boundingBox())!.width;

  await zoomIn.click();
  await zoomIn.click();
  await page.keyboard.press('+');
  const after = (await cell(page, 0).boundingBox())!.width;
  expect(after).toBeGreaterThan(before * 1.5);
  await expect(zoomOut).toBeEnabled();
  // Up to the 64 px limit, where the board overflows both ways.
  while (await zoomIn.isEnabled()) await zoomIn.click();
  expect((await cell(page, 0).boundingBox())!.width).toBeGreaterThan(60);

  const wrap = page.locator('.wrap');
  expect(await wrap.evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollWidth > el.clientWidth)).toBe(true);
  await wrap.evaluate((el) => el.scrollTo(el.scrollWidth, el.scrollHeight));
  const wrapBox = (await wrap.boundingBox())!;
  const colClues = (await page.locator('.col-clues').boundingBox())!;
  const rowClues = (await page.locator('.row-clues').boundingBox())!;
  expect(Math.abs(colClues.y - wrapBox.y)).toBeLessThan(1);
  expect(Math.abs(rowClues.x - wrapBox.x)).toBeLessThan(1);

  // Arrow keys keep the cursor cell in view.
  await page.locator('[role=grid]').focus();
  await page.keyboard.press('ArrowRight');
  const cursor = (await page.locator('.cell.cursor').boundingBox())!;
  expect(cursor.x).toBeGreaterThanOrEqual(rowClues.x + rowClues.width - 1);
  expect(cursor.y).toBeGreaterThanOrEqual(colClues.y + colClues.height - 1);

  for (let i = 0; i < 8; i++) await page.keyboard.press('-');
  await expect(zoomOut).toBeDisabled();
  await expect(zoomIn).toBeEnabled();
});

test('mobile: pinch zooms without drawing, one finger on clues pans @mobile', async ({ page }) => {
  await gotoPuzzle(page, blocks(20));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, id) => ({ x: Math.round(p.x), y: Math.round(p.y), id })),
    });

  const grid = (await page.locator('[role=grid]').boundingBox())!;
  const cx = grid.x + grid.width / 2;
  const cy = grid.y + grid.height / 2;
  const before = (await cell(page, 0).boundingBox())!.width;

  // First finger lands (would start drawing), second finger joins, spread.
  await touch('touchStart', [{ x: cx - 20, y: cy }]);
  await touch('touchStart', [{ x: cx - 20, y: cy }, { x: cx + 20, y: cy }]);
  for (let d = 30; d <= 120; d += 10) {
    await touch('touchMove', [{ x: cx - d, y: cy }, { x: cx + d, y: cy }]);
  }
  await touch('touchEnd', []);

  const after = (await cell(page, 0).boundingBox())!.width;
  expect(after).toBeGreaterThan(before * 2);
  expect(await boardValues(page)).toEqual(new Array(400).fill(0));

  // One finger on the column clues pans horizontally.
  const wrap = page.locator('.wrap');
  await wrap.evaluate((el) => (el.scrollLeft = 0));
  const startLeft = 0;
  const clues = (await page.locator('.col-clues').boundingBox())!;
  const y = clues.y + clues.height / 2;
  await touch('touchStart', [{ x: clues.x + 200, y }]);
  for (let x = 190; x >= 60; x -= 10) await touch('touchMove', [{ x: clues.x + x, y }]);
  await touch('touchEnd', []);
  expect(await wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(startLeft + 50);
  expect(await boardValues(page)).toEqual(new Array(400).fill(0));
});

test('theme is chosen in Options and persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoPuzzle(page, SMALL);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Options…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Options' });
  await expect(dialog.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(cells(page)).toHaveCount(25);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('hint fills a forced cell, shows its line, and is one undo step', async ({ page }) => {
  // Row 1 [5 black] and rows 2, 4, 5 [0] force five cells each; the cursor
  // (top-left) breaks the tie in favour of row 1.
  await gotoPuzzle(page, ['11111', '.....', '..2..', '.....', '.....']);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(cell(page, 0)).toHaveAttribute('data-v', '1');
  expect((await boardValues(page)).filter((v) => v !== 0)).toHaveLength(1);
  await expect(cell(page, 0)).toHaveClass(/hint-cell/);
  await expect(rowClue(page, 0)).toHaveClass(/hint/);
  await expect(page.getByRole('status')).toHaveText(/^Hint: row 1 forces row 1, column 1 to be filled \w+\.$/);

  await page.keyboard.press('Control+z');
  expect(await boardValues(page)).toEqual(new Array(25).fill(0));
  await page.keyboard.press('h');
  await expect(cell(page, 0)).toHaveAttribute('data-v', '1');
});

test('hint on a wrong board points out the mistake and changes nothing', async ({ page }) => {
  await gotoPuzzle(page, ['11111', '.....', '..2..', '.....', '.....']);
  await clickCell(page, 7);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByRole('status')).toHaveText('Fix the highlighted mistake first.');
  await expect(page.locator('.cell.wrong')).toHaveCount(1);
  await expect(cell(page, 7)).toHaveClass(/wrong/);
  expect((await boardValues(page)).filter((v) => v !== 0)).toHaveLength(1);
});

test('hint says when line logic is stuck', async ({ page }) => {
  // Every line is [1]: any permutation fits, so nothing is forced.
  await gotoPuzzle(page, ['1....', '.1...', '..1..', '...1.', '....1']);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByRole('status')).toHaveText('Line logic can’t determine any more cells.');
  expect(await boardValues(page)).toEqual(new Array(25).fill(0));
});

test('hints used survive a reload and show on win; Hint is disabled once solved', async ({ page }) => {
  await gotoPuzzle(page, ['11111', '.....', '..2..', '.....', '.....']);
  await page.keyboard.press('h');
  await page.keyboard.press('h');
  await expect(page.locator('.cell[data-v="0"]')).toHaveCount(23);
  await page.reload();
  await expect(page.locator('.cell[data-v="0"]')).toHaveCount(23);
  await solve(page);
  const dialog = page.getByRole('dialog', { name: 'Solved!' });
  await expect(dialog.locator('dt', { hasText: 'Hints used' }).locator('+ dd')).toHaveText('2');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Hint' })).toBeDisabled();
});
