import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  boardValues,
  cell,
  clickCell,
  currentPuzzle,
  expect,
  generateVia,
  solve,
  test,
  waitForBoard,
} from './helpers.ts';

const X = 255;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForBoard(page, 100);
});

test('first visit generates a 10x10 puzzle into the hash', async ({ page }) => {
  await expect(page).toHaveURL(/#p=1\.10x10\.[0-9a-f]{6}\.[A-Za-z0-9_-]+$/);
  const def = await currentPuzzle(page);
  expect(def.palette).toHaveLength(1);
});

test('click fills, right-click marks X, clicking again clears', async ({ page }) => {
  await clickCell(page, 0);
  await clickCell(page, 1, 'right');
  expect((await boardValues(page)).slice(0, 2)).toEqual([1, X]);
  await clickCell(page, 0);
  await clickCell(page, 1, 'right');
  expect((await boardValues(page)).slice(0, 2)).toEqual([0, 0]);
});

test('drag fills a row span axis-locked, and undo/redo treat it as one step', async ({ page }) => {
  const from = (await cell(page, 20).boundingBox())!;
  const to = (await cell(page, 25).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Drift a little downwards: the drag must stay locked to row 2.
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 8, { steps: 8 });
  await page.mouse.up();

  let board = await boardValues(page);
  expect(board.slice(20, 26)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(board[30]).toBe(0);

  await page.keyboard.press('Control+z');
  board = await boardValues(page);
  expect(board.slice(20, 26)).toEqual([0, 0, 0, 0, 0, 0]);

  await page.keyboard.press('Control+y');
  board = await boardValues(page);
  expect(board.slice(20, 26)).toEqual([1, 1, 1, 1, 1, 1]);
});

test('keyboard moves the cursor and fills/marks cells', async ({ page }) => {
  await page.locator('[role=grid]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('x');
  const board = await boardValues(page);
  expect(board[1]).toBe(1);
  expect(board[11]).toBe(X);
});

test('progress survives a reload', async ({ page }) => {
  const url = page.url();
  await clickCell(page, 0);
  await clickCell(page, 1, 'right');
  // Saves are debounced; hiding the page also flushes, but reload is quicker.
  await page.waitForTimeout(500);
  await page.reload();
  await waitForBoard(page, 100);
  expect(page.url()).toBe(url);
  expect((await boardValues(page)).slice(0, 2)).toEqual([1, X]);
});

test('check highlights exactly the wrong cells', async ({ page }) => {
  const def = await currentPuzzle(page);
  // Fill the first empty cell (wrong) and the first filled cell (right).
  const wrongIdx = def.cells.findIndex((v) => v === 0);
  const rightIdx = def.cells.findIndex((v) => v !== 0);
  await clickCell(page, wrongIdx);
  await clickCell(page, rightIdx);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.locator('.cell.wrong')).toHaveCount(1);
  await expect(cell(page, wrongIdx)).toHaveClass(/wrong/);
});

test('solving shows the win dialog and locks the board', async ({ page }) => {
  await solve(page);
  const dialog = page.getByRole('dialog', { name: 'Solved!' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button')).toHaveText(['Close', 'New puzzle…', 'Play another']);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.badge')).toHaveText('Solved');

  const before = await boardValues(page);
  await clickCell(page, 0, 'right');
  expect(await boardValues(page)).toEqual(before);
});

test('win dialog "New puzzle…" opens the settings dialog', async ({ page }) => {
  await solve(page);
  await page.getByRole('dialog', { name: 'Solved!' }).getByRole('button', { name: 'New puzzle…' }).click();
  await expect(page.locator('dialog.new-puzzle')).toBeVisible();
});

test('win dialog "Play another" generates a new puzzle with the same size and colors', async ({ page }) => {
  await generateVia(page, '15×15', 3);
  await waitForBoard(page, 225);
  const first = await currentPuzzle(page);
  const firstUrl = page.url();

  await solve(page);
  await page.getByRole('dialog', { name: 'Solved!' }).getByRole('button', { name: 'Play another' }).click();
  await expect(page).not.toHaveURL(firstUrl);
  await waitForBoard(page, 225);
  const second = await currentPuzzle(page);
  expect([second.width, second.height]).toEqual([15, 15]);
  expect(second.palette).toEqual(first.palette);
  expect(await boardValues(page)).toEqual(new Array(225).fill(0));
});

test('multi-color puzzle: swatches, number keys select colors', async ({ page }) => {
  await generateVia(page, '20×20', 4);
  await waitForBoard(page, 400);
  const def = await currentPuzzle(page);
  expect(def.palette).toHaveLength(4);
  await expect(page.locator('.toolbar .swatch')).toHaveCount(5); // 4 colors + X tool

  await page.keyboard.press('3');
  await clickCell(page, 0);
  expect((await boardValues(page))[0]).toBe(3);
});

test('Back returns to the previous puzzle with its progress', async ({ page }) => {
  const firstUrl = page.url();
  await clickCell(page, 0);
  await generateVia(page, '5×5', 1);
  await waitForBoard(page, 25);
  await page.goBack();
  await expect(page).toHaveURL(firstUrl);
  await waitForBoard(page, 100);
  expect((await boardValues(page))[0]).toBe(1);
});

test('restart clears the board after confirming', async ({ page }) => {
  await clickCell(page, 0);
  await page.getByRole('button', { name: 'Restart' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();
  expect(await boardValues(page)).toEqual(new Array(100).fill(0));
});

test('an invalid link is replaced by a fresh puzzle with a notice', async ({ page }) => {
  await page.goto('/#p=1.garbage');
  await expect(page.getByRole('status').filter({ hasText: 'invalid' })).toBeVisible();
  await expect(page).toHaveURL(/#p=1\.10x10\./);
});

test('duplicate custom colors disable Generate', async ({ page }) => {
  await page.getByRole('button', { name: 'New puzzle…' }).click();
  const dialog = page.locator('dialog.new-puzzle');
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  const swatches = dialog.locator('input[type=color]');
  await swatches.nth(1).fill(await swatches.nth(0).inputValue());
  await expect(dialog.getByRole('button', { name: 'Generate' })).toBeDisabled();
  await expect(dialog.getByText('Each color must be different.')).toBeVisible();
});

test('works offline from file:// (single file, inlined worker)', async ({ page }) => {
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await waitForBoard(page, 100);
  await expect(page).toHaveURL(/#p=1\.10x10\./);
});

test('mobile: fits without horizontal page scroll, touch X tool works @mobile', async ({ page }) => {
  await generateVia(page, '20×20', 2);
  await waitForBoard(page, 400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);

  await page.getByRole('radio', { name: 'Mark empty' }).tap();
  await cell(page, 0).tap();
  expect((await boardValues(page))[0]).toBe(X);
});

test('screen-reader labels use color names; grid contains only rows of cells', async ({ page }) => {
  await generateVia(page, '10×10', 3);
  await waitForBoard(page, 100);
  await page.keyboard.press('2');
  await clickCell(page, 0);
  await expect(cell(page, 0)).toHaveAttribute('aria-label', 'Row 1, column 1, filled red');
  await expect(page.getByRole('radio', { name: 'blue' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: /\d/ }).first()).toHaveAttribute(
    'aria-label',
    /^Column 1 clue: (0|\d+ (black|red|blue)(, \d+ (black|red|blue))*)$/,
  );
  const stray = await page
    .locator('[role=grid]')
    .evaluate((grid) => [...grid.children].filter((c) => c.getAttribute('role') !== 'row').length);
  expect(stray).toBe(0);
});

test('saved dark theme applies before the app script runs', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => localStorage.setItem('picross:settings', JSON.stringify({ theme: 'dark' })));
  // Record the theme when <body> starts parsing: after the head script, but
  // before the app bundle (inlined at the end of body) has run.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      (window as unknown as { themeAtLoad: string | undefined }).themeAtLoad = document.documentElement.dataset.theme;
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await waitForBoard(page);
  expect(await page.evaluate(() => (window as unknown as { themeAtLoad?: string }).themeAtLoad)).toBe('dark');
});

test('solved board has no hover highlighting', async ({ page }) => {
  await solve(page);
  await page.getByRole('dialog', { name: 'Solved!' }).getByRole('button', { name: 'Close' }).click();
  await cell(page, 55).hover();
  await expect(page.locator('.cell.hl')).toHaveCount(0);
});
