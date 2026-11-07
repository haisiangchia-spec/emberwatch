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
 const linked=st.combatQueue.events.filter(e=>e.type==='heroAttackLinked');
 expect(linked.map(e=>e.step.type)).toEqual(['condition','push']);
 expect(st.combatQueue?.index).toBe(
   st.combatQueue.events.findIndex(e=>e.type==='heroAttackPostHit'));
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
 const firstAttackIndex=st.combatQueue.events.findIndex(e=>e.type==='monsterAttack');
 expect(st.combatQueue.index).toBe(firstAttackIndex+1);
 const firstHit=st.pendingDamage.heroIndex,draws=st.modifiers.monsters.discard.length;
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue.index).toBe(firstAttackIndex+2);
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

test('monster killed by first target retaliation cannot continue multi-target attack',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Archer',initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  for(let i=2;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.players[0].active=[{type:'retaliate',value:99,range:6,duration:'round'}];
  s.players[1].active=[{type:'retaliate',value:99,range:6,duration:'round'}];
  s.enemies=[{id:'doomed-multi',name:'Ash Archer',hp:4,maxHp:4,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.traps=[];s.scenario.revealed=[0,1,2];
  s.monsterReveals={'Ash Archer':{name:'Interrupted Volley',initiative:20,abilities:[
    {type:'move',value:2},{type:'attack',value:2,range:3,targets:2}
  ]}};
  s.modifiers.monsters.draw=[0,0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([0,1]).toContain(st.pendingDamage.heroIndex);
 const used=st.modifiers.monsters.discard.length;
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='doomed-multi')).toBeUndefined();
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.modifiers.monsters.discard.length).toBe(used);
 expect(st.journal.filter(x=>x.includes(' attacks '))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('pushing a monster onto a trap applies scenario damage and removes the trap',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.modifiers.heroes[0].draw=[0];
  s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'trapped',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{}}];
  s.traps=[[2,4]];s.hazardous=[];s.scenario.level=3;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 const before=st.enemies[0].hp;
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(before-5);
 expect(st.traps).toEqual([]);
 expect(st.journal.filter(x=>x.includes('triggers trap'))).toHaveLength(1);
 await page.reload();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.traps).toEqual([]);
 expect(st.enemies[0].hp).toBe(before-5);
 expect(errors).toEqual([]);
});

test('pushing a monster onto hazardous terrain damages without removing terrain',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.modifiers.heroes[0].draw=[0];
  s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'hazard-test',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{}}];
  s.traps=[];s.hazardous=[[2,4]];s.scenario.level=3;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 const before=st.enemies[0].hp;
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(before-2);
 expect(st.hazardous).toEqual([[2,4]]);
 expect(st.journal.filter(x=>x.includes('triggers hazardous'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('monster entering a mandatory trap mid-path dies and cannot make its queued attack',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;s.scenario={kind:'vault',revealed:[0,1,2],level:3,seal:false,exitReached:false};
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[0].q=4;s.players[0].r=3;
  for(let i=1;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'terrain-victim',name:'Ash Raider',hp:3,maxHp:3,q:1,r:3,conditions:{}}];
  const open=new Set(['1,3','2,3','3,3','4,3']);
  s.walls=[];for(let q=0;q<8;q++)for(let r=0;r<6;r++)if(!open.has(q+','+r))s.walls.push([q,r]);
  s.rocks=[];s.difficult=[];s.traps=[[2,3]];s.hazardous=[];
  s.monsterReveals={'Ash Raider':{name:'Corridor Lunge',initiative:20,abilities:[
    {type:'move',value:2},{type:'attack',value:2,range:1}
  ]}};
  s.modifiers.monsters.draw=[0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='terrain-victim')).toBeUndefined();
 expect(st.traps).toEqual([]);
 expect(st.journal.filter(x=>x.includes('triggers trap'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks '))).toHaveLength(0);
 expect(st.modifiers.monsters.discard).toHaveLength(0);
 expect(st.loot).toContainEqual([2,3]);
 expect(errors).toEqual([]);
});

test('hero move stops at intervening trap for damage choice and resumes route after reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:26}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.traps=[[1,4]];s.hazardous=[];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];s.scenario.level=2;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].q).toBe(1);
 expect(st.players[0].r).toBe(4);
 expect(st.players[0].hp).toBe(st.players[0].maxHp);
 expect(st.traps).toEqual([]);
 expect(st.combatQueue.paused).toBe(true);
 expect(st.combatQueue.index).toBe(1);
 expect(st.pendingDamage.amount).toBe(4);
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([2,4]);
 expect(st.players[0].hp).toBe(st.players[0].maxHp-4);
 expect(st.combatQueue).toBeNull();
 expect(st.pendingDamage).toBeNull();
 expect(st.journal.filter(x=>x.includes('enters trap'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('hero can lose a hand card to prevent intermediate trap damage and still complete movement',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:26}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.traps=[[1,4]];s.hazardous=[];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];s.scenario.level=3;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 await page.locator('#damageChoice input[data-pool="hand"][value="1"]').check();
 await page.locator('#loseHand').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([2,4]);
 expect(st.players[0].hp).toBe(st.players[0].maxHp);
 expect(st.players[0].lost).toContain(1);
 expect(st.combatQueue).toBeNull();
 expect(st.traps).toEqual([]);
 expect(st.journal.filter(x=>x.includes('enters trap'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('jumping across trap ignores intermediate terrain but landing on hazardous hex triggers damage',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:1,initiative:16}];s.turnIndex=0;
  s.players[1].picked=[0,2];s.traps=[[2,4]];s.hazardous=[[3,4]];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];s.scenario.level=3;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="3"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[1].q,st.players[1].r]).toEqual([3,4]);
 expect(st.traps).toEqual([[2,4]]);
 expect(st.hazardous).toEqual([[3,4]]);
 expect(st.pendingDamage.amount).toBe(2);
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue).toBeNull();
 expect(st.players[1].hp).toBe(st.players[1].maxHp-2);
 expect(errors).toEqual([]);
});

test('hero resolves each hazardous hex separately with reload between damage prompts',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:26}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.traps=[];s.hazardous=[[1,4],[2,4]];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];s.scenario.level=3;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue.index).toBe(1);
 expect(st.pendingDamage.amount).toBe(2);
 expect([st.players[0].q,st.players[0].r]).toEqual([1,4]);
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue.index).toBe(2);
 expect(st.pendingDamage.amount).toBe(2);
 expect([st.players[0].q,st.players[0].r]).toEqual([2,4]);
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(st.players[0].maxHp-4);
 expect(st.hazardous).toEqual([[1,4],[2,4]]);
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.journal.filter(x=>x.includes('enters hazardous'))).toHaveLength(2);
 expect(errors).toEqual([]);
});

test('lethal hero terrain damage cancels remaining queued movement and advances the turn',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:26},{type:'player',id:1,initiative:40}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.players[0].hp=2;s.players[1].picked=[0,1];
  s.traps=[[1,4]];s.hazardous=[];s.walls=[];s.rocks=[];s.difficult=[];
  s.scenario.revealed=[0,1,2];s.scenario.level=3;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 await page.reload();
 await page.locator('#takeDamage').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(0);
 expect(st.players[0].exhausted).toBe(true);
 expect([st.players[0].q,st.players[0].r]).toEqual([1,4]);
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.turnIndex).toBe(1);
 expect(st.journal.filter(x=>x.includes('enters trap'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('flying hero ignores hazardous and trap damage even on the destination hex',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:2,initiative:21}];s.turnIndex=0;
  s.players[2].picked=[0,2];s.traps=[[2,5]];s.hazardous=[[2,5]];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];s.scenario.level=3;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="2"][data-r="5"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect([st.players[2].q,st.players[2].r]).toEqual([2,5]);
 expect(st.players[2].hp).toBe(st.players[2].maxHp);
 expect(st.traps).toEqual([[2,5]]);
 expect(st.hazardous).toEqual([[2,5]]);
 expect(errors).toEqual([]);
});

test('hero entering chained ice slides for free past last icy hex',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:20}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.players[1].q=7;s.players[1].r=5;
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.icy=[[1,4],[2,4],[3,4]];s.traps=[];s.hazardous=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([4,4]);
 expect(st.pendingDamage).toBeNull();
 expect(st.combatQueue).toBeNull();
 expect(st.icy).toEqual([[1,4],[2,4],[3,4]]);
 expect(errors).toEqual([]);
});

test('ice stops sliding at blocked next hex',async ({page})=>{
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:20}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.players[1].q=7;s.players[1].r=5;
  s.walls=[];s.rocks=[[2,4]];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.icy=[[1,4]];s.traps=[];s.hazardous=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([1,4]);
 expect(st.combatQueue).toBeNull();
});

test('hero ice slide into hazardous terrain pauses once and resumes after reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:20}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.players[1].q=7;s.players[1].r=5;
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];s.scenario.level=3;
  s.icy=[[1,4],[2,4]];s.traps=[];s.hazardous=[[3,4]];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([3,4]);
 expect(st.pendingDamage.amount).toBe(2);
 expect(st.combatQueue?.paused).toBe(true);
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(st.players[0].maxHp-2);
 expect(st.combatQueue).toBeNull();
 expect(st.journal.filter(x=>x.includes('enters hazardous'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('forced Push into chained ice automatically completes all sliding hexes',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.modifiers.heroes[0].draw=[0];
  s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'ice-pushed',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.scenario.revealed=[0,1,2];
  s.icy=[[2,4],[3,4]];s.traps=[];s.hazardous=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([4,4]);
 expect(st.journal.filter(x=>x.includes(' slides to '))).toHaveLength(2);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('monster chains free icy movement to reach a hero and attacks only once after reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;s.scenario={kind:'vault',revealed:[0,1,2],level:1,seal:false,exitReached:false};
  s.order=[{type:'player',id:0,initiative:10},{type:'enemy',id:'Ash Raider',initiative:20}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[0].q=5;s.players[0].r=3;
  for(let i=1;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'ice-runner',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  const open=new Set(['1,3','2,3','3,3','4,3','5,3']);
  s.walls=[];for(let q=0;q<8;q++)for(let r=0;r<6;r++)if(!open.has(q+','+r))s.walls.push([q,r]);
  s.rocks=[];s.difficult=[];s.traps=[];s.hazardous=[];s.icy=[[2,3],[3,3]];
  s.monsterReveals={'Ash Raider':{name:'Ice Advance',initiative:20,abilities:[
    {type:'move',value:1},{type:'attack',value:2,range:1}
  ]}};
  s.modifiers.monsters.draw=[0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r],st.journal.slice(-12).join(' | ')).toEqual([4,3]);
 expect(st.monsterTurnPlans['ice-runner'].spent).toBeUndefined();
 expect(st.monsterTurnPlans['ice-runner'].stop).toEqual({q:4,r:3});
 expect(st.monsterTurnPlans['ice-runner'].path.slice(1)).toEqual([
   {q:2,r:3},{q:3,r:3,slide:true},{q:4,r:3,slide:true}
 ]);
 expect(st.combatQueue?.paused).toBe(true);
 expect(st.modifiers.monsters.discard).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' slides to '))).toHaveLength(2);
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.combatQueue).toBeNull();
 expect(st.journal.filter(x=>x.includes(' attacks '))).toHaveLength(1);
 expect(st.modifiers.monsters.discard).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('ice-aware focus prefers farther hero reachable with fewer paid movement points',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.scenario={kind:'vault',revealed:[0,1,2],level:1,seal:false,exitReached:false};
  s.order=[{type:'player',id:0,initiative:10},{type:'player',id:1,initiative:11},
    {type:'enemy',id:'Ash Raider',initiative:20}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.players[0].q=5;s.players[0].r=3;
  s.players[1].q=1;s.players[1].r=0;
  for(let i=2;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'ice-focus',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  const open=new Set(['1,3','2,3','3,3','4,3','5,3','1,2','1,1','1,0']);
  s.walls=[];for(let q=0;q<8;q++)for(let r=0;r<6;r++)
    if(!open.has(q+','+r))s.walls.push([q,r]);
  s.rocks=[];s.difficult=[];s.traps=[];s.hazardous=[];s.icy=[[2,3],[3,3]];
  s.monsterReveals={'Ash Raider':{name:'Ice Focus',initiative:20,abilities:[
    {type:'move',value:1},{type:'attack',value:2,range:1}
  ]}};
  s.modifiers.monsters.draw=[0,0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await page.locator('#endTurn').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 const plan=st.monsterTurnPlans['ice-focus'];
 expect(plan.targetId).toBe(st.players[0].id);
 expect(plan.stop).toEqual({q:4,r:3});
 expect(plan.path.filter(p=>p.slide)).toHaveLength(2);
 expect(st.pendingDamage.heroIndex).toBe(0);
 expect(st.journal.filter(x=>x.includes(' slides to '))).toHaveLength(2);
 expect(errors).toEqual([]);
});

test('monster focus counts negative terrain crossed during free icy slide',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.round=2;
  s.scenario={kind:'vault',revealed:[0,1,2],level:1,seal:false,exitReached:false};
  s.order=[{type:'player',id:0,initiative:10},{type:'player',id:1,initiative:11},
    {type:'enemy',id:'Ash Raider',initiative:20}];
  s.turnIndex=0;s.players[0].picked=[0,1];s.players[1].picked=[0,1];
  s.players[0].q=5;s.players[0].r=3;
  s.players[1].q=1;s.players[1].r=0;
  for(let i=2;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'hazard-focus',name:'Ash Raider',hp:8,maxHp:8,q:1,r:3,conditions:{}}];
  const open=new Set(['1,3','2,3','3,3','4,3','5,3','1,2','1,1','1,0']);
  s.walls=[];for(let q=0;q<8;q++)for(let r=0;r<6;r++)
    if(!open.has(q+','+r))s.walls.push([q,r]);
  s.rocks=[];s.difficult=[];s.traps=[[3,3]];s.hazardous=[];s.icy=[[2,3],[3,3]];
  s.monsterReveals={'Ash Raider':{name:'Hazard-Aware Ice Focus',initiative:20,abilities:[
    {type:'move',value:1},{type:'attack',value:2,range:1}
  ]}};
  s.modifiers.monsters.draw=[0,0,0];s.modifiers.monsters.discard=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#endTurn').click();
 await page.locator('#endTurn').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.journal.some(line=>line.includes(' focuses '+st.players[1].name))).toBe(true);
 expect(st.journal.some(line=>line.includes(' focuses '+st.players[0].name))).toBe(false);
 expect(st.traps).toEqual([[3,3]]);
 expect(st.enemies[0].hp).toBe(8);
 expect(st.modifiers.monsters.discard).toHaveLength(0);
 expect(errors).toEqual([]);
});

test('hero queued route stops safely if an enemy occupies its next hex after reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:20},{type:'player',id:1,initiative:30}];
  s.turnIndex=0;s.players[0].picked=[0,3];
  s.players[0].q=1;s.players[0].r=4;
  s.enemies=[{id:'new-blocker',name:'Ash Raider',hp:9,maxHp:9,q:2,r:4,conditions:{}}];
  s.walls=[];s.rocks=[];s.traps=[];s.hazardous=[];
  s.combatQueue={version:1,owner:'hero',index:1,paused:true,pauseReason:'terrainDamage',
   events:[
     {type:'heroMoveStep',actorId:'p0',hex:{q:1,r:4},movementMode:'walk',finalStep:false},
     {type:'heroMoveStep',actorId:'p0',hex:{q:2,r:4},movementMode:'walk',finalStep:false},
     {type:'heroMoveStep',actorId:'p0',hex:{q:3,r:4},movementMode:'walk',finalStep:true},
     {type:'heroActionComplete',actorId:'p0',action:{
       kind:'move',which:'bottom',cardIndex:0,asBasic:true,value:3}}
   ]};
  s.pendingDamage={heroIndex:0,amount:1,source:'Terrain',condition:null,
    resume:'queue',monsterType:null,sourceId:null,attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([1,4]);
 expect(st.enemies[0].id).toBe('new-blocker');
 expect(st.combatQueue).toBeNull();
 expect(st.pendingDamage).toBeNull();
 expect(st.turnIndex).toBe(0);
 expect(st.journal.some(x=>x.includes('planned hex is no longer accessible'))).toBe(true);
 expect(errors).toEqual([]);
});

test('monster reroutes an old planned icy chain when a slide hex becomes blocked',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'enemy',id:'Ash Raider',initiative:20},
    {type:'player',id:0,initiative:30}];s.turnIndex=0;
  s.players[0].q=5;s.players[0].r=3;
  for(let i=1;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.scenario.revealed=[0,1,2];
  s.enemies=[{id:'blocked-ice',name:'Ash Raider',hp:9,maxHp:9,q:1,r:3,conditions:{}}];
  s.walls=[];s.rocks=[[3,3]];s.icy=[[2,3],[3,3]];s.traps=[];s.hazardous=[];s.difficult=[];
  s.monsterTurnPlans={'blocked-ice':{skip:false,targetId:'p0',stop:{q:4,r:3},
    focused:true,spec:{move:1,attack:2,range:1},
    path:[{q:1,r:3},{q:2,r:3},{q:3,r:3,slide:true},{q:4,r:3,slide:true}]}};
  s.monsterReveals={'Ash Raider':{name:'Blocked Ice',initiative:20,abilities:[
    {type:'move',value:1},{type:'attack',value:2,range:1}]}};
  s.modifiers.monsters.draw=[0,0,0];s.modifiers.monsters.discard=[];
  s.combatQueue={version:1,owner:'monster',index:2,paused:true,pauseReason:'damage',
   events:[
    {type:'monsterStart',actorId:'blocked-ice',monsterType:'Ash Raider'},
    {type:'monsterFocus',actorId:'blocked-ice',monsterType:'Ash Raider'},
    {type:'monsterMove',actorId:'blocked-ice',monsterType:'Ash Raider',stepIndex:0,
      step:{type:'move',value:1}},
    {type:'monsterAttack',actorId:'blocked-ice',monsterType:'Ash Raider',stepIndex:1,
      step:{type:'attack',value:2,range:1}},
    {type:'monsterFinish',actorId:'blocked-ice',monsterType:'Ash Raider'}]};
  s.pendingDamage={heroIndex:0,amount:1,source:'Prior attack',condition:null,
    resume:'queue',monsterType:null,sourceId:null,attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).not.toEqual([3,3]);
 expect(st.enemies[0].id).toBe('blocked-ice');
 expect(st.modifiers.monsters.discard).toHaveLength(0);
 expect(st.journal.some(x=>x.includes('reroutes toward its original focus'))).toBe(true);
 expect(st.journal.filter(x=>x.includes(' attacks '))).toHaveLength(0);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('saved hero ice slide stops if its supporting ice is removed before resumption',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:20}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.players[0].q=1;s.players[0].r=4;
  s.icy=[];s.traps=[];s.hazardous=[];s.walls=[];s.rocks=[];
  s.combatQueue={version:1,owner:'hero',index:1,paused:true,pauseReason:'terrainDamage',
   events:[
    {type:'heroMoveStep',actorId:'p0',hex:{q:1,r:4},movementMode:'walk',finalStep:false},
    {type:'heroMoveStep',actorId:'p0',hex:{q:2,r:4},movementMode:'walk',icyExtra:true,finalStep:false},
    {type:'heroMoveStep',actorId:'p0',hex:{q:3,r:4},movementMode:'walk',icyExtra:true,finalStep:true},
    {type:'heroActionComplete',actorId:'p0',action:{
      kind:'move',which:'bottom',cardIndex:0,asBasic:true,value:3}}
   ]};
  s.pendingDamage={heroIndex:0,amount:1,source:'Terrain',condition:null,
    resume:'queue',monsterType:null,sourceId:null,attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([1,4]);
 expect(st.combatQueue).toBeNull();
 expect(st.journal.some(x=>x.includes('planned hex is no longer accessible'))).toBe(true);
 expect(errors).toEqual([]);
});

test('monster may cross an allied figure on ordinary steps but not end on one',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'enemy',id:'Ash Raider',initiative:20},
    {type:'player',id:0,initiative:30}];s.turnIndex=0;
  s.players[0].q=5;s.players[0].r=3;
  for(let i=1;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.scenario.revealed=[0,1,2];
  s.enemies=[
    {id:'moving-ally',name:'Ash Raider',hp:9,maxHp:9,q:1,r:3,conditions:{}},
    {id:'stationary-ally',name:'Ash Raider',hp:9,maxHp:9,q:2,r:3,conditions:{}}
  ];
  s.walls=[];s.rocks=[];s.icy=[];s.traps=[];s.hazardous=[];s.difficult=[];
  s.monsterTurnPlans={'moving-ally':{skip:false,targetId:'p0',stop:{q:3,r:3},
    focused:true,spec:{move:2,attack:2,range:1},
    path:[{q:1,r:3},{q:2,r:3},{q:3,r:3}]}};
  s.monsterReveals={'Ash Raider':{name:'Ally Passing',initiative:20,abilities:[
    {type:'move',value:2},{type:'attack',value:2,range:1}]}};
  s.modifiers.monsters.draw=[0,0,0];s.modifiers.monsters.discard=[];
  s.combatQueue={version:1,owner:'monster',index:2,paused:true,pauseReason:'damage',
   events:[
    {type:'monsterStart',actorId:'moving-ally',monsterType:'Ash Raider'},
    {type:'monsterFocus',actorId:'moving-ally',monsterType:'Ash Raider'},
    {type:'monsterMove',actorId:'moving-ally',monsterType:'Ash Raider',stepIndex:0,step:{type:'move',value:2}},
    {type:'monsterAttack',actorId:'moving-ally',monsterType:'Ash Raider',stepIndex:1,step:{type:'attack',value:2,range:1}},
    {type:'monsterFinish',actorId:'moving-ally',monsterType:'Ash Raider'}]};
  s.pendingDamage={heroIndex:0,amount:1,source:'Prior attack',condition:null,
    resume:'queue',monsterType:null,sourceId:null,attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies.find(e=>e.id==='moving-ally').q,st.enemies.find(e=>e.id==='moving-ally').r]).toEqual([3,3]);
 expect([st.enemies.find(e=>e.id==='stationary-ally').q,st.enemies.find(e=>e.id==='stationary-ally').r]).toEqual([2,3]);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('hero reroutes after interrupted damage without replaying a consumed trap',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:20}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.players[0].q=1;s.players[0].r=3;
  for(let i=1;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.scenario.revealed=[0,1,2];s.traps=[];s.hazardous=[];
  s.walls=[];s.rocks=[[2,3]];s.difficult=[];s.icy=[];s.enemies=[];
  s.combatQueue={version:1,owner:'hero',index:1,paused:true,pauseReason:'terrainDamage',
   events:[
    {type:'heroMoveStep',actorId:'p0',hex:{q:1,r:3},
     paidCost:1,movementMode:'walk',destination:{q:3,r:3},finalStep:false},
    {type:'heroMoveStep',actorId:'p0',hex:{q:2,r:3},
     movementMode:'walk',destination:{q:3,r:3},finalStep:false},
    {type:'heroMoveStep',actorId:'p0',hex:{q:3,r:3},
     movementMode:'walk',destination:{q:3,r:3},finalStep:true},
    {type:'heroActionComplete',actorId:'p0',action:{
      kind:'move',which:'bottom',cardIndex:0,asBasic:true,value:4}}
   ]};
  s.pendingDamage={heroIndex:0,amount:1,source:'Terrain',condition:null,
    resume:'queue',monsterType:null,sourceId:null,attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([3,3]);
 expect(st.journal.filter(x=>x.includes('reroutes with 3 movement points'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('enters trap'))).toHaveLength(0);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('monster movement resumes from a saved hex checkpoint without replaying terrain',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'enemy',id:'Ash Raider',initiative:20},
   {type:'player',id:0,initiative:30}];s.turnIndex=0;
  s.scenario.revealed=[0,1,2];s.scenario.level=2;
  s.players[0].q=5;s.players[0].r=3;
  for(let i=1;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'checkpoint',name:'Ash Raider',hp:8,maxHp:8,q:2,r:3,conditions:{}}];
  s.walls=[];s.rocks=[];s.difficult=[];s.icy=[];s.hazardous=[];s.traps=[];
  s.monsterTurnPlans={checkpoint:{skip:false,targetId:'p0',focused:true,
   stop:{q:4,r:3},goal:{q:4,r:3},spec:{move:3,attack:2,range:1},
   path:[{q:1,r:3},{q:2,r:3},{q:3,r:3},{q:4,r:3}]}};
  s.monsterReveals={'Ash Raider':{name:'Checkpoint',initiative:20,
    abilities:[{type:'move',value:3},{type:'attack',value:2,range:1}]}};
  s.modifiers.monsters.draw=[0,0,0];s.modifiers.monsters.discard=[];
  s.combatQueue={version:1,owner:'monster',index:2,paused:true,pauseReason:'damage',
    events:[
     {type:'monsterMove',actorId:'checkpoint',monsterType:'Ash Raider'},
     {type:'monsterMoveHex',actorId:'checkpoint',hex:{q:2,r:3},
       budget:3,spent:0,reroutes:0},
     {type:'monsterMoveHex',actorId:'checkpoint',hex:{q:3,r:3},
       budget:3,spent:1,reroutes:0},
     {type:'monsterMoveHex',actorId:'checkpoint',hex:{q:4,r:3},
       budget:3,spent:2,reroutes:0},
     {type:'monsterAttack',actorId:'checkpoint',monsterType:'Ash Raider',
       stepIndex:1,step:{type:'attack',value:2,range:1}},
     {type:'monsterFinish',actorId:'checkpoint',monsterType:'Ash Raider'}]};
  s.pendingDamage={heroIndex:0,amount:1,source:'Prior event',condition:null,
    resume:'queue',monsterType:null,sourceId:null,attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([4,3]);
 expect(st.traps).toEqual([]);
 expect(st.modifiers.monsters.discard).toHaveLength(1);
 expect(st.combatQueue.paused).toBe(true);
 expect(st.combatQueue.pauseReason).toBe('damage');
 await page.reload();
 await page.locator('#takeDamage').click();
 const done=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(done.combatQueue).toBeNull();
 expect(done.modifiers.monsters.discard).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('monster hex checkpoint reroutes around newly blocked step with unspent budget',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'enemy',id:'Ash Raider',initiative:20},
   {type:'player',id:0,initiative:30}];s.turnIndex=0;
  s.scenario.revealed=[0,1,2];
  s.players[0].q=5;s.players[0].r=3;
  for(let i=1;i<4;i++){s.players[i].hp=0;s.players[i].exhausted=true}
  s.enemies=[{id:'reroute-hex',name:'Ash Raider',hp:9,maxHp:9,q:2,r:3,conditions:{}}];
  s.walls=[];s.rocks=[[3,3]];s.difficult=[];s.icy=[];s.hazardous=[];s.traps=[];
  s.monsterTurnPlans={'reroute-hex':{skip:false,targetId:'p0',focused:true,
    stop:{q:4,r:3},goal:{q:4,r:3},spec:{move:4,attack:2,range:1},
    path:[{q:1,r:3},{q:2,r:3},{q:3,r:3},{q:4,r:3}]}};
  s.monsterReveals={'Ash Raider':{name:'Reroute',initiative:20,
   abilities:[{type:'move',value:4},{type:'attack',value:2,range:1}]}};
  s.modifiers.monsters.draw=[0,0,0];s.modifiers.monsters.discard=[];
  s.combatQueue={version:1,owner:'monster',index:2,paused:true,pauseReason:'damage',
   events:[
    {type:'monsterMove',actorId:'reroute-hex',monsterType:'Ash Raider'},
    {type:'monsterMoveHex',actorId:'reroute-hex',hex:{q:2,r:3},budget:4,spent:0,reroutes:0},
    {type:'monsterMoveHex',actorId:'reroute-hex',hex:{q:3,r:3},budget:4,spent:1,reroutes:0},
    {type:'monsterMoveHex',actorId:'reroute-hex',hex:{q:4,r:3},budget:4,spent:2,reroutes:0},
    {type:'monsterAttack',actorId:'reroute-hex',monsterType:'Ash Raider',
     stepIndex:1,step:{type:'attack',value:2,range:1}},
    {type:'monsterFinish',actorId:'reroute-hex',monsterType:'Ash Raider'}]};
  s.pendingDamage={heroIndex:0,amount:1,source:'Prior event',condition:null,
    resume:'queue',monsterType:null,sourceId:null,attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).not.toEqual([3,3]);
 expect(st.journal.some(x=>x.includes('reroutes toward its original focus'))).toBe(true);
 expect(st.combatQueue.paused).toBe(true);
 expect(st.combatQueue.pauseReason).toBe('damage');
 await page.reload();
 await page.locator('#takeDamage').click();
 const done=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(done.combatQueue).toBeNull();
 expect(done.modifiers.monsters.discard).toHaveLength(1);
 expect(errors).toEqual([]);
});


test('shared F2 healing caps a queued monster effect after reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
   const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
   s.phase='damage';s.order=[{type:'enemy',id:'Ash Raider',initiative:20}];
   s.turnIndex=0;
   s.enemies=[{id:'healing-test',name:'Ash Raider',hp:5,maxHp:9,q:2,r:3,conditions:{}}];
   s.monsterTurnPlans={'healing-test':{skip:false,targetId:null,focused:true}};
   s.monsterReveals={'Ash Raider':{name:'Recovery',initiative:20,
     abilities:[{type:'heal',value:7}]}};
   s.combatQueue={version:1,owner:'monster',index:0,paused:true,pauseReason:'damage',
     events:[
       {type:'monsterEffect',actorId:'healing-test',monsterType:'Ash Raider',
        stepIndex:0,step:{type:'heal',value:7}},
       {type:'monsterFinish',actorId:'healing-test',monsterType:'Ash Raider'}
     ]};
   s.pendingDamage={heroIndex:0,amount:1,source:'Previous event',
     condition:null,resume:'queue',monsterType:null,sourceId:null,attack:false};
   s.modifiers.monsters.draw=[0,0];s.modifiers.monsters.discard=[];
   localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='healing-test').hp).toBe(9);
 expect(st.journal.filter(x=>x.includes('Ash Raider heals 4 HP'))).toHaveLength(1);
 expect(st.modifiers.monsters.discard).toHaveLength(0);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 ordered hero guard and shield resolve once after interrupted queue reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
   const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
   s.phase='damage';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
   s.players[0].picked=[0,1];s.players[0].guard=2;s.players[0].active=[];
   s.journal.push('R1 · Vanguard gains 2 Guard.');
   s.combatQueue={version:1,owner:'hero',index:1,paused:true,pauseReason:'damage',events:[
     {type:'heroGuard',actorId:'p0',value:2},
     {type:'heroAbilityEffect',actorId:'p0',effect:{type:'shield',value:1,duration:'round'}},
     {type:'heroActionComplete',actorId:'p0',
       action:{kind:'guard',value:2,which:'bottom',cardIndex:1,asBasic:false}}
   ]};
   s.pendingDamage={heroIndex:0,amount:1,source:'Prior event',
     condition:null,resume:'queue',monsterType:null,sourceId:null,attack:false};
   localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].guard).toBe(2);
 expect(st.journal.filter(x=>x.includes('gains 2 Guard'))).toHaveLength(1);
 expect(st.players[0].active.filter(e=>e.type==='shield'&&e.value===1)).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains shield 1'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 live Brace bottom queues guard and shield in order',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
   const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
   s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
   s.players[0].picked=[0,1];s.players[0].guard=0;s.players[0].active=[];
   localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].guard).toBe(2);
 expect(st.players[0].active.filter(e=>e.type==='shield'&&e.value===1)).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains 2 Guard'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains shield 1'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 ordered linked effects persist a null attack roll without granting condition',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.modifiers.heroes[0].draw=['null'];
  s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',hp:99,maxHp:99,q:1,r:4,conditions:{}}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(99);
 expect(st.enemies[0].conditions.disarm).toBeUndefined();
 const linked=st.combatQueue.events.filter(e=>e.type==='heroAttackLinked');
 expect(linked.map(e=>e.step.type)).toEqual(['condition','push']);
 expect(linked.map(e=>e.miss)).toEqual([true,true]);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 await page.reload();
 await page.locator('#cancelTarget').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(99);
 expect(st.enemies[0].conditions.disarm).toBeUndefined();
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 live optional Shield executes after reload without replaying Guard',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:72}];s.turnIndex=0;
  s.players[0].picked=[0,4];s.players[0].guard=0;s.players[0].active=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].guard).toBe(3);
 expect(st.players[0].active).toHaveLength(0);
 expect(st.combatQueue.pauseReason).toBe('optionalAbility');
 expect(st.pendingAbilityChoice.queueIndex).toBe(1);
 expect(st.combatQueue.index).toBe(2);
 await page.reload();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].guard).toBe(3);
 expect(st.players[0].active.filter(x=>x.type==='shield'&&x.value===1)).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains 3 Guard'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains shield 1'))).toHaveLength(1);
 expect(st.pendingAbilityChoice??null).toBeNull();
 expect(st.combatQueue).toBeNull();
 await page.reload();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(saved.players[0].active.filter(x=>x.type==='shield')).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('F2 live optional Shield can be skipped after reload without replaying Guard',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:72}];s.turnIndex=0;
  s.players[0].picked=[0,4];s.players[0].guard=0;s.players[0].active=[];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 await page.reload();
 await page.locator('#skipAbility').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].guard).toBe(3);
 expect(st.players[0].active).toHaveLength(0);
 expect(st.journal.filter(x=>x.includes('gains 3 Guard'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('skips optional shield'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(st.pendingAbilityChoice??null).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 optional allied Heal target survives reload and resolves after Guard exactly once',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:3,initiative:63}];s.turnIndex=0;
  s.players[3].picked=[0,1];s.players[3].guard=0;s.players[3].active=[];
  s.players[2].hp=5;s.players[2].conditions={poison:true,wound:true};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 await expect(page.locator('#executeAbility')).toBeDisabled();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[3].guard).toBe(2);
 expect(st.players[2].hp).toBe(5);
 expect(st.combatQueue.pauseReason).toBe('optionalAbility');
 await page.locator('[data-optional-target="p2"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.pendingAbilityChoice.targetId).toBe('p2');
 await page.reload();
 await expect(page.locator('#executeAbility')).toBeEnabled();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[3].guard).toBe(2);
 expect(st.players[2].hp).toBe(7);
 expect(st.players[2].conditions.poison).toBeUndefined();
 expect(st.players[2].conditions.wound).toBeUndefined();
 expect(st.journal.filter(x=>x.includes('gains 2 Guard'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('restores 2 HP'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(st.pendingAbilityChoice??null).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 optional allied Heal skips without target or duplicate effects after reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:3,initiative:63}];s.turnIndex=0;
  s.players[3].picked=[0,1];s.players[3].guard=0;
  s.players[2].hp=5;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.reload();
 await page.locator('#skipAbility').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[3].guard).toBe(2);
 expect(st.players[2].hp).toBe(5);
 expect(st.journal.filter(x=>x.includes('gains 2 Guard'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('skips optional heal'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(st.pendingAbilityChoice??null).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 ordered optional Condition then Heal survives two decisions across reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:72}];s.turnIndex=0;
  s.players[0].picked=[0,4];s.players[0].guard=3;s.players[0].active=[];
  s.players[2].hp=5;
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:9,maxHp:9,conditions:{}}];
  s.journal.unshift('R1 · Vanguard gains 3 Guard.');
  s.combatQueue={version:1,owner:'hero',index:1,paused:true,pauseReason:'damage',events:[
    {type:'heroGuard',actorId:'p0',value:3},
    {type:'heroAbilityEffect',actorId:'p0',effect:{
      type:'condition',condition:'muddle',range:2,optional:true}},
    {type:'heroAbilityEffect',actorId:'p0',effect:{
      type:'heal',value:2,range:2,optional:true}},
    {type:'heroActionComplete',actorId:'p0',action:{
      kind:'guard',which:'bottom',value:3,cardIndex:4,asBasic:false}}
  ]};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
    condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('muddle');
 await expect(page.locator('#executeAbility')).toBeDisabled();
 await page.locator('[data-optional-target="e0"]').click();
 await page.reload();
 await expect(page.locator('#executeAbility')).toBeEnabled();
 await page.locator('#executeAbility').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('heal');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].conditions.muddle).toBe(true);
 expect(st.players[2].hp).toBe(5);
 expect(st.players[0].guard).toBe(3);
 await page.reload();
 await page.locator('[data-optional-target="p2"]').click();
 await page.reload();
 await page.locator('#skipAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].conditions.muddle).toBe(true);
 expect(st.players[2].hp).toBe(5);
 expect(st.players[0].guard).toBe(3);
 expect(st.journal.filter(x=>x.includes('gains 3 Guard'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains muddle'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('skips optional heal'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(st.pendingAbilityChoice??null).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 optional condition revalidates enemy target after reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:72}];s.turnIndex=0;
  s.players[0].picked=[0,4];s.players[0].guard=3;
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:9,maxHp:9,conditions:{}}];
  s.combatQueue={version:1,owner:'hero',index:2,paused:true,
    pauseReason:'optionalAbility',events:[
     {type:'heroGuard',actorId:'p0',value:3},
     {type:'heroAbilityEffect',actorId:'p0',effect:{
       type:'condition',condition:'muddle',range:2,optional:true}},
     {type:'heroActionComplete',actorId:'p0',action:{
       kind:'guard',which:'bottom',value:3,cardIndex:4,asBasic:false}}
    ]};
  s.pendingAbilityChoice={actorId:'p0',queueIndex:1,targetId:'e0',
    effect:{type:'condition',condition:'muddle',range:2,optional:true}};
  s.enemies[0].q=7;s.enemies[0].r=5;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 await expect(page.locator('#executeAbility')).toBeDisabled();
 await page.locator('#skipAbility').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].conditions.muddle).toBeUndefined();
 expect(st.combatQueue).toBeNull();
 expect(st.players[0].guard).toBe(3);
 expect(errors).toEqual([]);
});


test('F2 structured Warden card compiles to persisted Guard then optional Heal',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:3,initiative:63}];s.turnIndex=0;
  s.players[3].picked=[0,1];s.players[3].guard=0;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(snapshot.combatQueue.events.map(e=>e.type)).toEqual([
   'heroGuard','heroAbilityEffect','heroActionComplete']);
 expect(snapshot.combatQueue.events[0].value).toBe(2);
 expect(snapshot.combatQueue.events[1].effect).toMatchObject({
   type:'heal',value:2,range:2,optional:true});
 expect(snapshot.combatQueue.index).toBe(2);
 await page.reload();
 await page.locator('#skipAbility').click();
 const finished=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(finished.players[3].guard).toBe(2);
 expect(finished.journal.filter(x=>x.includes('gains 2 Guard'))).toHaveLength(1);
 expect(finished.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 mandatory Heal uses compiled selected target and applies cleansing once',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:3,initiative:63}];s.turnIndex=0;
  s.players[3].picked=[1,0];s.players[0].hp=6;
  s.players[0].conditions={poison:true,wound:true};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="0"][data-r="4"]').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(9);
 expect(st.players[0].conditions.poison).toBeUndefined();
 expect(st.players[0].conditions.wound).toBeUndefined();
 expect(st.elements.light).toBe(2);
 expect(st.journal.filter(x=>x.includes('restores 3 HP'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 compiled Heal checkpoint reload does not duplicate prior effect',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:3,initiative:63}];s.turnIndex=0;
  s.players[3].picked=[1,0];s.players[0].hp=6;
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events:[
    {type:'heroAbilityEffect',actorId:'p3',
      effect:{type:'heal',value:3,range:2},targetId:'p0'},
    {type:'heroActionComplete',actorId:'p3',
      action:{kind:'heal',value:3,range:2,which:'top',
        cardIndex:1,asBasic:false,infuse:'light'}}
   ]};
  s.pendingDamage={heroIndex:3,amount:1,source:'Earlier effect',
    condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(9);
 expect(st.elements.light).toBe(2);
 expect(st.combatQueue).toBeNull();
 await page.reload();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(9);
 expect(st.journal.filter(x=>x.includes('restores 3 HP'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('LIGHT infused'))).toHaveLength(1);
 expect(errors).toEqual([]);
});


test('F2 compiled basic hero attack completes with one modifier draw',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
   const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
   s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
   s.players[0].picked=[0,1];
   s.modifiers.heroes[0].draw=[0];s.modifiers.heroes[0].discard=[];
   s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:9,maxHp:9,conditions:{}}];
   localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-basic="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(7);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 await page.reload();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(7);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('F2 compiled linked attack pauses on Push and reload does not redraw',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
   const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
   s.phase='act';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
   s.players[0].picked=[2,1];
   s.modifiers.heroes[0].draw=[0,0];s.modifiers.heroes[0].discard=[];
   s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:12,maxHp:12,conditions:{}}];
   localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(8);
 expect(st.enemies[0].conditions.disarm).toBe(true);
 expect(st.combatQueue.events.map(e=>e.type)).toEqual([
   'heroAttackHit','heroAttackLinked','heroAttackLinked','heroAttackPostHit']);
 expect(st.combatQueue.index).toBe(3);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 await page.reload();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(8);
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([2,4]);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 mixed Guard then mandatory Heal restores target selection after reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:1,initiative:34}];s.turnIndex=0;
  s.players[1].picked=[0,5];s.players[1].guard=0;
  s.players[0].hp=7;s.players[0].conditions={poison:true};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Required target');
 await expect(page.locator('#skipAbility')).toHaveCount(0);
 await expect(page.locator('#executeAbility')).toBeDisabled();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[1].guard).toBe(2);
 expect(st.players[0].hp).toBe(7);
 expect(st.combatQueue.pauseReason).toBe('abilityTarget');
 expect(st.combatQueue.events.map(e=>e.type)).toEqual([
   'heroGuard','heroAbilityEffect','heroActionComplete']);
 expect(st.combatQueue.events[1].needsTarget).toBe(true);
 await page.locator('[data-optional-target="p0"]').click();
 await page.reload();
 await expect(page.locator('#executeAbility')).toBeEnabled();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[1].guard).toBe(2);
 expect(st.players[0].hp).toBe(8);
 expect(st.players[0].conditions.poison).toBeUndefined();
 expect(st.journal.filter(x=>x.includes('gains 2 Guard'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('restores 1 HP'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(st.pendingAbilityChoice??null).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 mandatory target is invalidated after checkpoint reload until another eligible target is selected',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:1,initiative:34}];s.turnIndex=0;
  s.players[1].picked=[0,5];s.players[1].guard=0;
  s.players[0].hp=7;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="bottom"]').click();
 await page.locator('[data-optional-target="p0"]').click();
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.players[0].q=7;s.players[0].r=5;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await expect(page.locator('#executeAbility')).toBeDisabled();
 await expect(page.locator('#skipAbility')).toHaveCount(0);
 await page.locator('[data-optional-target="p1"]').click();
 await page.locator('#executeAbility').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].hp).toBe(7);
 expect(st.players[1].guard).toBe(2);
 expect(st.journal.filter(x=>x.includes('gains 2 Guard'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 live Shield Rush compiles Shield before attack exactly once',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[0].picked=[0,1];s.players[0].active=[];
  s.modifiers.heroes[0].draw=[0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:10,maxHp:10,conditions:{}}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.filter(x=>x.type==='shield'&&x.value===1)).toHaveLength(1);
 expect(st.enemies[0].hp).toBe(7);
 expect(st.enemies[0].conditions.immobilize).toBe(true);
 expect(st.journal.filter(x=>x.includes('gains shield 1'))).toHaveLength(1);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 await page.reload();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.filter(x=>x.type==='shield')).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('F2 mixed Shield then Attack survives retaliation interruption without replay',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:18}];s.turnIndex=0;
  s.players[0].picked=[0,1];s.players[0].active=[];
  s.modifiers.heroes[0].draw=[0,0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:10,maxHp:10,conditions:{},
   active:[{type:'retaliate',value:2,range:1,duration:'round'}]}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.filter(x=>x.type==='shield')).toHaveLength(1);
 expect(st.enemies[0].hp).toBe(7);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(7);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.players[0].active.filter(x=>x.type==='shield')).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains shield 1'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 post-attack Shield optional choice runs only after Hammerfall hit',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:62}];s.turnIndex=0;
  s.players[0].picked=[5,1];s.players[0].active=[];
  s.modifiers.heroes[0].draw=[0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:12,maxHp:12,conditions:{}}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(7);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(0);
 expect(st.combatQueue.pauseReason).toBe('optionalAbility');
 expect(st.combatQueue.events.map(e=>e.type)).toEqual([
  'heroAbilityEffect','heroActionComplete']);
 await page.reload();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(7);
 expect(st.players[0].active.filter(e=>e.type==='shield'&&e.value===1)).toHaveLength(1);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains shield 1'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 retaliation interrupt precedes post-hit Shield choice and resumes once',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='act';s.order=[{type:'player',id:0,initiative:62}];s.turnIndex=0;
  s.players[0].picked=[5,1];s.players[0].active=[];
  s.modifiers.heroes[0].draw=[0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:12,maxHp:12,conditions:{},
   active:[{type:'retaliate',value:2,range:1,duration:'round'}]}];
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('[data-do="top"]').click();
 await page.locator('#board polygon[data-q="1"][data-r="4"]').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(0);
 expect(st.enemies[0].hp).toBe(7);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(0);
 expect(st.combatQueue.pauseReason).toBe('optionalAbility');
 await page.reload();
 await page.locator('#skipAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(0);
 expect(st.enemies[0].hp).toBe(7);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('skips optional shield'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 saved linked Push resolves before post-hit optional Shield',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.players[0].active=[];
  s.modifiers.heroes[0].draw=[0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:12,maxHp:12,conditions:{}}];
  const action={kind:'attack',value:4,range:1,which:'top',cardIndex:2,
    asBasic:false,condition:'disarm',followupType:'push',multiRemaining:1,
    targetIds:[],valid:[{q:1,r:4}]};
  const events=window.EmberwatchAbilities.compileHeroQueue('p0',action,[
    {type:'attack',value:4,range:1},
    {type:'shield',value:1,duration:'round',optional:true}
  ],{targetId:'e0'});
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
    condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#actionUI')).toContainText('push the enemy');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(8);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.players[0].active.filter(x=>x.type==='shield')).toHaveLength(0);
 await page.reload();
 await page.locator('#board polygon[data-q="2"][data-r="4"]').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.enemies[0].q,st.enemies[0].r]).toEqual([2,4]);
 expect(st.players[0].active.filter(x=>x.type==='shield')).toHaveLength(0);
 await page.reload();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(8);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.players[0].active.filter(x=>x.type==='shield')).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains shield 1'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 compiled Move then optional Shield resumes across saved interruption',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:26}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.players[0].active=[];
  s.walls=[];s.rocks=[];s.difficult=[];s.loot=[[0,3]];
  const action={kind:'move',value:4,movementMode:'walk',which:'bottom',
   cardIndex:3,asBasic:false};
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events:window.EmberwatchAbilities.compileHeroQueue('p0',action,[
    {type:'move',value:'action'},
    {type:'shield',value:1,duration:'round',optional:true}
   ],{movePath:[{q:0,r:3}],destination:{q:0,r:3}})};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
   condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([0,3]);
 expect(st.players[0].coins).toBe(1);
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(0);
 expect(st.combatQueue.events.map(e=>e.type)).toEqual([
  'heroMoveStep','heroAbilityEffect','heroActionComplete']);
 expect(st.combatQueue.pauseReason).toBe('optionalAbility');
 await page.reload();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].coins).toBe(1);
 expect(st.players[0].active.filter(e=>e.type==='shield'&&e.value===1)).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('collects a coin'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('gains shield 1'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 compiled post-move Shield skip does not replay movement',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:26}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.players[0].active=[];
  s.walls=[];s.rocks=[];s.difficult=[];
  const action={kind:'move',value:4,movementMode:'walk',which:'bottom',
   cardIndex:3,asBasic:false};
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events:window.EmberwatchAbilities.compileHeroQueue('p0',action,[
    {type:'move',value:'action'},
    {type:'shield',value:1,duration:'round',optional:true}
   ],{movePath:[{q:0,r:3}],destination:{q:0,r:3}})};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
   condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toBeVisible();
 await page.reload();
 await page.locator('#skipAbility').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([0,3]);
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(0);
 expect(st.journal.filter(x=>x.includes('moves to 0,3'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('skips optional shield'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 Move then Attack selects new-position target and survives reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:26}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.walls=[];s.rocks=[];s.difficult=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:0,r:2,hp:10,maxHp:10,conditions:{}}];
  s.modifiers.heroes[0].draw=[0,0];s.modifiers.heroes[0].discard=[];
  const action={kind:'move',value:4,movementMode:'walk',
   which:'bottom',cardIndex:3,asBasic:false};
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events:window.EmberwatchAbilities.compileHeroQueue('p0',action,[
     {type:'move',value:'action'},{type:'attack',value:2,range:1}
   ],{movePath:[{q:0,r:3}],destination:{q:0,r:3}})};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
   condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Required target');
 await expect(page.locator('[data-optional-target="e0"]')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([0,3]);
 expect(st.enemies[0].hp).toBe(10);
 expect(st.combatQueue.events.map(e=>e.type)).toEqual([
  'heroMoveStep','heroAttackTargetChoice']);
 expect(st.combatQueue.index).toBe(2);
 expect(st.modifiers.heroes[0].discard).toHaveLength(0);
 await page.locator('[data-optional-target="e0"]').click();
 await page.reload();
 await expect(page.locator('#executeAbility')).toBeEnabled();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(8);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes('moves to 0,3'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 await page.reload();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(8);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('F2 Move then Attack invalidated target requires reselect or no-target finish',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:26}];s.turnIndex=0;
  s.players[0].picked=[0,3];s.walls=[];s.rocks=[];s.difficult=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:0,r:2,hp:10,maxHp:10,conditions:{}}];
  const action={kind:'move',value:4,movementMode:'walk',which:'bottom',
   cardIndex:3,asBasic:false};
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events:window.EmberwatchAbilities.compileHeroQueue('p0',action,[
     {type:'move',value:'action'},{type:'attack',value:2,range:1}
   ],{movePath:[{q:0,r:3}],destination:{q:0,r:3}})};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
   condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await page.locator('[data-optional-target="e0"]').click();
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.enemies[0].q=7;s.enemies[0].r=5;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await expect(page.locator('#executeAbility')).toBeDisabled();
 await expect(page.locator('#skipAbility')).toHaveText('Finish without attack');
 await page.locator('#skipAbility').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect([st.players[0].q,st.players[0].r]).toEqual([0,3]);
 expect(st.enemies[0].hp).toBe(10);
 expect(st.journal.filter(x=>x.includes('moves to 0,3'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(0);
 expect(st.combatQueue).toBeNull();
 expect(st.pendingAbilityChoice??null).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 repeated attacks resolve distinct targets across retaliation and reload',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.players[0].active=[];
  s.modifiers.heroes[0].draw=[0,0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[
   {id:'e0',name:'Ash Raider',q:1,r:4,hp:12,maxHp:12,conditions:{},
    active:[{type:'retaliate',value:2,range:1,duration:'round'}]},
   {id:'e1',name:'Ember Scout',q:0,r:3,hp:10,maxHp:10,conditions:{}}
  ];
  const action={kind:'attack',value:4,range:1,which:'top',cardIndex:2,
   asBasic:false,multiRemaining:1,targetIds:[],valid:[{q:1,r:4},{q:0,r:3}]};
  const events=window.EmberwatchAbilities.compileHeroQueue('p0',action,[
   {type:'attack',value:4,range:1},{type:'attack',value:2,range:2},
   {type:'shield',value:1,duration:'round',optional:true}
  ],{targetId:'e0'});
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
   condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='e0').hp).toBe(8);
 expect(st.enemies.find(e=>e.id==='e1').hp).toBe(10);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Required target');
 expect(await page.locator('[data-optional-target="e1"]').count()).toBe(1);
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.enemies.find(e=>e.id==='e0').hp).toBe(8);
 await page.locator('[data-optional-target="e1"]').click();
 await page.reload();
 await page.locator('#executeAbility').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Optional ability');
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='e0').hp).toBe(8);
 expect(st.enemies.find(e=>e.id==='e1').hp).toBe(8);
 expect(st.modifiers.heroes[0].discard).toHaveLength(2);
 await page.reload();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.filter(e=>e.type==='shield'&&e.value===1)).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ember Scout'))).toHaveLength(1);
 expect(st.modifiers.heroes[0].discard).toHaveLength(2);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 repeated Attack has no-target finish without redrawing first hit',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];
  s.modifiers.heroes[0].draw=[0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:10,maxHp:10,conditions:{}}];
  const action={kind:'attack',value:4,range:1,which:'top',cardIndex:2,
   asBasic:false,multiRemaining:1,targetIds:[],valid:[{q:1,r:4}]};
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events:window.EmberwatchAbilities.compileHeroQueue('p0',action,[
    {type:'attack',value:4,range:1},{type:'attack',value:2,range:1}
   ],{targetId:'e0'})};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
   condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Required target');
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.enemies[0].q=7;s.enemies[0].r=5;
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await expect(page.locator('#skipAbility')).toHaveText('Finish without attack');
 await page.locator('#skipAbility').click();
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(6);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});


test('F2 optional Shield between attacks executes once before next target choice',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.players[0].active=[];
  s.modifiers.heroes[0].draw=[0,0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[
   {id:'e0',name:'Ash Raider',q:1,r:4,hp:12,maxHp:12,conditions:{}},
   {id:'e1',name:'Ember Scout',q:0,r:3,hp:10,maxHp:10,conditions:{}}
  ];
  const action={kind:'attack',value:4,range:1,which:'top',cardIndex:2,
   asBasic:false,multiRemaining:1,targetIds:[],valid:[{q:1,r:4},{q:0,r:3}]};
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events:window.EmberwatchAbilities.compileHeroQueue('p0',action,[
    {type:'attack',value:4,range:1},
    {type:'shield',value:1,duration:'round',optional:true},
    {type:'attack',value:2,range:2},
    {type:'retaliate',value:1,duration:'round'}
   ],{targetId:'e0'})};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
   condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Optional ability');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='e0').hp).toBe(8);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(0);
 await page.reload();
 await page.locator('#executeAbility').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Required target');
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.players[0].active.filter(e=>e.type==='shield'&&e.value===1)).toHaveLength(1);
 expect(st.enemies.find(e=>e.id==='e1').hp).toBe(10);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 await page.locator('[data-optional-target="e1"]').click();
 await page.reload();
 await page.locator('#executeAbility').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies.find(e=>e.id==='e0').hp).toBe(8);
 expect(st.enemies.find(e=>e.id==='e1').hp).toBe(8);
 expect(st.modifiers.heroes[0].discard).toHaveLength(2);
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(1);
 expect(st.players[0].active.filter(e=>e.type==='retaliate')).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(1);
 expect(st.journal.filter(x=>x.includes(' attacks Ember Scout'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});

test('F2 interleaved Shield can be skipped after saved retaliation without replaying first hit',async ({page})=>{
 const errors=monitorErrors(page);
 await openCleanGame(page);
 await page.evaluate(()=>{
  const key='emberwatch_save_v1',s=JSON.parse(localStorage.getItem(key));
  s.phase='damage';s.order=[{type:'player',id:0,initiative:39}];s.turnIndex=0;
  s.players[0].picked=[2,1];s.players[0].active=[];
  s.modifiers.heroes[0].draw=[0,0,0];s.modifiers.heroes[0].discard=[];
  s.enemies=[{id:'e0',name:'Ash Raider',q:1,r:4,hp:12,maxHp:12,conditions:{},
   active:[{type:'retaliate',value:2,range:1,duration:'round'}]}];
  const action={kind:'attack',value:4,range:1,which:'top',cardIndex:2,
   asBasic:false,multiRemaining:1,targetIds:[],valid:[{q:1,r:4}]};
  s.combatQueue={version:1,owner:'hero',index:0,paused:true,
   pauseReason:'damage',events:window.EmberwatchAbilities.compileHeroQueue('p0',action,[
    {type:'attack',value:4,range:1},
    {type:'shield',value:1,duration:'round',optional:true},
    {type:'attack',value:2,range:1}
   ],{targetId:'e0'})};
  s.pendingDamage={heroIndex:0,amount:1,source:'Earlier interruption',
   condition:null,resume:'queue',attack:false};
  localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 await page.reload();
 await page.locator('#takeDamage').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Optional ability');
 await page.reload();
 await page.locator('#skipAbility').click();
 await expect(page.locator('#optionalAbilityChoice')).toContainText('Required target');
 let st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(8);
 expect(st.modifiers.heroes[0].discard).toHaveLength(1);
 expect(st.players[0].active.filter(e=>e.type==='shield')).toHaveLength(0);
 await page.locator('[data-optional-target="e0"]').click();
 await page.locator('#executeAbility').click();
 await expect(page.locator('#damageChoice')).toBeVisible();
 await page.reload();
 await page.locator('#takeDamage').click();
 st=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwatch_save_v1')));
 expect(st.enemies[0].hp).toBe(6);
 expect(st.modifiers.heroes[0].discard).toHaveLength(2);
 expect(st.journal.filter(x=>x.includes(' attacks Ash Raider'))).toHaveLength(2);
 expect(st.journal.filter(x=>x.includes('skips optional shield'))).toHaveLength(1);
 expect(st.combatQueue).toBeNull();
 expect(errors).toEqual([]);
});
