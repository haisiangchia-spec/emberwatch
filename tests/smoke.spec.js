const { test, expect } = require('@playwright/test');

async function openCleanGame(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#scenario')).toHaveText('The Cinder Vault');
}

function monitorErrors(page) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

test('loads the game board, four heroes, and initial scenario objectives', async ({ page }) => {
  const errors = monitorErrors(page);
  await openCleanGame(page);
  await expect(page.locator('#board polygon')).toHaveCount(48);
  await expect(page.locator('#party .character')).toHaveCount(4);
  await expect(page.locator('#objectives')).toContainText('Archive Seal');
  await expect(page.locator('#objectives')).toContainText('Guardian');
  await expect(page.locator('#actionUI .ability')).toHaveCount(6);
  await expect(page.locator('#phaseInfo')).toContainText('Round 1');
  expect(errors).toEqual([]);
});

test('setup modal offers local hot-seat and can be dismissed by starting a game', async ({ page }) => {
  const errors = monitorErrors(page);
  await openCleanGame(page);
  await page.getByRole('button', { name: 'Room / Setup' }).click();
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New local hot-seat game' })).toBeVisible();
  await page.getByRole('button', { name: 'New local hot-seat game' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#party .character')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('all four players can choose two cards and the initiative phase starts', async ({ page }) => {
  const errors = monitorErrors(page);
  await openCleanGame(page);
  for (const name of ['Vanguard', 'Wayfinder', 'Runesmith', 'Warden']) {
    await expect(page.locator('#actionUI h3')).toContainText(name);
    const cards = page.locator('#actionUI button[data-card]');
    await expect(cards).toHaveCount(6);
    await cards.nth(0).click();
    await cards.nth(1).click();
    await expect(page.locator('#ready')).toBeEnabled();
    await page.locator('#ready').click();
  }
  await expect(page.locator('#phaseInfo')).toContainText('Initiative');
  await expect(page.locator('#monsterCards')).not.toContainText('Monster abilities are revealed');
  await expect(page.locator('#log')).toContainText('Initiative order:');
  expect(errors).toEqual([]);
});

test('a hero can finish a turn, and state survives a reload', async ({ page }) => {
  const errors = monitorErrors(page);
  await openCleanGame(page);
  for (let i = 0; i < 4; i++) {
    const cards = page.locator('#actionUI button[data-card]');
    await cards.nth(0).click();
    await cards.nth(1).click();
    await page.locator('#ready').click();
  }
  await expect(page.locator('#endTurn')).toBeVisible();
  const before = await page.locator('#phaseInfo').textContent();
  await page.locator('#endTurn').click();
  await expect(page.locator('#party .character')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('#party .character')).toHaveCount(4);
  await expect(page.locator('#phaseInfo')).toContainText('Round 1');
  expect(before).toContain('Round 1');
  expect(errors).toEqual([]);
});

test('new scenario resets progress and fog of war', async ({ page }) => {
  const errors = monitorErrors(page);
  await openCleanGame(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'New Scenario' }).click();
  await expect(page.locator('#objectives')).toContainText('1/3 revealed');
  await expect(page.locator('#objectives')).toContainText('Find at 5,0');
  await expect(page.locator('#actionUI .ability')).toHaveCount(6);
  expect(errors).toEqual([]);
});
