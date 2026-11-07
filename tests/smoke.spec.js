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
  s.players[0].picked=[0,1];s.modifiers.heroes[0].draw=[0];s.modifiers.heroes[0].discard=[];s.enemies=[{
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
 expect(saved.combatQueue.index).toBe(4);
 expect(saved.combatQueue.paused).toBe(true);
 expect(saved.combatQueue.events.every(e=>e.type!=='monsterTurn')).toBe(true);
 const firstDraws=saved.modifiers.monsters.discard.length;
 await page.reload();
 await expect(page.locator('#damageChoice')).toBeVisible();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.combatQueue.index).toBe(4);
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.combatQueue.index).toBe(9);
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
 expect(state.combatQueue.index).toBe(4);
 expect(state.combatQueue.paused).toBe(true);
 const first=state.modifiers.monsters.discard.length;
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 state=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(state.combatQueue.index).toBe(5);
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

test('scripted monster Shield and infusion resolve once around an interrupted attack',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.enemies=[{id:'buffer',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Raider':{
    name:'Cinder Ward',initiative:20,
    abilities:[{type:'shield',value:2,duration:'round'},
               {type:'attack',value:2,range:1},
               {type:'infuse',element:'fire'}]
  }};
  s.modifiers.monsters.draw=[0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].active.filter(a=>a.type==='shield')).toHaveLength(1);
 expect(st.elements.fire).toBe(0);
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.enemies[0].active.filter(a=>a.type==='shield')).toHaveLength(1);
 expect(st.elements.fire).toBe(2);
 expect(st.journal.filter(line=>line.includes('FIRE infused'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('queued hero healing restores HP and infuses its element once',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:3,initiative:63}];s.turnIndex=0;
  s.players[3].picked=[1,0];s.players[0].hp=8;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="0"][data-r="4"]').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(11);
 expect(st.elements.light).toBe(2);
 expect(st.combatQueue).toBeNull();
 expect(st.journal.filter(x=>x.includes('LIGHT infused'))).toHaveLength(1);
 await page.reload();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(11);
 expect(st.journal.filter(x=>x.includes('LIGHT infused'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('queued hero attack resumes forced Push after reload without drawing modifier twice',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.modifiers.heroes[0].draw=[0,0];
  s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{},
    active:[{type:'retaliate',value:2,range:1,duration:'round'}]}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue?.paused).toBe(true);
 expect(st.combatQueue?.index).toBe(1);
 expect(st.pendingHeroChoice?.targetId).toBe('e0');
 const hp=st.enemies[0].hp,used=st.modifiers.heroes[0].discard.length;
 await page.reload();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(hp);
 expect(st.modifiers.heroes[0].discard.length).toBe(used);
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([2,4]);
 expect(st.pendingDamage).toBeNull();
 expect(st.pendingHeroChoice).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('skipping a queued Push after reload still triggers Retaliate only once',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.modifiers.heroes[0].draw=[0,0];
  s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{},
    active:[{type:'retaliate',value:2,range:1,duration:'round'}]}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await page.reload();
 await page.locator('#cancelTarget').click();
 await expect(page.locator('#damageChoice')).toContainText('retaliation');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue?.paused).toBe(true);
 expect(st.pendingHeroChoice).toBeNull();
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(st.players[0].maxHp-2);
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('end turn cannot abandon an unresolved queued Push decision',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.modifiers.heroes[0].draw=[0];s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{}}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 await page.locator('#endTurn').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.turnIndex).toBe(0);
 expect(st.combatQueue?.paused).toBe(true);
 expect(st.pendingHeroChoice).not.toBeNull();
 await page.locator('#cancelTarget').click();
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(after.pendingHeroChoice).toBeNull();
 expect(after.combatQueue).toBeNull();
});

test('multi-target card remembers selected targets and modifier draws across reloads',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:2,initiative:43}];s.turnIndex=0;
  s.players[2].picked=[5,0];s.modifiers.heroes[2].draw=[0,0,0];
  s.modifiers.heroes[2].discard=[];
  s.enemies=[
   {id:'first',name:'Ash Raider',hp:99,maxHp:99,q:2,r:4,conditions:{}},
   {id:'second',name:'Ash Raider',hp:99,maxHp:99,q:2,r:3,conditions:{}}
  ];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingTargeting.actorId).toBe('p2');
 expect(st.pendingTargeting.action.multiRemaining).toBe(2);
 await page.reload();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 const firstHp=st.enemies.find(e=>e.id==='first').hp;
 const used=st.modifiers.heroes[2].discard.length;
 expect(firstHp).toBeLessThan(99);
 expect(st.pendingTargeting.action.targetIds).toEqual(['first']);
 expect(st.pendingTargeting.action.multiRemaining).toBe(1);
 await page.reload();
 await expect(page.locator('#board polygon.selected')).toHaveCount(1);
 await page.locator('#board polygon[data-q="2"][data-r="3"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='first').hp).toBe(firstHp);
 expect(st.enemies.find(e=>e.id==='second').hp).toBeLessThan(99);
 expect(st.modifiers.heroes[2].discard.length).toBe(used+1);
 expect(st.pendingTargeting).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('area anchor and remaining area targets survive repeated reloads',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:2,initiative:58}];s.turnIndex=0;
  s.players[2].picked=[1,0];s.modifiers.heroes[2].draw=[0,0,0];
  s.modifiers.heroes[2].discard=[];
  s.enemies=[
   {id:'area-one',name:'Ash Raider',hp:99,maxHp:99,q:2,r:4,conditions:{}},
   {id:'area-two',name:'Ash Raider',hp:99,maxHp:99,q:2,r:3,conditions:{}}
  ];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await expect(page.locator('#actionUI')).toContainText('anchor for the area pattern');
 await page.reload();
 await expect(page.locator('#actionUI')).toContainText('anchor for the area pattern');
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingTargeting.action.areaTargets).toEqual(['area-one','area-two']);
 await page.reload();
 await expect(page.locator('#board polygon.selected')).toHaveCount(2);
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 const hp=st.enemies.find(e=>e.id==='area-one').hp;
 await page.reload();
 await expect(page.locator('#board polygon.selected')).toHaveCount(1);
 await page.locator('#board polygon[data-q="2"][data-r="3"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='area-one').hp).toBe(hp);
 expect(st.enemies.find(e=>e.id==='area-two').hp).toBeLessThan(99);
 expect(st.pendingTargeting).toBeNull();
 expect(errors).toEqual([]);
});

test('multi-target attack continues after first defender retaliates and player reloads',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:2,initiative:43}];s.turnIndex=0;
  s.players[2].picked=[5,0];s.modifiers.heroes[2].draw=[0,0,0];s.modifiers.heroes[2].discard=[];
  s.enemies=[
   {id:'retaliator',name:'Ash Raider',hp:99,maxHp:99,q:2,r:4,conditions:{},
    active:[{type:'retaliate',value:1,range:3,duration:'round'}]},
   {id:'other',name:'Ash Raider',hp:99,maxHp:99,q:2,r:3,conditions:{}}
  ];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toContainText('retaliation');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingTargeting.action.multiRemaining).toBe(2);
 const firstHp=st.enemies[0].hp;
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingTargeting.action.targetIds).toEqual(['retaliator']);
 expect(st.pendingTargeting.action.multiRemaining).toBe(1);
 expect(st.pendingDamage).toBeNull();
 await page.reload();
 await expect(page.locator('#board polygon.selected')).toHaveCount(1);
 await page.locator('#board polygon[data-q="2"][data-r="3"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(firstHp);
 expect(st.enemies[1].hp).toBeLessThan(99);
 expect(st.pendingTargeting).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(2);
 expect(errors).toEqual([]);
});

test('queued monster focus and movement are committed before attack interruption and reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.enemies=[{id:'focus-ash',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Raider':{
    name:'Focus Probe',initiative:20,move:0,attack:0,range:0,
    abilities:[{type:'move',value:0},{type:'attack',value:2,range:1}]
  }};
  s.modifiers.monsters.draw=[0,0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(initial.combatQueue.paused).toBe(true);
 expect(initial.combatQueue.index).toBe(4);
 const focus=initial.monsterTurnPlans['focus-ash'];
 expect(focus.focused).toBe(true);
 expect(focus.targetId).toMatch(/^p[0-3]$/);
 expect(initial.monsterFocusTrace['focus-ash'][0].targetId).toBe(focus.targetId);
 const draws=initial.modifiers.monsters.discard.length;
 await page.reload();
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(restored.monsterTurnPlans['focus-ash']).toEqual(focus);
 expect(restored.modifiers.monsters.discard.length).toBe(draws);
 await page.locator('#takeDamage').click();
 const finished=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(finished.combatQueue).toBeNull();
 expect(finished.monsterTurnPlans['focus-ash']).toBeUndefined();
 expect(finished.monsterFocusTrace['focus-ash']).toBeUndefined();
 expect(finished.journal.filter(x=>x.includes(' focuses '))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('legacy monster modifier card is normalized into stable scripted events before interruption',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.enemies=[{id:'old-format',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Raider':{name:'Standard Attack',initiative:20,move:-2,attack:0,range:0,condition:'poison'}};
  s.modifiers.monsters.draw=[0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue.events.map(e=>e.type)).toEqual([
  'monsterStart','monsterFocus','monsterMove','monsterAttack','monsterFinish'
 ]);
 expect(st.combatQueue.index).toBe(4);
 const attack=st.combatQueue.events[3].step;
 expect(attack).toMatchObject({type:'attack',condition:'poison'});
 const damage=st.pendingDamage.amount,draws=st.modifiers.monsters.discard.length;
 await page.reload();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue.events[3].step).toEqual(attack);
 expect(st.pendingDamage.amount).toBe(damage);
 expect(st.modifiers.monsters.discard.length).toBe(draws);
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue).toBeNull();
 expect(st.monsterTurnPlans['old-format']).toBeUndefined();
 expect(st.journal.filter(line=>line.includes(' attacks '))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('pre-migration atomic monster queue snapshot completes without replaying attacks',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.round=2;
  s.order=[{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:0,initiative:30}];
  s.turnIndex=0;
  s.combatQueue={version:1,owner:'monster',index:1,paused:true,pauseReason:'damage',
   events:[{type:'monsterTurn',actorId:'old-one',monsterType:'Ash Raider'}]};
  s.pendingDamage={heroIndex:0,amount:2,source:'old-one',condition:null,
    resume:'queue',monsterType:'Ash Raider',sourceId:'old-one',attack:true};
  s.enemies=[{id:'old-one',name:'Ash Raider',hp:8,maxHp:8,q:2,r:4,conditions:{}}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.turnIndex).toBe(1);
 expect(st.journal.filter(x=>x.includes(' attacks '))).toHaveLength(0);
 expect(errors).toEqual([]);
});

test('monster without an attack still focuses as melee and moves',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.enemies=[{id:'marcher',name:'Ash Raider',hp:8,maxHp:8,q:1,r:2,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Raider':{name:'Advance Only',initiative:20,abilities:[{type:'move',value:2}]}};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.turnIndex).toBe(2);
 expect(st.enemies[0].q!==1||st.enemies[0].r!==2).toBe(true);
 expect(st.journal.filter(x=>x.includes(' focuses '))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks '))).toHaveLength(0);
 expect(errors).toEqual([]);
});

test('Disarm suppresses monster attack while retaining melee focus',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.enemies=[{id:'disarmed',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{disarm:true}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Raider':{name:'Cannot Attack',initiative:20,abilities:[
   {type:'move',value:1},{type:'attack',value:3,range:2}
  ]}};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.turnIndex).toBe(2);
 expect(st.journal.filter(x=>x.includes(' focuses '))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks '))).toHaveLength(0);
 expect(st.pendingDamage).toBeNull();
 expect(errors).toEqual([]);
});

test('Immobilized monster does not move but can attack adjacent focus',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.enemies=[{id:'stuck',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{immobilize:true}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Raider':{name:'Rooted Swing',initiative:20,abilities:[
   {type:'move',value:3},{type:'attack',value:2,range:1}
  ]}};
  s.modifiers.monsters.draw=[0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].q).toBe(1);
 expect(st.enemies[0].r).toBe(3);
 expect(st.pendingDamage.amount).toBe(2);
 await page.locator('#takeDamage').click();
 expect(errors).toEqual([]);
});

test('monster focuses on a safer distant enemy rather than crossing a trap to a nearer enemy',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.players[0].q=2;s.players[0].r=4;
  s.players[1].q=5;s.players[1].r=2;
  for(let i=2;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'avoider',name:'Ash Raider',hp:8,maxHp:8,q:2,r:2,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  // All legal melee attack hexes adjacent to p0 require at least one trap.
  s.traps=[[3,4],[2,3],[1,3],[1,4],[1,5],[2,5]];
  s.monsterReveals={'Ash Raider':{name:'Path Test',initiative:20,
    abilities:[{type:'move',value:0},{type:'attack',value:2,range:1}]}};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.journal.some(line=>line.includes(' focuses '+st.players[1].name))).toBe(true);
 expect(st.journal.some(line=>line.includes(' focuses '+st.players[0].name))).toBe(false);
 expect(errors).toEqual([]);
});

test('adjacent ranged monster retreats minimum safe distance but retains primary focus',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:1,initiative:10},{type:'enemy',id:'Ash Archer',initiative:20}];
  s.turnIndex=0;s.players[1].picked=[0,1];
  for(let i=0;i<4;i++)if(i!==1){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'ranged-retreater',name:'Ash Archer',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.traps=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Archer':{name:'Ranged Retreat',initiative:20,abilities:[
   {type:'move',value:2},{type:'attack',value:3,range:3}
  ]}};
  s.modifiers.monsters.draw=[0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 const monster=st.enemies[0],target=st.players[1];
 expect(st.monsterTurnPlans['ranged-retreater'].targetId).toBe(target.id);
 const dist=await page.evaluate(({a,b})=>window.EmberwatchAbilities.distance(a,b),
   {a:{q:monster.q,r:monster.r},b:{q:target.q,r:target.r}});
 expect(dist).toBe(2);
 expect(st.modifiers.monsters.discard.length).toBe(1);
 const savedPos=[monster.q,monster.r];
 await page.reload();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual(savedPos);
 await page.locator('#takeDamage').click();
 expect(errors).toEqual([]);
});

test('muddled adjacent ranged monster does not retreat solely to avoid disadvantage',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:1,initiative:10},{type:'enemy',id:'Ash Archer',initiative:20}];
  s.turnIndex=0;s.players[1].picked=[0,1];
  for(let i=0;i<4;i++)if(i!==1){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'muddled-archer',name:'Ash Archer',hp:8,maxHp:8,q:1,r:3,conditions:{muddle:true}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.traps=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Archer':{name:'Ranged Shot',initiative:20,abilities:[
   {type:'move',value:2},{type:'attack',value:3,range:3}
  ]}};
  s.modifiers.monsters.draw=[-2,2];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([1,3]);
 expect(st.pendingDamage.amount).toBe(1);
 expect(st.modifiers.monsters.discard.length).toBe(2);
 expect(errors).toEqual([]);
});

test('immobilized adjacent ranged monster attacks with disadvantage',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:1,initiative:10},{type:'enemy',id:'Ash Archer',initiative:20}];
  s.turnIndex=0;s.players[1].picked=[0,1];
  for(let i=0;i<4;i++)if(i!==1){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'rooted-ranged',name:'Ash Archer',hp:8,maxHp:8,q:1,r:3,conditions:{immobilize:true}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Archer':{name:'Rooted Shot',initiative:20,abilities:[
   {type:'move',value:3},{type:'attack',value:3,range:3}
  ]}};
  s.modifiers.monsters.draw=[-2,2];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([1,3]);
 expect(st.pendingDamage.amount).toBe(1);
 expect(st.modifiers.monsters.discard.length).toBe(2);
 expect(errors).toEqual([]);
});

test('explicit ranged Range 1 attack suffers adjacency disadvantage without retreat',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:1,initiative:10},{type:'enemy',id:'Ash Archer',initiative:20}];
  s.turnIndex=0;s.players[1].picked=[0,1];
  for(let i=0;i<4;i++)if(i!==1){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'range-one',name:'Ash Archer',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.traps=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Archer':{name:'Close Shot',initiative:20,abilities:[
   {type:'move',value:2},{type:'attack',value:3,range:1,ranged:true}
  ]}};
  s.modifiers.monsters.draw=[-2,2];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([1,3]);
 expect(st.pendingDamage.amount).toBe(1);
 expect(st.modifiers.monsters.discard.length).toBe(2);
 expect(errors).toEqual([]);
});

test('multi-target monster chooses one saved position and separately attacks two figures through reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Archer',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  for(let i=2;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'multi-archer',name:'Ash Archer',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.traps=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Archer':{name:'Double Target',initiative:20,abilities:[
    {type:'move',value:2},{type:'attack',value:2,range:3,targets:2}
  ]}};
  s.modifiers.monsters.draw=[0,0,0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue.owner).toBe('monster');
 const hits=st.combatQueue.events.filter(e=>e.type==='monsterAttack');
 expect(hits).toHaveLength(2);
 expect(new Set(hits.map(e=>e.targetId)).size).toBe(2);
 expect(hits.map(e=>e.targetId)).toContain(st.monsterTurnPlans['multi-archer'].targetId);
 expect(st.combatQueue.index).toBe(4);
 const firstHit=st.pendingDamage.heroIndex,draws=st.modifiers.monsters.discard.length;
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue.index).toBe(5);
 expect(st.modifiers.monsters.discard.length).toBe(draws+1);
 expect(st.pendingDamage.heroIndex).not.toBe(firstHit);
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue).toBeNull();
 expect(st.pendingDamage).toBeNull();
 expect(st.monsterTurnPlans['multi-archer']).toBeUndefined();
 expect(st.journal.filter(line=>line.includes(' attacks '))).toHaveLength(2);
 expect(errors).toEqual([]);
});
