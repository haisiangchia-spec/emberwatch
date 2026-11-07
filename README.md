# Emberwatch v0.11.0 — Terrain Entry and Forced Movement

Emberwatch is an original four-hero cooperative tactical HTML5 prototype. The current effort prioritizes mechanical fidelity to tactical dungeon-crawler rules before expanding scenarios. It does not distribute official Frosthaven cards or artwork.

## Recent tactical-engine progress

- Added a shared terrain entry resolver for traps and hazardous terrain. Trap damage scales by scenario level and removes the trap; hazardous tiles persist and damage on re-entry. Flying and Jump exemptions are supported at the rules-engine level.
- Monster movement now checks each traversed hex for terrain effects, and a monster killed en route cannot perform its queued attack. Hero Push/Pull onto a dangerous tile triggers the same resolver.
- The live original scenario still has no default placed hazards. Hero intermediate movement and damage-prevention decisions on terrain are not yet fully implemented.
- Chromium browser regression suite: **56 passing tests** on the latest code-bearing run.

- **Intentional rule exception:** whenever several monster choices are equally valid after applying normal tactical priorities, Emberwatch randomly selects and executes one. No party vote or manual tie-break is required.
- This includes tied monster focus targets, attack hexes, retreat destinations, additional attack targets and attack order. The chosen action is saved before execution so reloads never reroll completed choices.
- The remaining movement, terrain, combat and card-fidelity gaps continue to be tracked in the tactical fidelity plan.

- Monster Attack steps with `targets: N` now seek positions that preserve primary focus, minimize negative terrain, maximize additional targets, minimize disadvantaged attacks, and then movement cost.
- Individual monster attacks have independent attack-modifier draws and damage prompts, with the shared queue surviving reloads. A monster defeated by Retaliate cannot finish its remaining attacks.
- **Still incomplete:** players cannot yet pick among equally valid attack positions, secondary targets or attack order; full AoE and monster abilities remain additional fidelity work.

- Ranged monsters now retreat the shortest safe distance when adjacent to their primary focus, unless already Muddled or unable to move. Adjacency applies actual Disadvantage to modifier draws, including explicitly ranged Range 1 attacks.
- Focus selection is kept separate from ranged Disadvantage; the chosen primary target does not change merely because another enemy could be attacked without Disadvantage.
- Monster positioning and multi-target attacks still require further official-rules conformance before claiming full fidelity.

- The first Frosthaven monster-focus audit increment prioritizes avoiding negative terrain before movement cost, and gives Disarmed/attackless monsters melee focus. Immobilized monsters remain able to attack without moving.
- Both official rules and the official FAQ have been compared, but **focus and movement are not yet fully rule-complete** (ranged disadvantage positioning, extra targets, icy terrain and trap triggers remain).
- The latest code-bearing run passed 47 Chromium regression tests.

- **All newly activated monster cards**, including older modifier-based cards, now run through explicit Start, Focus, Move, Attack and Finish queue events. An already-running atomic monster event is supported only for older saved games.
- The normalized action values and effects are stored in the queue, preventing completed modifier draws or attacks from being repeated after reload.
- The engine still requires a comprehensive monster AI and focus rules audit; complete official card content is not included.

- Scripted monster turns now select and save their focus as a standalone queued event before moving and attacking. The choice and route survive reloads during damage decisions.
- The focus ordering was extracted into a standalone, tested module. It preserves Emberwatch's current selection rule and is **not** yet a complete Frosthaven focus implementation.
- The latest code-bearing CI run passed 41 Chromium browser tests; legacy monster cards still require migration to the stepwise queue.

- Multi-target and area-attack decisions now persist across reloads, including chosen anchor, affected figures, completed targets and remaining attacks.
- After a Retaliate damage-prevention pause, the next target remains available without replaying resolved hits. All 40 Chromium tests passed on the latest code-bearing run.

- Hero attacks now resolve in separate queued hit and post-hit events, with serialized Push/Pull choices that survive a page reload.
- Retaliate is checked after the target's displacement, and unresolved queue choices cannot be bypassed by ending the turn.
- The latest code-bearing run passed 37 Chromium smoke tests; full tactical rules and content coverage remain future milestones.

- The serializable shared combat queue processes **hero Move and Heal actions**, then records action completion (including loss-on-use and elemental infusion).
- Explicitly scripted monster cards advance through separately queued movement, attack, and nonattack effects, including **self-healing, Shield, Retaliate, conditions and elemental infusion**.
- Monster cards can contain multiple attacks; each damage-prevention prompt pauses the queue independently. Reconnecting or reloading preserves which modifier draws and attacks were consumed.
- Legacy monster modifier cards still use the older compatibility path; monster focus/pathfinding and a number of hero attack decisions are not yet fully represented as generic queued effects.
- The current Cinder Vault demonstration campaign remains in place; no new scenarios have been added.
- GitHub Actions executes Node conformance assertions and Chromium browser regression tests after code changes. The 33-test browser suite passed on the scripted-effect update; refer to Actions for the latest run.

For current scope and known limitations, see [tactical fidelity plan](docs/tactical-fidelity.md) and [ability interpreter reference](docs/ability-interpreter.md).

---

# Emberwatch v0.7 — Campaign Progression

Emberwatch is an original four-character cooperative HTML5 tactical prototype, inspired by the general style of tactical dungeon-crawling board games. The current version adds a persistent campaign layer on top of the Cinder Vault scenario.

## New in v0.7

- **Campaign Hub:** Use the header button to view all four heroes' levels, XP, gold, equipment and enhanced cards.
- **Persistent progression:** The campaign is stored in the existing `emberwatch_save_v1` local save and included in exported saves. Legacy v0.6 saves receive default level-1 campaign records.
- **XP and levels:** Heroes gain 1 XP each time their attack deals positive damage. On victory, each hero receives 5 XP. Level thresholds are `8 + 5 × current level` XP; each new level grants +2 maximum HP in subsequent scenarios, up to level 9.
- **Gold and crafting:** Collected coins also add gold to that hero's persistent campaign purse. Victory grants 3 gold per hero and 2 shared crafting materials.
- **Gear:** Tempered Edge (6 gold) gives Attack +1, Trail Boots (5 gold) gives Move +1, and Ironweave Vest (7 gold) gives 1 Guard at the start of the next scenario. These are permanent, non-stackable purchases.
- **Enhanced cards:** Spend 2 shared materials to upgrade one of the owner's six ability cards; its selected action receives +1 numerical power. Each card can be enhanced once.
- **Next scenario:** The Campaign Hub can start a fresh Cinder Vault mission while keeping campaign progress and restoring the characters with level-scaled HP and armor bonuses.
- **Limits:** The campaign currently repeats a single scenario; it does not yet have a world map or multiple linked story missions. Campaign purchases are intentionally disabled in online rooms until server-side transactions and seat ownership are hardened. Firebase gameplay itself remains experimental.

## Testing

GitHub Actions runs Chromium Playwright smoke tests after each push. Tests cover local-game loading, four-character card selection, turn persistence, scenario reset, and campaign purchase / advancement preservation.

---

# Emberwatch — HTML5 co-op tactical prototype

This is an ORIGINAL game inspired by the genre of Frosthaven and Gloomhaven. It contains no Frosthaven assets, official character names, narrative, maps, or card text, and is not a complete Frosthaven rules implementation.

## Play now

Open `index.html` in a modern browser and select **New local hot-seat game**. All 4 characters can be played sequentially on one machine. For GitHub Pages, upload `index.html` to the root of a repository and enable **Settings → Pages → Deploy from a branch → main / (root)**.

## Four-browser online setup

1. Create your own [Firebase](https://console.firebase.google.com/) project.
2. Add a Web app and copy its Firebase web configuration JSON (must contain `databaseURL`).
3. Under **Authentication → Sign-in method**, enable **Anonymous**.
4. Create **Realtime Database** and paste `database.rules.json` into its **Rules** tab, then publish. These rules are **prototype-only**, allowing any signed-in anonymous user to read and modify a known room code. They are **not suitable for public production**.
5. Host `index.html` through GitHub Pages (HTTPS) or another static server. Each participant opens it, pastes the same Firebase config, enters the same room code, and selects a *different* seat. The first participant chooses **Create online room**; the others choose **Join existing room**.
6. Different browser profiles are needed when testing multiple seats on the same device, because anonymous authentication identities persist within each profile.

**Prototype limits:** Firebase is currently last-write-wins for game state. Do not issue two actions simultaneously. Only the active player should interact during action resolution. There is no authoritative game server, private hand validation, robust reconnect/seat expiry, or exploit protection. Do not put confidential data into a Firebase room. Seat claims persist until database records are manually cleared. The simple rules permit anyone authenticated to inspect game data if they know the code.

## Movement, visibility and monster AI

- Uses odd-row offset hex coordinates for correct six-neighbour movement and distance.
- Dijkstra movement: normal terrain costs 1, difficult terrain costs 2.
- Heroes may move through allies but may not end on an occupied hex. Enemies block normal traversal.
- Rocks and walls block walking and all landing; rocks do not block line of sight, walls do.
- Ranged attack and healing target eligibility use a geometric corner-to-corner LOS approximation. This is **not yet an exact implementation of all Frosthaven edge and vertex LOS rulings**.
- The Wayfinder has a Jump 4 action on Trail Step and the Runesmith has a Fly 4 action on Kinetic Step for testing. Jump and flying can pass across terrain and figures but cannot end on occupied or impassable hexes. This prototype does not yet support persistent flying as an ongoing status.
- Existing local saves are migrated with the new terrain. Starting a fresh scenario is recommended for testing layout.

### Monster automation (introduced in v0.3)

- Every monster seeks a reachable unoccupied hex from which it can attack its focused hero, using weighted shortest-path search, not a simple nearest-hero heuristic.
- Focus selection prioritises movement cost to a legal attack hex, then current hex distance to the hero, then the hero’s initiative (and character order if still tied).
- Monsters can path **through other monsters** but cannot end on them or move through heroes, rocks or walls. Difficult terrain costs 2 to enter.
- Ash Raiders have Move 2 / melee Range 1 / Attack 2; Flame Brute has Move 1 / melee Range 1 / Attack 3. A new Ash Archer has Move 2 / Range 3 / Attack 2, and must have LOS to fire.
- If already in range with LOS, a monster attacks without moving. Monsters may move towards a legal attack position even when unable to reach it this turn. Each monster resolves its movement and attack before the next one acts.
- This is an **inspired approximation**, not exact Frosthaven monster focus. It does not yet handle disadvantage avoidance, complex attack templates, monster ability cards, ranged multishot, traps, monster flying/jumping, or all advanced monster rules.
- Online mode continues to be experimental; do not play simultaneous actions in multiple browsers. Room data is still client-authoritative.


### Monster abilities and attack modifiers (new in v0.4)

- Each of the three monster families has an **original six-card ability deck**. At the start of each round, reveal one ability per monster family present. All monsters of that family act at the revealed initiative and use its Move, Attack and Range changes.
- Ability cards are drawn without replacement until the family deck runs out; the designated shuffle card also triggers a reshuffle. The map shows all currently revealed monster abilities.
- Heroes each have their own 20-card attack modifier deck; monsters share one separate 20-card deck. Each contains 1 miss (×0), 1 critical (×2), 1 × −2, 5 × −1, 6 × 0, 5 × +1, and 1 × +2.
- Each attack draws one modifier. Drawn modifier cards go into the corresponding discard pile. Miss and critical schedule that modifier deck for a reshuffle at the **end of the round**. If a draw pile runs out sooner, its discards are reshuffled immediately.
- Guard reduces the resulting damage, after the modifier is applied. The journal records the modifier for every attack.
- Old local v0.3 saves receive fresh decks on load; for a clean test of the new monster initiative order start a **New Scenario**.
- These are streamlined, original prototype systems. They do not include Frosthaven's exact attack modifier deck composition, rolling modifiers, curse/bless mechanics, perk upgrades, all monster ability effects, or official monster card decks.

## Implemented

- Four original playable heroes with six cards each
- Simultaneous card commitment, initiative ordering, top/bottom actions
- Basic attack/move substitutes, movement range, healing, guard
- Hex board, rocks, walls, weighted monster pathfinding, melee and ranged enemies, HP, attack modifier decks, monster ability decks, loot
- Hand exhaustion and basic random-card recovery
- Scenario win/loss, journal, saved local hot-seat state, JSON export/import
- Optional 4-browser Firebase Realtime Database sharing and seat claims

## Not yet implemented

- Official Frosthaven rules fidelity: exact official modifier deck rules, rolling modifier cards, perk deck changes, full monster focus rules, exact official corner/edge LOS rulings, traps, ice, hazards, summons, advanced status conditions, advanced elements, full rests, loss abilities, broader scenario libraries, loot tables, outpost, crafting, campaign, item inventories and progression
- Robust multiplayer turn transactions and private selection (the prototype's selected cards are held in room state)
- Full campaign and mission editing

## Controls

During planning: each player selects TWO cards. The first card supplies the top action; the second the bottom action. This fixed assignment is a prototype simplification. Select which card provides initiative and lock in. During initiative resolution, click **Use** or **Basic** on each action, then a highlighted map hex, or **Skip**. Click **End turn** when finished.

## Architecture note

Current setup is a single file for ease of GitHub Pages deployment, plus Firebase room synchronization. Before scaling to a full campaign, move game rules to a deterministic reducer, store actions instead of full-state client overwrites, run transactions/validation on a trusted backend, and keep secret card selection per player.

## v0.5 — Conditions and elements (7 Nov 2026)

This original tactical prototype now supports seven conditions: Poison (+1 damage from attacks), Wound (1 damage at turn start), Immobilize (cannot move), Stun (loses its turn), Disarm (cannot attack), Strengthen (draw two attack modifiers, use better result) and Muddle (draw two, use worse result). Poison and Wound persist until healed; other conditions expire after the affected unit completes its next turn. These are intentionally simplified rules, not a reproduction of the official Frosthaven rules.

Cards and monster abilities now inflict selected conditions. The party panel and unit markers show conditions. Healing also removes Poison and Wound. Combat journal records condition changes, damage and elemental effects.

The shared element board contains Fire, Ice, Air, Earth, Light and Dark. Infusing sets an element to Strong (2); it becomes Waning (1) and then Inert (0) at successive round ends. Some original hero cards consume elements to give +1 power to their action. Element infusions apply when the relevant card action resolves. Cards which do not mention an element do not consume or infuse it.

Existing local/online v0.1–v0.4 saves are migrated to the v0.5 state schema. Browser hot-seat combat logic was exercised with automated JavaScript tests, but a full live four-device online session has not been verified; Firebase still uses prototype-level last-write-wins synchronization rather than a secure authoritative server.

## v0.6 — The Cinder Vault (new scenario)

Start **New Scenario** / **New local hot-seat game** to play the new three-chamber scenario. Earlier saves remain playable as the legacy **Ashen Pass** encounter. Save migration does not overwrite your existing map or enemies.

- Only the **Entryway** is visible initially. Doors at `(3,3)` and `(6,3)` reveal the **Cinder Gallery** and **Vault Sanctum**, respectively, when a hero **ends a movement action on the door hex**. A door is a traversable hex and is marked 🔒 when closed.
- Newly revealed rooms spawn their own enemy sets. Newly encountered enemy families gain an ability card and join at initiative 99 during the current round; a family whose initiative already passed waits until the next round. This is a **prototype simplification**, not a literal Frosthaven rule.
- Hidden rooms cannot be moved into, jumped into, flown into, or targeted. Doors are reachable from the revealed side even when the next room is fogged. Walls between rooms block movement and line of sight; normal rocks still block walking but not LOS.
- **Objective 1:** A hero must visit `(5,0)` to claim the **Archive Seal** (`✦`).
- **Objective 2:** Reveal the third chamber and defeat the **Flame Brute guardian**.
- **Objective 3:** A hero must visit the **extraction rune** at `(7,5)` (`⬡`). Complete all three objectives to win. Defeating all other enemies is optional.
- The scenario objectives panel shows current progress; the battle journal announces room reveals and objective updates. Scenario state persists in local/JSON/Firebase saves.

**Testing:** JavaScript syntax and Node-based scenario logic tests passed, covering hidden-room access, door movement, spawn counts, objective triggers, victory and v0.5 migration. Browser smoke testing is limited; four-device real-time Firebase testing is outstanding. Online state writes remain last-write-wins and not safe for production use.

### Firebase security notice

`database.rules.json` contains **minimal prototype-only** access rules. Any anonymous authenticated browser with a room code may read and modify a room, and seat reservations are not a secure identity/authorization system. Use only throwaway test game data, and do not publish this configuration as a secure public game backend.

## Automated browser smoke tests (Playwright / GitHub Actions)

The included `.github/workflows/browser-tests.yml` runs on **push**, **pull request**, and **manual dispatch**. It installs Node 22 and Chromium, runs `test_v06.js`, then performs five Playwright browser checks: page rendering, modal, all four hot-seat card selections, initiative and turn progression plus save reload, and reset behavior. Failed runs upload screenshots, traces, and an HTML report to the workflow's **Artifacts** section. A failure is reported as a failure rather than suppressed.

### Set up in GitHub
1. Create a GitHub repository (or use your Emberwatch repository) and upload **all the files and the hidden `.github` directory** from this folder to its root. If uploading through a ZIP, extract it first so that `.github/workflows/browser-tests.yml` is in the repository, not inside a nested `emberwatch/` directory.
2. Open **Actions → Emberwatch browser tests** to see the result of the first push. Select a run to see each step and download the HTML report artifact if something fails.
3. To test locally, install Node.js 22 and Python 3; run `npm install`, `npx playwright install chromium`, then `npm test` from the repository root.

This suite tests **offline single-browser / hot-seat gameplay**. It does **not** establish that Firebase room synchronization works, that four browsers can interact simultaneously, or that an entire scenario is winnable. Those require separate integration tests with an isolated Firebase test project and credentials. Do not put Firebase secrets in repository files.
