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
