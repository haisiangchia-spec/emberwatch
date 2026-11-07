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
  page.once('dialog', dialog => dialog.accept());
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
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#hubNext').click();
  const hp = await page.evaluate(() => JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0].maxHp);
  expect(hp).toBe(18);
  expect(errors).toEqual([]);
});


test('top and bottom actions are independent of initiative card', async ({ page }) => {
  await openCleanGame(page);
  const cards = page.locator('#actionUI button[data-card]');
  await cards.nth(0).click();
  await cards.nth(1).click();
  await page.locator('#topChoice').selectOption('1');
  await page.locator('#initChoice').selectOption('0');
  await page.locator('#ready').click();
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
  expect(p.picked).toEqual([1,0]);
  expect(p.initChoice).toBe(1);
  expect(p.ready).toBe(true);
});

test('long rest commits initiative 99, heals, and loses chosen discard card', async ({ page }) => {
  await openCleanGame(page);
  await page.evaluate(() => {
    const key='emberwatch_save_v1';
    const s=JSON.parse(localStorage.getItem(key));
    const p=s.players[0];
    s.round=2;
    p.hand=[0,1,2,3];
    p.discard=[4,5];
    p.hp=9;
    // Isolate long-rest timing from monster attacks and damage prompts.
    s.enemies=[];
    localStorage.setItem(key,JSON.stringify(s));
  });
  await page.reload();
  await page.locator('#longRestCard').selectOption('5');
  await page.locator('#longRest').click();
  const before=await page.evaluate(() => JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
  expect(before.resting).toBe(true);
  expect(before.longRestLoss).toBe(5);
  for (let n=0;n<3;n++){
    const cards=page.locator('#actionUI button[data-card]');
    await cards.nth(0).click();
    await cards.nth(1).click();
    await page.locator('#ready').click();
  }
  const revealed=await page.evaluate(() => JSON.parse(localStorage.getItem('emberwatch_save_v1')).order);
  expect(revealed.some(x=>x.type==='player'&&x.id===0&&x.initiative===99)).toBe(true);
  // Long rest resolves at initiative 99, after the earlier hero turns.
  for(let turn=0;turn<3;turn++) {
    const end=page.locator('#endTurn');
    if(await end.isVisible()) await end.click();
  }
  const result=await page.evaluate(() => {
    const s=JSON.parse(localStorage.getItem('emberwatch_save_v1'));
    return {p:s.players[0],order:s.order,round:s.round};
  });
  expect(result.p.lost).toContain(5);
  expect(result.p.hand).toContain(4);
  expect(result.p.discard).not.toContain(4);
  expect(result.p.hp).toBeGreaterThanOrEqual(9);
});


test('short rest occurs in the end-of-round phase and permits exactly one redraw',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='roundEnd';s.roundEndIndex=0;s.round=2;
  s.players[0].hand=[0,1,2];s.players[0].discard=[3,4,5];
  s.players[0].hp=10;s.players[0].maxHp=14;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await expect(page.locator('#phaseInfo')).toContainText('End of round');
 await page.locator('#restNow').click();
 const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(first.discard).toHaveLength(0);
 expect(first.lost).toHaveLength(1);
 expect(first.hand).toHaveLength(5);
 await page.locator('#redrawRest').click();
 const second=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(second.hp).toBe(9);
 expect(second.lost).toHaveLength(1);
 expect(second.hand).toHaveLength(5);
 await expect(page.locator('#redrawRest')).toBeDisabled();
 await page.locator('#finishRest').click();
 await expect(page.locator('#phaseInfo')).toContainText('Round 3');
});

test('hero can negate monster damage by losing one eligible hand card',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.players[0].hp=11;
  s.players[0].picked=[0,1];s.players[0].hand=[0,1,2,3,4,5];
  s.pendingDamage={heroIndex:0,amount:7,source:'test strike',condition:null,resume:'manual'};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await expect(page.locator('#damageChoice')).toContainText('7');
 await expect(page.locator('#damageChoice input[data-pool="hand"]')).toHaveCount(4);
 await page.locator('#damageChoice input[data-pool="hand"][value="2"]').check();
 await page.locator('#loseHand').click();
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(p.hp).toBe(11);
 expect(p.hand).not.toContain(2);
 expect(p.lost).toContain(2);
});

test('hero can negate damage using two distinct discarded cards',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.players[0].hp=11;s.players[0].discard=[4,5];
  s.pendingDamage={heroIndex:0,amount:9,source:'test strike',condition:null,resume:'manual'};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#damageChoice input[data-pool="discard"][value="4"]').check();
 await page.locator('#damageChoice input[data-pool="discard"][value="5"]').check();
 await page.locator('#loseDiscard').click();
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(p.hp).toBe(11);
 expect(p.discard).toHaveLength(0);
 expect(p.lost).toEqual([4,5]);
});

test('taking damage applies damage and can exhaust the hero',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.players[0].hp=3;
  s.pendingDamage={heroIndex:0,amount:5,source:'test strike',condition:null,resume:'manual'};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(p.hp).toBe(0);expect(p.exhausted).toBe(true);
});

test('Wound damage at hero turn start can be prevented without applying twice',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;s.order=[{type:'player',id:1,initiative:12},{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[1].picked=[0,1];s.players[0].picked=[0,1];s.players[0].hp=7;
  s.players[0].conditions={wound:true};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toContainText('Wound');
 await expect(page.locator('#damageChoice')).toContainText('1');
 await page.locator('#damageChoice input[data-pool="hand"][value="2"]').check();
 await page.locator('#loseHand').click();
 await expect(page.locator('#damageChoice')).toHaveCount(0);
 await expect(page.locator('#endTurn')).toBeVisible();
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(p.hp).toBe(7);
 expect(p.lost).toContain(2);
 expect(p.conditions.wound).toBe(true);
});

test('Steel Buckler can be spent once and becomes available after a long rest',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.campaign.heroes[0].gear.push('buckler');
  s.phase='act';s.round=2;s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[0].picked=[0,1];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#useBuckler').click();
 await expect(page.locator('#useBuckler')).toBeDisabled();
 let p=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(p.spentItems).toContain('buckler');
 expect(p.guard).toBe(2);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.order=[{type:'player',id:1,initiative:12},{type:'player',id:0,initiative:99}];s.turnIndex=0;
  s.players[1].picked=[0,1];s.players[0].resting=true;
  s.players[0].picked=[];s.players[0].discard=[4,5];s.players[0].hand=[0,1,2,3];s.players[0].longRestLoss=5;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 p=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(p.spentItems).toEqual([]);
 expect(p.lost).toContain(5);
 expect(p.hand).toContain(4);
});

test('short-rest redraw never sacrifices a card from the untouched hand',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='roundEnd';s.roundEndIndex=0;s.round=2;
  s.players[0].hand=[0,1,2];s.players[0].discard=[3,4,5];s.players[0].hp=10;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#restNow').click();
 await page.locator('#redrawRest').click();
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0]);
 expect(p.lost).toHaveLength(1);
 expect([3,4,5]).toContain(p.lost[0]);
 expect([0,1,2]).not.toContain(p.lost[0]);
});

test('structured Brace shield is activated in battle and expires at round end',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[0].picked=[0,1];localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.some(e=>e.type==='shield'&&e.value===1)).toBe(true);
 await page.locator('#endTurn').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.some(e=>e.type==='shield')).toBe(false);
});

test('structured Warden Retaliate activates in battle and hurts adjacent attacker',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:3,initiative:27}];s.turnIndex=0;
  s.players[3].picked=[0,2];localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[3].active.some(e=>e.type==='retaliate'&&e.value===1)).toBe(true);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.players[3].q=1;s.players[3].r=5;
  s.enemies=[{id:'test-monster',name:'Ash Raider',hp:6,maxHp:6,q:2,r:5,conditions:{}}];
  s.pendingDamage={heroIndex:3,amount:2,source:'Ash Raider',condition:null,resume:'manual',attack:true,sourceId:'test-monster'};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(5);
});

test('Iron Sweep can push a surviving enemy one legal hex', async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.players[1].q=2;s.players[1].r=5;
  s.enemies=[{id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{}}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([2,4]);
});

test('Mark Quarry can pull a surviving enemy closer', async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:1,initiative:23}];s.turnIndex=0;
  s.players[1].picked=[1,0];s.enemies=[{id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:2,r:3,conditions:{}}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="3"]').click();
 await expect(page.locator('#actionUI')).toContainText('pull the enemy');
 await page.locator('#board polygon[data-q="1"][data-r="3"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([1,3]);
});

test('Static Bloom can attack two different enemy targets', async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:2,initiative:43}];s.turnIndex=0;
  s.players[2].picked=[5,0];
  s.modifiers.heroes[2].draw=[0,0];s.modifiers.heroes[2].discard=[];
  s.enemies=[
   {id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:2,r:4,conditions:{}},
   {id:'e1',name:'Ash Raider',hp:99,maxHp:99,q:2,r:3,conditions:{}}
  ];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('attack');
 await page.locator('#board polygon[data-q="2"][data-r="3"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.every(e=>e.hp<99)).toBe(true);
});

test('linked push happens before retaliation range check',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.enemies=[{
   id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{},
   active:[{type:'retaliate',value:4,range:1,duration:'round'}]
  }];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([2,4]);
 expect(st.players[0].hp).toBe(st.players[0].maxHp);
 expect(st.pendingDamage).toBeNull();
});

test('a surviving adjacent enemy retaliates after hero attack and the damage can be avoided',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[0].picked=[0,1];s.enemies=[{
   id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{},
   active:[{type:'retaliate',value:3,range:1,duration:'round'}]
  }];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toContainText('retaliation');
 const hp=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')).players[0].hp);
 await page.locator('#damageChoice input[data-pool="hand"][value="2"]').check();
 await page.locator('#loseHand').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(hp);
 expect(st.players[0].lost).toContain(2);
 expect(st.pendingAttack).toBeNull();
 expect(st.pendingDamage).toBeNull();
 await expect(page.locator('#damageChoice')).toHaveCount(0);
});

test('lethal attack does not trigger defender retaliation',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[0].picked=[0,1];s.enemies=[{
   id:'e0',name:'Ash Raider',hp:1,maxHp:1,q:1,r:4,conditions:{},
   active:[{type:'retaliate',value:9,range:1,duration:'round'}]
  }];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(st.players[0].maxHp);
 expect(st.pendingDamage).toBeNull();
});

test('skipping an optional push still resolves adjacent defender retaliation',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.enemies=[{
   id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{},
   active:[{type:'retaliate',value:2,range:1,duration:'round'}]
  }];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 await page.locator('#cancelTarget').click();
 await expect(page.locator('#damageChoice')).toContainText('retaliation');
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(st.players[0].maxHp-2);
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([1,4]);
 expect(st.pendingDamage).toBeNull();
});

test('Arc Pulse area anchor selects a two-hex pattern and damages both enemies',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:2,initiative:58}];s.turnIndex=0;
  s.players[2].picked=[1,0];
  s.modifiers.heroes[2].draw=[0,0];s.modifiers.heroes[2].discard=[];
  s.enemies=[
   {id:'test-a',name:'Ash Raider',hp:99,maxHp:99,q:2,r:4,conditions:{}},
   {id:'test-b',name:'Ash Raider',hp:99,maxHp:99,q:2,r:3,conditions:{}}
  ];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await expect(page.locator('#actionUI')).toContainText('anchor for the area pattern');
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 const highlighted=page.locator('#board polygon.selected');
 await expect(highlighted).toHaveCount(2);
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="3"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.every(e=>e.hp<99)).toBe(true);
});

test('monster and hero modifier rolls use Strengthen and Muddle selection consistently',async ({page})=>{
 await openCleanGame(page);
 const rolls=await page.evaluate(()=>{
  const cards=()=>{let i=0;const rolls=[{mod:-2,damage:1},{mod:2,damage:5}];return ()=>rolls[i++]};
  const choose=window.EmberwatchAbilities.chooseRoll;
  return {
   strong:choose(cards(),{strengthen:true}).damage,
   muddled:choose(cards(),{muddle:true}).damage,
   neutral:choose(cards(),{strengthen:true,muddle:true}).damage
  };
 });
 expect(rolls.strong).toBe(5);
 expect(rolls.muddled).toBe(1);
 expect(rolls.neutral).toBe(1);
});

test('two monster attacks suspend and resume through the queue without duplicate draws', async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.enemies=[
   {id:'ash-one',name:'Ash Raider',hp:8,maxHp:8,q:2,r:4,conditions:{}},
   {id:'ash-two',name:'Ash Raider',hp:8,maxHp:8,q:2,r:5,conditions:{}}
  ];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Raider':{name:'Testing Strike',initiative:20,move:-2,attack:0,range:0,shuffle:false}};
  s.modifiers.monsters.draw=[0,0,0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.combatQueue.owner).toBe('monster');
 expect(saved.combatQueue.index).toBe(1);
 expect(saved.combatQueue.paused).toBe(true);
 const firstDraws=saved.modifiers.monsters.discard.length;
 await page.reload();
 await expect(page.locator('#damageChoice')).toBeVisible();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.combatQueue.index).toBe(1);
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.combatQueue.index).toBe(2);
 expect(saved.modifiers.monsters.discard.length).toBe(firstDraws+1);
 await page.locator('#takeDamage').click();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.combatQueue).toBeNull();
 expect(saved.pendingDamage).toBeNull();
 expect(saved.turnIndex).toBe(2);
 expect(saved.journal.filter(line=>line.includes('attacks '))).toHaveLength(2);
 expect(errors).toEqual([]);
});

test('hero retaliation interruption resumes selected action after page reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[0].picked=[0,1];s.enemies=[{
   id:'retal-monster',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{},
   active:[{type:'retaliate',value:2,range:1,duration:'round'}]
  }];
  s.modifiers.heroes[0].draw=[0,0];s.modifiers.heroes[0].discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.combatQueue.owner).toBe('hero');
 expect(saved.combatQueue.paused).toBe(true);
 const hp=saved.enemies[0].hp;
 await page.reload();
 await page.locator('#takeDamage').click();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.enemies[0].hp).toBe(hp);
 expect(saved.combatQueue).toBeNull();
 expect(saved.pendingDamage).toBeNull();
 await expect(page.locator('#endTurn')).toBeVisible();
 expect(errors).toEqual([]);
});

test('legacy interrupted monster save resumes without replaying earlier attacks',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';
  s.order=[{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:0,initiative:30}];
  s.turnIndex=0;s.enemyCursor=2;s.combatQueue=null;
  s.enemies=[
   {id:'old-ash-one',name:'Ash Raider',hp:8,maxHp:8,q:2,r:4,conditions:{}},
   {id:'old-ash-two',name:'Ash Raider',hp:8,maxHp:8,q:2,r:5,conditions:{}}
  ];
  s.pendingDamage={heroIndex:0,amount:2,source:'old-ash-two',condition:null,resume:'enemy',monsterType:'Ash Raider',sourceId:'old-ash-two',attack:true};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.turnIndex).toBe(1);
 expect(st.journal.filter(x=>x.includes('attacks '))).toHaveLength(0);
 expect(errors).toEqual([]);
});

test('hero move and heal resolve through queued actions without duplicate completion',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.loot=[[0,3]];s.walls=[];s.rocks=[];s.difficult=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="0"][data-r="3"]').click();
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(state.players[0].q).toBe(0);
 expect(state.players[0].r).toBe(3);
 expect(state.players[0].coins).toBe(1);
 expect(state.loot.some(([q,r])=>q===0&&r===3)).toBe(false);
 expect(state.combatQueue).toBeNull();
 await page.reload();
 state=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(state.players[0].coins).toBe(1);
 expect(state.journal.filter(x=>x.includes('collects a coin'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('structured monster multi-attack ability pauses per hit and resumes without replay',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.enemies=[{id:'double-hitter',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Raider':{
    name:'Double Strike',initiative:20,move:0,attack:0,range:0,
    abilities:[{type:'move',value:0},{type:'attack',value:2,range:1},
               {type:'attack',value:2,range:1}]
  }};
  s.modifiers.monsters.draw=[0,0,0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(state.combatQueue.index).toBe(3);
 expect(state.combatQueue.paused).toBe(true);
 const first=state.modifiers.monsters.discard.length;
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 state=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(state.combatQueue.index).toBe(4);
 expect(state.combatQueue.paused).toBe(true);
 expect(state.modifiers.monsters.discard.length).toBe(first+1);
 await page.reload();
 await page.locator('#takeDamage').click();
 state=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(state.pendingDamage).toBeNull();
 expect(state.combatQueue).toBeNull();
 expect(state.turnIndex).toBe(2);
 expect(state.journal.filter(x=>x.includes('attacks '))).toHaveLength(2);
 expect(errors).toEqual([]);
});
