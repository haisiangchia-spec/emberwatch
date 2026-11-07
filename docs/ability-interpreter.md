# Emberwatch F2: structured tactical abilities

**Implementation stage:** v0.9.1, partial tactical ability interpreter. These are original demo effects; no Frosthaven card text or artwork is distributed.

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

## v0.9.2 checkpoint: resumable sequences and area anchors

The independent `engine/abilities.js` now provides `beginSequence(state, actorId, steps)` and `resumeSequence(snapshot, choice)`. The cursor is ordinary JSON: the player can pause before a target/path selection, serialize the entire snapshot, and resume without rerunning previously resolved ability steps. No hidden in-memory callback or executable function is stored in the cursor. These methods currently pause **between whole ability steps**; nested attack interrupts still use the live game's dedicated pending-damage/pending-attack state rather than the generic cursor.

`areaHexes(anchor, offsets)` converts axial shape offsets to the game's odd-row coordinates. In the live game, the original Runesmith **Arc Pulse** now allows choosing a legal anchor and then targeting each enemy caught in its two-hex area pattern. Attack range applies to the anchor, not independently to every affected hex. A separate Chromium regression covers an affected enemy beyond anchor range.

The area implementation is still deliberately narrow: no shape rotation, multi-hex obstacles, obstacle edge LOS, multi-hex figures, modifier advantage, or generic interruption queue for all monsters yet. Monsters retain their existing AI/card implementation pending a later dedicated port into the shared interpreter.

---

## Fidelity boundaries

The standalone interpreter currently supports **ordered, immediate effects**, but the live game only uses a subset of those effects; it is not a complete Frosthaven action pipeline.

**Important gaps before full F2 conformance:**
- Linked attack post-effects (`after`) now resolve in order before Retaliate. The standalone engine supports targeted Push, Pull and condition links. The live game supports attack → one-hex Push/Pull → Retaliate, with a resumable damage-prevention choice. **It is not yet a generic multi-effect event queue** that supports every interrupt, optional effect and monster ability.
- Area patterns can be computed, but rotated/target-relative hex templates, obstacle edge rules, precise range/line of sight and positional choice UI are not yet complete.
- No automatic summon effects or summon action-order system.
- Attack modifier draws, perk chains, rolling modifiers, Advantage/Disadvantage, shields, conditions, ward/brittle, consumed elements and monster AI still require consolidation into the new resolver.
- Shield and Retaliate lifecycle is provisional for a subset of original cards; future data-driven abilities require duration, triggers and stacking conformance fixtures.
- Push/Pull currently offers a single legal hex and player choice, but not maximum-distance multi-hex monster displacement or terrain damage along the path.
- Browser tests use original demo classes. Complete official class and monster cards are **not** bundled, and must only be added from materials with distribution permission.

## v0.9.1 milestone

- A defender that dies from an attack does not retaliate.
- A living defender's Retaliate range is checked after linked displacement.
- Multiple-target attacks resolve each target's damage, linked effects and Retaliate independently.
- In the live game, retaliation against a hero can pause for HP loss or card-loss prevention and resume without repeating the triggering attack.
- 24 Chromium browser tests passed on the code-bearing commit (GitHub Actions run 42370841797); unit conformance assertions also passed.

## Next increment

F2.2 will consolidate generic linked effects, the live targeting interface and queued interrupts for multi-target monster abilities. Then we can add terrain damage, summons, additional conditions, and fuller modifier-deck semantics. It remains necessary to independently validate each rule against the printed rules and FAQ.
