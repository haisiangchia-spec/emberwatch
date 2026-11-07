# Emberwatch tactical fidelity plan

Goal: a rule-faithful tactical rules engine for four-player co-op, using original/demo content and optionally user-supplied or licensed card data. No official card text, proprietary images, or scenario prose are bundled.

## Reference and scope
- Frosthaven printed rulebook (2023), scenario combat chapters.
- Cephalofair official FAQ (https://cephalofairgames.github.io/frosthaven-faq/), including current errata and clarifications.
- Rules equivalence is tested separately from content equivalence; no assertion of exact fidelity until conformance tests pass.
- Hide unlockable class names and card details by default in public UI and documentation.

## Existing v0.7 gaps (must fix before extending scenarios)
1. **Card selection and resources:** selection order currently fixes top vs bottom, rather than allowing top of either card plus bottom of the other. Actions may need multiple ability steps. Missing lost-on-use cards, active/persistent effects, long rest, optional loss to avoid damage, proper exhaustion and resting timing.
2. **Actions:** discrete action/ability/target/effect resolution, optional effects, linked abilities, movement modifiers, obstacle interaction, disarm/stun timing, immunity, target types.
3. **Modifier draws:** deck changes, perks, curse/bless, rolling modifiers, advantage/disadvantage edge cases, attack order, shield/pierce, ward/brittle.
4. **AI:** complete negative-hex/path evaluation, focus ties, secondary targets, exact ranged movement to avoid disadvantage, attack patterns, elite/normal variants, boss special rules.
5. **Geometry:** verify hex vertices and wall boundaries, line of sight edge/corner cases, doors, terrain overlays, jump/fly/teleport, allies/enemies and obstacles.
6. **Rounds and conditions:** precise start/end of turn and round timing, infusion end-of-turn semantics, persistent effects, conditions and immunities, summons.
7. **Information security:** four-player simultaneous planning cannot broadcast secret card selections to other clients; authoritative turn transactions and reconnect safety are necessary for online fidelity.

## F1 implementation checkpoint — v0.8

Implemented and browser-tested in the current HTML5 game:
- Independent two-card selection: choose either card for top, the other for bottom, with a separately chosen initiative card.
- Declared long rest in planning, initiative 99, chosen discarded card lost, remaining discard recovered, Heal 2.
- Short rest from the next planning window, randomly lose one discarded card, recover the rest, optional one-damage redraw.
- Separate hand, discard and lost piles, and loss-on-use demo top abilities (the final card library will supply loss icons as structured card data).
- End-of-turn card placement rather than the old automatic end-round card recycling.
- Exhaustion for insufficient hand/discard cards at the start of a new round.
- Save migration for additional card state.

**Important outstanding fidelity gaps:** The short-rest decision is currently offered in the next planning phase rather than an explicit end-of-round phase. Card loss to prevent incoming damage is not implemented. Active/persistent abilities, precise card recovery interactions, long-rest item refresh and condition interactions are incomplete. The prototype still uses only six original cards per character and does not yet load official class content. Multiplayer private planning remains unverified; online play is experimental.

The ten passing Chromium smoke tests verify specific example flows, not comprehensive conformance with the Frosthaven rulebook.

---

## F1 follow-up — v0.8.1

Implemented in the live prototype and verified with 13 Chromium browser tests:
- End-of-round short-rest phase with one decision per eligible character, before element waning.
- Random card loss, recovery of remaining discard, and a single optional one-damage redraw choosing a different random card.
- Interactive attack-damage resolution allowing HP loss, one eligible hand card loss, or two distinct discard cards to negate the damage.
- Committed selection cards are excluded from the eligible hand pool before the character acts.
- Damage-prevention decisions pause monster execution and resume after the player resolves them.
- Attack conditions are still applied when damage is prevented (if the target remains active).

Important remaining gaps:
- The interactive prevention prompt currently covers **monster attack damage**, not all damage sources (notably Wound, hazardous terrain, and scenario damage). These must use the same damage-event pipeline before F1 can be declared complete.
- Long rest resolves the required card recovery and Heal 2 but does not yet implement fully optional healing, cleansing implications, or refresh of spent items in a meaningful equipment system.
- Card-loss properties are hard-coded for four original demonstration powers rather than read from official/licensed ability data.
- Full active/persistent bonuses, temporary/card recovery effects, stateful item use and exhaustion cleanup of summons are incomplete.
- Four-browser synchronized decision locking, online privacy, and race-condition handling are still unverified.

Test suite passing is evidence for tested paths, not a claim of rule-by-rule equivalence.

---

## F1 follow-up — v0.8.2

Implemented in the HTML5 game and checked by **16 passing Chromium smoke tests**:
- Wound damage on a hero's turn start enters the same interactive card-loss prevention workflow as monster damage. It is resolved **once** before the hero acts or long rests and does not apply Poison or Guard adjustments.
- The Wound decision may sacrifice one uncommitted hand card or two different discard cards, or take 1 HP damage.
- New original equipment **Steel Buckler** costs 4 gold; it can be spent for Guard +2 once between long rests. Spent state is saved and restored by a successful long rest.
- Short-rest redraw now chooses a replacement only from the cards in that rest's recovered discard pile; it cannot lose an unrelated untouched hand card.
- All prior browser smoke tests remain green.

**Not yet exact Frosthaven rules:** The game still lacks a generic queued damage-event pipeline for scenario hazards and other damage types, complete item states (spent versus consumed, refresh versus recovery), damage prevention during asynchronous multiplayer, real persistent/active cards, full card-loss data and class-specific rules. The original 'Steel Buckler' is an engine testing aid, not an official Frosthaven item. Long-rest handling is still simplified relative to full item/condition interactions.

---

## Target engine boundaries
- `engine/state`: serializable state and schema migration.
- `engine/round`: plan/reveal/turn/end-round state machine.
- `engine/abilities`: interpreter for sequential abilities and modifiers, explicit targeting choices.
- `engine/grid`: hex topology, pathfinding, LOS, wall edges, terrain.
- `engine/combat`: attack modifiers, damage, targeting, conditions, summons.
- `engine/monsters`: rules-based AI and per-type ability decks.
- `content/`: external JSON class and monster packages, provenance and spoiler metadata.
- `tests/conformance/`: reproducible rule examples and edge cases.
- `tests/browser/`: Playwright UI and four-client synchronization tests.

## Content package contract (v1)
Each content package has a unique `id`, `kind` (`class` or `monster`), `version`, `license`, `spoilerLevel`, and `cards`. Cards have a unique ID and structured actions. Class cards have initiative, top and bottom actions. Monster cards have initiative and an ability sequence. Renderer can show symbols/text from packages but engine must never infer mechanics from display prose.

Content imports must explicitly declare provenance and usage permission. The project should not redistribute complete official Frosthaven card data without authorization.

## Delivery sequence
- F1: card choice, initiative, loss/discard, rest/exhaustion with conformance tests.
- F2: complete atomic ability interpreter, effects, targeting and conditions.
- F3: attack modifiers, perks, advantage/disadvantage, shield/retaliate.
- F4: geometry, movement, terrain and LOS, with exhaustive fixtures.
- F5: monster focus/movement/ability logic and summons.
- F6: class-specific mechanics through independent, licensed data packages; spoiler controls.
- F7: four-player privacy, atomic online transitions, reconnects and adversarial tests.
- Only after F1–F7: scenario expansion.

## Definition of near-perfect
A mechanic passes when it matches official examples and FAQ rulings, automated conformance tests are green, UI behavior matches the underlying state, and multiplayer clients cannot diverge. Percentages are not meaningful without a comprehensive indexed test catalogue.
