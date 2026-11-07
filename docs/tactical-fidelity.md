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

## Milestone 1 — Shared combat queue, first integrated slice (v0.10.0)

Implemented in the playable HTML5 prototype:

- **Serializable combat event queue** in `engine/combat-queue.js`. A queue has an owner, immutable event descriptions, an index and explicit paused/resumed state; it can round-trip through JSON/localStorage.
- **Monster type activation** is now scheduled as queued per-monster events. Monster movement and attack rolls are consumed once before a player's damage-prevention decision; resuming the queue continues with the next monster rather than replaying the attack.
- **Hero Retaliate continuations** use the same queue interface. Hero damage prevention can interrupt the hit sequence, including across a page reload, and the selected ability resumes afterward.
- **Backward compatibility** for a pre-queue save interrupted during monster damage: the old cursor is translated to the remaining queued monster events without replaying already-resolved attacks.
- Automated conformance tests in `tests/combat-queue.test.js`, added to CI. Browser tests exercise consecutive monsters, repeated damage prompts, reloads during a prompt, and legacy interrupted-save migration.

**Important boundary: Milestone 1 is only partially complete.** The event queue currently owns monster activations and selected hero attack continuations; hero movement, full targeting, monster focus/path decisions, and general ability/condition/terrain interrupt handling still run in legacy handlers. This is an integration foundation, **not yet a single complete action interpreter for every character/monster card**. Multi-figure/multi-target and non-attack interruption timing need more conformance tests. Four-client network consistency is not verified.

**Follow-up within milestone 1:** migrate the remaining hero action stages and monster ability steps onto the same queue, integrate generic per-target interrupts, prove state consistency through reconnects, and retire the legacy turn paths once parity tests pass.

---

## Milestone 1 continuation — v0.10.1 stepwise events

Implemented and tested:
- Hero **Move** and **Heal** board choices execute via the shared `heroActionResolve` queue event; a separate `heroActionComplete` event applies loss-on-use and elemental infusion once.
- Explicitly scripted monster cards now enqueue `monsterStart`, one event per Move/Attack/self-effect step, and `monsterFinish`, preserving the ability's order.
- The queue supports consecutive attacks from one monster with a separate player damage decision after each hit. Reloading during either decision preserves the event cursor, modifier draws, and game state.
- Monster non-attack steps can self-heal, activate Shield/Retaliate, gain a condition, or infuse an element. These original demo effects can occur before or after a damage interruption.
- Tested interrupted double attacks, hero movement and loot persistence, and Shield → Attack → Infuse ordering through a reload. The code-bearing run for this last test passed **33 Chromium browser tests**.

**Not yet fully unified:** Some hero attacks, positional choices, area/forced movement effects, monster focus decisions and legacy modifier-card monster actions still execute through older specialized handlers. Full attack effect timing, all terrain interrupts, multi-hex path steps, persistent class mechanics, and four-client deterministic synchronization are separate unfinished work. This is **Milestone 1 in progress**, not tactical-fidelity completion.

---

## Milestone 1 continuation — v0.10.2 queued hero attacks

Implemented and tested:
- Hero attacks now enqueue separate **Hit** and **Post-Hit** events in the shared serializable combat queue.
- Hit events consume the attack modifier, apply actual damage and conditions, award attack XP and remove defeated monsters.
- Surviving targets with a Push/Pull follow-up pause the queue **between hit and post-hit**. The selected target, legal destinations and event cursor are persisted, allowing a page reload before the player chooses to move the target or decline movement.
- Post-hit resolution checks surviving defenders' Retaliate after the optional displacement; the subsequent damage-prevention prompt can itself pause/resume another queued continuation.
- A player cannot end the hero's turn or choose another action while a queued forced-movement decision remains unresolved.
- Deterministic browser tests exercise accepting and declining Push after reload, one-time modifier draws, Retaliate timing and interruption safety. The code-bearing run **42375080931** passed **37 Chromium tests**, with unit tests also green.

**Open Milestone 1 gaps:** Area/multiple-target attack targeting UI state is not fully persistent across arbitrary reloads; monster AI focus and path selection are still implemented outside the generic queue; several hero effects and condition/terrain triggers still require dedicated handlers. Full multiplayer privacy and atomic shared-state updates remain unverified. This continues the staged migration; it does not establish complete tactical fidelity.

---

## Milestone 1 continuation — v0.10.3 persistent multi-target and area decisions

Implemented in the HTML5 game:
- `state.pendingTargeting` persists an active hero's multi-target or area-attack action, including the selected anchor's target IDs, remaining attack count, already-hit IDs and legal hex choices.
- The interface restores the pending decision after a reload before an area anchor is chosen and between individual hits.
- Retaliate/damage-prevention interruptions retain this selection; resolving the interruption advances to the next target **without repeating prior attack modifier draws**.
- Targeting state is cleared when the action completes, is skipped or the hero ends the turn. Existing forced-movement prompts retain priority while the combat queue is paused.
- Browser tests confirm an uninterrupted multi-target action, an anchored area attack through repeated reloads, and a first-target Retaliate interruption followed by a second hit. The code-bearing GitHub Actions run **42375619512** passed **40 Chromium tests**.

**Still incomplete:** The unified execution milestone continues with monster focus/movement decisions, fully serialized hero card-selection state beyond targeting, advanced ability sequences and state consistency in actual four-client play. The tests establish only the implemented example paths, not full tactical conformance.

---

## Milestone 1 continuation — v0.10.4 saved monster-focus checkpoints

Implemented in the HTML5 game and automated tests:
- New `engine/monster-focus.js`: pure, deterministic candidate selection with reproducible tie-break ranking over available attack positions. This extracts the **existing Emberwatch policy**, not a verified Frosthaven focus specification.
- Explicit `monsterFocus` event inserted after `monsterStart` and before the scripted monster's movement and attacks.
- Focused hero ID, chosen goal, route and movement destination are saved in `monsterTurnPlans`; a trace of candidate rankings is retained for debugging during activation.
- Monster movement and attack events read the saved focus decision instead of recomputing it on resumption. The stored focus survives a page reload during a damage-prevention interruption and is removed once the monster turn ends.
- Unit tests cover the candidate tie breakers and JSON reproducibility. An end-to-end Chromium regression verifies saved focus and route across an interrupted attack and cleanup afterward.
- GitHub Actions code-bearing run **42376126309** passed **41 Chromium browser tests** and the existing Node assertions.

**Important limitations:** This is a **structural milestone** only. The candidate generation, shortest routes, focus priorities, tie-break sequence, line of sight and monster movement/attack edge cases still need a rule-by-rule Frosthaven audit. Legacy monster modifier cards continue through an atomic compatibility event rather than the fully stepwise queue. Summons and specialized AI remain unimplemented. Milestone 1 is not closed.

---

## Milestone 1 continuation — v0.10.5 legacy monster migration

- All **new monster activations** now build a saved, stepwise queue: Start → Focus → Move → Attack → any additional effects → Finish.
- Older modifier-based monster ability cards are normalized by `monsterSteps()` into ordinary structured Move/Attack steps, carrying the resulting values and condition as immutable data in each queue event.
- Both authored multi-step cards and legacy modifier cards use the same focus snapshot, movement, attack/damage prompt and finish handlers. No newly started monster turn generates an atomic `monsterTurn` event.
- **Legacy compatibility remains** for previously saved, already-running `monsterTurn` events and previous pending-damage cursors, avoiding replay of completed attacks.
- The Chromium suite checks ordinary two-monster interruptions, stepwise double attacks, focus persistence, conversion of modifier-based cards across reloads and backward compatibility.

**Milestone 1 is still not complete:** The old `executeMonsterQueueEvent` function remains solely for loading historical queue snapshots, but the common route planner and focus algorithm still require an authoritative rules audit. More extensive monster effect triggers, change-of-focus edge cases, multi-target targeting, status and environmental interrupts, and four-client concurrency remain outside verified tactical fidelity. Current implementation uses original demo monsters, not comprehensive official Frosthaven data.

---

## Monster focus rules audit — v0.10.6

Compared against the Frosthaven rulebook (monster focus and movement, pp. 41–42 and monster-turn guide pp. 74–75) and the official FAQ, §5.8 (last checked November 2026). Source: https://cephalofairgames.github.io/frosthaven-faq/

**Newly implemented and regression-tested:**
- A monster's pathfinding now lexicographically minimizes the number of **negative hexes** (traps or hazardous terrain) before movement-point cost, matching the focus priority that a safer long route beats a dangerous short route. Difficult terrain still costs additional movement but is not a negative hex.
- The extracted focus comparator incorporates negative-hex count as its first priority, then path movement cost, range to the enemy, initiative, and stable deterministic ties.
- An **attackless** or **Disarmed** monster calculates its primary focus as if for a single-target melee attack, even if the shown ability would otherwise be ranged. Disarm prevents attack execution while allowing movement and non-attack abilities.
- **Immobilize** prohibits monster movement but does not suppress an otherwise valid attack.
- The new browser fixture checks an enemy behind a ring of traps versus a farther safe enemy. Node tests cover the negative-hex priority; other browser tests cover attackless movement, Disarm and Immobilize.
- Code-bearing run **42376980173**: **47 passing Chromium regression tests** and successful unit-test stage.

**Significant remaining gaps — do not declare full Frosthaven AI fidelity:**
- Trap and hazardous-terrain *trigger effects*, consumption/removal, immunity and figure damage when actually entered are not handled by this focus-path update.
- Icy-terrain sliding, precise hex edge interactions, flying/jump traversal and path-cost edge cases need conformance fixtures.
- The rules of ranged repositioning to avoid Disadvantage, multi-target maximization, player-choice final tie-breaks, monster standee/elite activation order, switching to another focus if the first is no longer available, and nonattack support targeting still require dedicated tests and implementations.
- The current focus algorithm still chooses an attack-position path with a deterministic row/column tie-break; this is a technical prototype convention, not a fully verified application of official ambiguity-resolution rules.
- The prototype's monster/card data remains original demonstration content. Passing tests establish the implemented mechanics only.

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
