# Emberwatch F2: structured tactical abilities

**Implementation stage:** v0.9.0, partial tactical ability interpreter. These are original demo effects; no Frosthaven card text or artwork is distributed.

## What's now playable

- Original **Vanguard / Brace** bottom action: Guard 2 plus **Shield 1 until the round ends**.
- Original **Warden / Oakheart** bottom action: Guard 4 plus **Retaliate 1 at range 1 until the round ends**.
- Original **Vanguard / Iron Sweep** top: attack and then select a legal adjacent hex to **Push 1** if the enemy survives.
- Original **Wayfinder / Mark Quarry** top: attack and then select a legal adjacent hex to **Pull 1** if the enemy survives.
- Original **Runesmith / Static Bloom** top: may attack **two distinct enemies**, selecting each on the board.
- Existing 4-player cards, rest, Wound prevention, elements and saves continue to work.

## New code files

- `engine/abilities.js`: standalone, environment-neutral, synchronous JSON-state interpreter.
- `tests/ability-engine.test.js`: deterministic Node tests for ordered effects, attack modifiers, multiple targets, shield, retaliate, geometry, force movement, conditions, healing, elemental infusion and area attacks.
- `tests/smoke.spec.js`: additional browser tests checking real card abilities in the HTML5 UI.

All commands run automatically in GitHub Actions, through `npm run test:unit` and `npm run test:smoke`.

## Example of original structured card data

```js
const ability = [
  { type: 'shield', value: 1, duration: 'round' },
  { type: 'attack', value: 3, range: 2, targets: 2 },
  { type: 'heal', value: 1, range: 1 }
];
const choices = [
  {},
  { targets: ['enemyA', 'enemyB'] },
  { targets: ['allyA'] }
];
const result = EmberwatchAbilities.apply(state, 'hero', ability, choices, {
  modifier: ({ actor, target, step }) => 0
});
```

A hex-shaped area uses axial offsets (not odd-row screen-coordinate offsets) from a selected odd-row anchor:

```js
{
  type: 'areaAttack',
  value: 2,
  range: 3,
  area: [{ q: 0, r: 0 }, { q: -1, r: 1 }]
}
```

Pass `{ anchor: { q: 2, r: 1 } }` for the corresponding ability choice.

## Fidelity boundaries

The standalone interpreter currently supports **ordered, immediate effects**, but the live game only uses a subset of those effects; it is not a complete Frosthaven action pipeline.

**Important gaps before full F2 conformance:**
- The resolver deliberately **rejects** linked attack post-effects (`after`) because Retaliate must occur after attack effects (including displacement) and this needs a resumable attack-resolution queue.
- Area patterns can be computed, but rotated/target-relative hex templates, obstacle edge rules, precise range/line of sight and positional choice UI are not yet complete.
- No automatic summon effects or summon action-order system.
- Attack modifier draws, perk chains, rolling modifiers, Advantage/Disadvantage, shields, conditions, ward/brittle, consumed elements and monster AI still require consolidation into the new resolver.
- Shield and Retaliate lifecycle is provisional for a subset of original cards; future data-driven abilities require duration, triggers and stacking conformance fixtures.
- Push/Pull currently offers a single legal hex and player choice, but not maximum-distance multi-hex monster displacement or terrain damage along the path.
- Browser tests use original demo classes. Complete official class and monster cards are **not** bundled, and must only be added from materials with distribution permission.

## Next increment

F2.1 will introduce a resumable attack event queue, multiple linked effects, and attack-resolution timing. Then we can connect full area-targeting, conditions, terrain interactions and monster attack scripts to the same shared pipeline, with browser and unit conformance tests for every rule.
