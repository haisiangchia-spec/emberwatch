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

## Monster ranged positioning audit — v0.10.7

Primary verification references: the [Frosthaven Official FAQ §5.8](https://cephalofairgames.github.io/frosthaven-faq/) and published Frosthaven rulebook monster-turn guide (pp. 74–75).

**Implemented in this increment:**
- Focus choice remains **independent of ranged Disadvantage**. A monster can still focus an adjacent enemy rather than a different, farther enemy.
- Once the primary focus is selected, a ranged attacker adjacent to it attempts a **minimum-cost safe retreat** to a legal unoccupied hex that remains within attack range and line of sight, avoiding paths through traps or hazardous terrain. The primary focus remains unchanged.
- A monster already Muddled (without a cancelling Strengthen condition) does not move solely to avoid adjacent ranged Disadvantage.
- Adjacent ranged attacks actually draw with Disadvantage through the shared modifier-selection engine; immobilized monsters cannot retreat and therefore make disadvantaged attacks if appropriate. Multiple disadvantage sources do not stack.
- Explicitly ranged attacks with range 1 also receive adjacent Disadvantage even though retreat cannot remove it.
- The pure `rangedRetreat` helper in `engine/monster-focus.js` has deterministic tests for movement allowance, conditions, occupancy, negative terrain and line of sight. Browser regressions test retreat, save/reload, Muddle, Immobilize and Range 1 adjacency.

**Known incomplete rules:**
- Ranged multi-target attack-position optimization (maximize additional targets before minimizing Disadvantage and movement) is not yet implemented.
- The full movement-to-attack-hex process, including improving path progress when the destination is out of movement range, icy terrain and choosing between equally valid routes, still needs audit.
- Ranged modifier handling for all special class and monster abilities, alternate targets, rolling modifiers and Advantage/Disadvantage modifier-deck edge cases is not complete.
- The current deterministic row/column tie-break is a prototype convenience; official remaining ambiguities generally permit party choice.
- This increment uses original demonstration card data, not any claim of complete Frosthaven content or fidelity.

---

## Monster multi-target positioning — v0.10.8

Primary references: [Frosthaven Official FAQ §5.8](https://cephalofairgames.github.io/frosthaven-faq/) and the rulebook monster-movement steps (pp. 42, 75).

**Implemented and tested:**
- Authored monster Attack steps can include `targets: N` with N greater than one. They retain the primary focus selected independently of disadvantage and additional targets.
- The new pure `multiTargetPosition` selector ranks **reachable, unoccupied positions that can attack the primary focus** by (1) fewest negative hexes, (2) greatest number of attackable enemies up to the card's target count, (3) fewest disadvantaged attacks, then (4) least movement cost. Stable row/column ordering is used for remaining ties in this prototype.
- Once a position is selected, target IDs and the destination are saved in the turn plan. A `monsterAttack` queue event expands into one event per target, with individual modifier draws and damage-prevention prompts. Saving and reloading after the first attack does not replay it.
- If no qualifying reachable attack position exists this turn, the previous movement-to-primary-focus policy remains as the fallback.
- Pure-engine tests check negative-hex priority, maximizing additional targets, minimizing disadvantage and limiting movement cost. Browser tests cover two distinct attacks interrupted by damage prompts, the queue cursor, and the attacker's death to Retaliate.
- Code-bearing run [42377931836](https://github.com/haisiangchia-spec/emberwatch/actions/runs/42377931836) passed 52 Chromium tests. The extra retaliation-death case is separately checked by CI.

**Remaining important limitations:** The party cannot yet choose among equally optimal destination hexes, secondary targets or the order in which a monster attacks them; this prototype uses deterministic seat and coordinate ties. The full rules allow party decisions in these ambiguous cases, which may change the outcome if Retaliate kills the monster. The current implementation supports `targets` metadata on a single Attack step; full red-hex AoE, summons, alternate attack/focus sequencing, large figures and detailed terrain/LOS edge cases remain incomplete. Its conformance tests cover original demonstration cards, not the official class or monster card catalog.

---

## Intentional Emberwatch rules exception — randomized ambiguous choices (v0.10.9)

**User-selected deviation from Frosthaven:** When a monster has two or more options that remain genuinely equal after all applicable tactical priorities have been evaluated, Emberwatch **automatically chooses at random and executes the result**. It does not ask the party to choose. This exception applies to ties in monster focus, equally optimal attack hexes, safe ranged retreat destinations, multi-target attack destinations, secondary target choices and attack order.

- All higher-priority considerations still apply: hazard avoidance, focus, maximum additional targets, minimizing disadvantage and movement points where applicable. Random selection never overrides a strictly better legal option.
- The pure functions in `engine/monster-focus.js` accept an injected random-number source for deterministic conformance tests; gameplay uses `Math.random`.
- Resolved decisions, planned destinations, selected targets and ordered per-target attack events are persisted in the combat queue/turn plan. Reloading during a damage-prevention prompt does **not** reroll an already made decision or repeat earlier attacks.
- No random draw is consumed when only one legal option exists.
- The former deterministic hero-seat/hex-coordinate tie-breaks are retained only for stable diagnostic ordering; they no longer force an ambiguous gameplay outcome.
- This exception applies only to **genuine ties**. The remaining monster-pathfinder and unsupported special-effect cases still require separate completeness audits.

This replaces earlier roadmap items calling for party-controlled final monster tie-breakers. Full tactical fidelity for Emberwatch henceforth means **official tactical priority rules except for this explicitly accepted randomized ambiguity rule**.

---

## Terrain entry effects — v0.11.0

Implemented:
- Added a pure, serializable `engine/terrain.js` resolver for entering damaging traps and hazardous terrain, with scenario level 0–7 scaling (trap damage = level + 2; hazardous damage = 1 + ceil(level / 3)).
- Traps trigger on entry, may carry authored damage and condition tokens, and are removed after triggering. Hazardous terrain deals damage on each entry and remains on the map. Flying and Jump traversal are exempt; a Jump ending on a tile triggers it.
- **Monster ordinary movement now traverses the actual planned path hex by hex**, applying terrain immediately. A monster killed partway through its movement cannot subsequently attack, and the defeated monster drops loot at its death hex.
- Forced Push/Pull of monsters applies the same terrain entry resolver on the new destination. The previously completed attack is not repeated if combat is paused or reloaded.
- Pure-engine tests verify conditions, scaling, removal, persistent hazard, dying on entry and flying/jump exemption. Browser cases exercise forced movement onto a trap and hazardous terrain, and a lethal trap on a forced corridor route.

**Still incomplete:**
- Normal hero movement currently selects a final destination rather than executing and persisting every intermediate path hex. Terrain triggers and card-loss prevention for hero movement need their own stepwise queued implementation.
- Nonstandard trap effects (healing, healing traps, all condition tokens), immunity and Ward/Brittle, icy sliding, teleport, full Jump and flying path/LOS fidelity, and special scenario triggers remain unfinished.
- Traps and hazards are supported as serialized overlays in saved state; the current original demo scenario does not yet place terrain by default. This increment is mechanical groundwork rather than scenario expansion.
- Monster route selection still uses the known prototype focus/negative-terrain priorities and retains the explicitly selected **automatic random tie-resolution exception**.

---

## Hero stepwise terrain movement — v0.11.1

Implemented and browser-tested:
- Hero Move, Jump and Fly actions now calculate a legal route at the moment the player selects the destination, then save an individual `heroMoveStep` queue event for each traversed hex. The existing movement costs and reachability modes are respected; equally short routes are randomly resolved as previously agreed.
- Entered hexes are resolved **sequentially**. A trap or hazardous hex can pause the movement queue for the normal damage-prevention decision: take damage, lose one eligible card from hand, or lose two eligible cards from discard. The terrain effect and queue cursor are persisted before prompting.
- After resolving damage, including after a browser reload, movement continues **from the next unprocessed hex**, without rerolling the route or re-triggering a consumed trap. Multiple damaging hexes produce separate prompts, and hazardous hexes persist.
- If terrain damage exhausts the hero, subsequent queued movement is skipped and the initiative turn advances without applying the rest of the movement action. If the hero survives, loot collection on the selected destination, door opening, and objective checks proceed.
- Jump skips dangerous terrain along intermediate route hexes but applies terrain effects on the landing hex; flying ignores dangerous terrain on intermediate and final hexes. Jump no longer opens doors while airborne.
- Browser coverage tests an intermediate trap with a saved/reloaded damage prompt, prevention by losing a hand card, multiple hazardous hexes separated by reloads, lethal trap interruption, Jump landing, and Flying immunity.
- Latest code-bearing GitHub Actions run [42380793715](https://github.com/haisiangchia-spec/emberwatch/actions/runs/42380793715) passed **62 Chromium tests** with unit checks green.

**Outstanding qualifications:** Route choice is computed automatically from current prototype pathfinding, rather than exposing full Frosthaven player-directed hex-by-hex route selection. Special movement effects, partial-move cancellation, movement-point choice/stop, scenario terrain scripts, ongoing condition effects and exact Flying/Jump exceptions still need coverage. Multiplayer synchronization remains nontransactional; this improvement guarantees serialization for the saved local state, not race-free concurrent network play. The normal game still does not place traps in its default scenario.

---

## Chained icy terrain movement — v0.11.2

Rule reference: [Frosthaven Official FAQ §5.1](https://cephalofairgames.github.io/frosthaven-faq/) and rulebook icy terrain (p. 14).

- Added `engine/ice.js`, a pure hex-grid slide resolver. Walking/forced movement onto an icy hex grants one **zero-cost extra step in the same direction**; entering another icy hex repeats the effect. An obstruction, objective, wall or occupied destination stops the chain. Ice is not consumed.
- Implemented icy slide handling for saved hero movement queues, monster movement and hero Push/Pull. The original movement type is preserved: a Push into ice extends the forced displacement; a normal Move can trigger a doorway when sliding. Jump, Fly and Teleport ignore icy slides, including on the final hex.
- Hero slide steps are inserted as serializable queued events before the remaining movement/action completion events. If a slide reaches a trap or hazardous tile, damage prevention pauses the queue on that reached hex and persists the progress through reload.
- A slide cannot spend movement points; a slide that diverges from the originally selected hero route ends that Move at the new position instead of teleporting the hero to a stale path. For planned non-divergent continuations, already traversed icy hex events are skipped to avoid duplicating them.
- Hex-map overlays now visibly distinguish icy, hazardous and trap terrain in custom saved maps.
- Pure unit tests exercise chained slides, blocked slides, odd-row direction consistency, forced movement inheritance, and Jump/Flying exemptions. Browser tests exercise unobstructed and blocked hero slides, hazardous interruptions, forced Push sliding and monster sliding into attack range.
- Emberwatch's intentionally randomized resolution of genuine tactical ties is unchanged.

**Known gaps:** This increment resolves slides once a path enters ice, but monster focus/pathfinding does not yet fully incorporate the *prospective* icy slides while planning attack positions, as the official FAQ requires. The automatic hero pathfinder may stop an action after an unplanned slide rather than recomputing the route within unused movement allowance; players cannot manually choose paths. Complex forced-move destination optimization, door-reveal edge cases and multiplayer concurrent event synchronization still need work. Ice does not appear in the default original demonstration scenario unless supplied through a saved state.

---

## Monster route planning accounts for prospective icy slides — v0.11.3

Implemented:
- `monsterRoutes()` now models walking into an icy hex as **one paid movement edge followed by zero-cost mandatory slides**. The route planner evaluates the resulting landing hex, rather than treating intermediate icy hexes as valid stopping points.
- Every hex crossed during the paid entry and free slide is included in the serializable planned route (slides marked `slide:true`). Negative terrain encountered along the complete chain contributes to the hazard-avoidance ranking.
- The primary focus selector therefore compares the **actual movement-point cost including free icy slides** and can prioritize a geometrically farther hero who can be attacked with fewer paid steps via ice.
- Ranged retreat and multi-target monster destination selection use the same ice-aware route costs and paths.
- Monster movement consumes the snapshotted path sequentially, charging zero movement points for planned slide steps, applying trap/hazard entry on each hex, and stopping on obstacles, occupied slide destinations or a lethal hazard. It retains the existing exception allowing monsters to pass through allied figures on ordinary (non-slide) path steps.
- Random selection remains automatic for genuine equal-ranking tactical outcomes, as explicitly requested by the user; resolved plans are saved before monster movement/damage prompts.
- Chromium tests verify an ice-route plan with explicit free slide steps and a competing-focus example where the farther hero becomes optimal by ice-aware movement cost. Existing hero/monster ice and reload tests remain in the suite. Latest code-bearing run 42382493553 passed **68 Chromium browser tests**.

**Not complete:** Exact official rules for icy sliding with dynamic occupancies, door opening, nonstandard movement, movement through allied figures, and alternative paths still require further conformance tests. Path choice is automatic and does not provide manual routing or party control of ties. The prototype's original card content remains limited, and online shared-state writes are not atomic. Milestone 1 remains a work in progress.

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
