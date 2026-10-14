import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { boardValues, cell, cells, clickCell, currentPuzzle, expect, gotoPuzzle, test, waitForBoard } from './helpers.ts';

// Top row and left column: line-solvable. Two diagonal cells: not.
const ELL = ['11111', '1....', '1....', '1....', '1....'];
const ELL_CELLS = ELL.join('').split('').map((ch) => (ch === '.' ? 0 : 1));

const tools = (page: Page) => page.getByRole('toolbar', { name: 'Editor tools' });
const status = (page: Page) => page.locator('p.status');
const toast = (page: Page) => page.locator('.toast');

async function openEditor(page: Page) {
  await page.getByRole('button', { name: 'Editor…' }).click();
  await expect(page).toHaveURL(/#edit$/);
  await expect(tools(page)).toBeVisible();
}

async function setGrid(page: Page, size: string, colors: number) {
  await tools(page).getByRole('button', { name: 'Grid…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Grid' });
  await dialog.getByRole('button', { name: size, exact: true }).click();
  await dialog.getByRole('button', { name: String(colors), exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
}

async function dragCells(page: Page, from: number, to: number) {
  const a = (await cell(page, from).boundingBox())!;
  const b = (await cell(page, to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
}

/** Draws ELL on an empty 5×5 grid: two drags. */
async function drawEll(page: Page) {
  await dragCells(page, 0, 4);
  await dragCells(page, 5, 20);
}

test('editor: live clues, Check, Play, and Back to the editor and the puzzle before', async ({ page }) => {
  await page.goto('/');
  await waitForBoard(page, 100);
  const before = page.url();

  await openEditor(page);
  await expect(page.getByRole('grid', { name: 'Puzzle editor, 10 by 10' })).toBeVisible();
  await setGrid(page, '5×5', 1);
  await expect(cells(page)).toHaveCount(25);
  await expect(status(page)).toHaveText('Empty: draw a picture to play it.');
  await expect(tools(page).getByRole('button', { name: 'Play' })).toBeDisabled();

  await clickCell(page, 0);
  await clickCell(page, 6);
  await expect(page.locator('.row-clue').nth(0)).toHaveAttribute('aria-label', 'Row 1 clue: 1');
  await expect(cell(page, 1)).toHaveAttribute('aria-label', 'Row 1, column 2, empty');
  await expect(status(page)).toHaveText('Not line-solvable: 4 cells undetermined.');

  await tools(page).getByRole('button', { name: 'Check' }).click();
  await expect(toast(page)).toHaveText('Line logic can’t determine 4 cells; they’re highlighted.');
  await expect(page.locator('.cell.undet')).toHaveCount(4);
  await expect(cell(page, 0)).toHaveAttribute('aria-label', 'Row 1, column 1, filled, undetermined');

  await tools(page).getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('.cell.undet')).toHaveCount(0);
  await drawEll(page);
  await expect(status(page)).toHaveText('Line-solvable · Easy');

  await tools(page).getByRole('button', { name: 'Play' }).click();
  await expect(page).toHaveURL(/#p=1\.5x5\./);
  await expect(page.getByRole('grid', { name: 'Picross board, 5 by 5' })).toBeVisible();
  expect([...(await currentPuzzle(page)).cells]).toEqual(ELL_CELLS);
  expect(await boardValues(page)).toEqual(new Array(25).fill(0));

  await page.goBack();
  await expect(page).toHaveURL(/#edit$/);
  expect(await boardValues(page)).toEqual(ELL_CELLS);
  await page.goBack();
  await expect(page).toHaveURL(before);
  await waitForBoard(page, 100);
});

test('editor: erase tool, right click, undo, and keyboard drawing', async ({ page }) => {
  await page.goto('/#edit');
  await setGrid(page, '5×5', 2);
  await page.keyboard.press('2');
  await clickCell(page, 0);
  await clickCell(page, 1);
  await clickCell(page, 1, 'right');
  expect((await boardValues(page)).slice(0, 2)).toEqual([2, 0]);
  await tools(page).getByRole('radio', { name: 'Erase' }).click();
  await clickCell(page, 0);
  expect((await boardValues(page))[0]).toBe(0);
  await page.keyboard.press('Control+z');
  expect((await boardValues(page))[0]).toBe(2);

  await tools(page).getByRole('radio', { name: 'black' }).click();
  await page.getByRole('grid').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  expect((await boardValues(page))[1]).toBe(1);
  await page.keyboard.press('x');
  expect((await boardValues(page))[1]).toBe(0);
});

test('editor: draft survives reload, unused colors are left out, Share copies the p= link', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = async (text: string) => {
      (window as unknown as { copied: string }).copied = text;
    };
  });
  await page.goto('/#edit');
  await expect(tools(page).getByRole('button', { name: 'Copy puzzle' })).toBeDisabled();
  await setGrid(page, '5×5', 2);
  await page.keyboard.press('2');
  await drawEll(page);
  await expect(status(page)).toHaveText('Line-solvable · Easy Unused colors left out: black.');

  await page.reload();
  await expect(cells(page)).toHaveCount(25);
  expect(await boardValues(page)).toEqual(ELL_CELLS.map((v) => v * 2));
  await expect(status(page)).toHaveText(/^Line-solvable/);

  await tools(page).getByRole('button', { name: 'Share' }).click();
  await expect(toast(page)).toHaveText('Link copied to clipboard.');
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copied).toMatch(/#p=1\.5x5\.d94040\.[\w-]+$/);
  await expect(page).toHaveURL(/#edit$/);

  // Opened from a link, so Close generates a fresh puzzle in its place.
  await tools(page).getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/#p=1\.10x10\./);
  await waitForBoard(page, 100);
});

test('editor: Grid warns before erasing; Copy puzzle loads the played puzzle', async ({ page }) => {
  const rows = ['22...', '.....', '..1..', '.....', '1...2'];
  await gotoPuzzle(page, rows);
  await openEditor(page);
  await clickCell(page, 99);

  await tools(page).getByRole('button', { name: 'Grid…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Grid' });
  await dialog.getByRole('button', { name: '5×5', exact: true }).click();
  await expect(dialog.getByText('1 drawn cell will be erased.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await tools(page).getByRole('button', { name: 'Copy puzzle' }).click();
  const confirm = page.getByRole('dialog').filter({ hasText: 'shows its solution' });
  await confirm.getByRole('button', { name: 'OK' }).click();
  await expect(cells(page)).toHaveCount(25);
  expect(await boardValues(page)).toEqual(rows.join('').split('').map((ch) => (ch === '.' ? 0 : Number(ch))));
  await expect(tools(page).getByRole('radio', { name: 'red' })).toBeVisible();
});

test('editor works offline from file://', async ({ page }) => {
  await page.goto(`${pathToFileURL(path.resolve('dist/index.html')).href}#edit`);
  await setGrid(page, '5×5', 1);
  await drawEll(page);
  await tools(page).getByRole('button', { name: 'Play' }).click();
  await expect(page).toHaveURL(/#p=1\.5x5\./);
  await expect(page.getByRole('grid', { name: 'Picross board, 5 by 5' })).toBeVisible();
});

test('mobile: editor fits without horizontal page scroll and taps draw @mobile', async ({ page }) => {
  await page.goto('/#edit');
  await setGrid(page, '20×20', 2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await cell(page, 0).tap();
  expect((await boardValues(page))[0]).toBe(1);
});
