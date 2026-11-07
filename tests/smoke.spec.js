const { test, expect } = require('@playwright/test');

async function openCleanGame(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // A clean browser deliberately opens the first-run setup overlay.
  // Dismiss it by starting a local game before interacting with the board.
  const overlay = page.locator('#overlay');
  if (await overlay.isVisible()) {
    await overlay.locator('#local').click();
    await expect(overlay).toBeHidden();
  }
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


test('campaign hub persists purchases and card enhancements across a scenario reset', async ({ page }) => {
  const errors = monitorErrors(page);
  await openCleanGame(page);
  await page.evaluate(() => {
    const key = 'emberwatch_save_v1';
    const save = JSON.parse(localStorage.getItem(key));
    save.campaign.heroes[0].gold = 10;
    save.campaign.heroes[0].xp = 6;
    save.campaign.materials = 2;
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload();
  await page.locator('#campaignHub').click();
  await expect(page.locator('#campaignRoster')).toContainText('Gold 10');
  await page.locator('[data-buy="0:sword"]').click();
  await expect(page.locator('#campaignRoster')).toContainText('Tempered Edge');
  await page.locator('[data-enhance="0"]').click();
  await expect(page.locator('#campaignRoster')).toContainText('Shield Rush ✓');
  await page.locator('#hubNext').click();
  await expect(page.locator('#phaseInfo')).toContainText('Round 1');
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('emberwatch_save_v1')).campaign);
  expect(progress.heroes[0].gold).toBe(4);
  expect(progress.heroes[0].xp).toBe(6);
  expect(progress.heroes[0].gear).toContain('sword');
  expect(progress.heroes[0].upgrades).toContain(0);
  expect(progress.materials).toBe(0);
  await page.reload();
  await page.locator('#campaignHub').click();
  await expect(page.locator('#campaignRoster')).toContainText('Tempered Edge');
  expect(errors).toEqual([]);
});

test('campaign levels increase max HP on the next scenario', async ({ page }) => {
  const errors = monitorErrors(page);
  await openCleanGame(page);
  await page.evaluate(() => {
    const key = 'emberwatch_save_v1';
    const save = JSON.parse(localStorage.getItem(key));
    save.campaign.heroes[0].level = 3;
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload();
  await page.locator('#campaignHub').click();
  await page.locator('#hubNext').click();
  const hp = await page.evaluate(() => JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0].maxHp);
  expect(hp).toBe(18);
  expect(errors).toEqual([]);
});
