# Frontline Dominion — Complete Playable 3D RTS Upgrade

Transform **Frontline Dominion** from a 2D canvas tactical strategy game into a genuinely playable, real-time 3D military strategy experience powered by Three.js (`WebGLRenderer`), preserving the deterministic $100 \times 75$ battlefield grid, 4-resource economy, authoritative multiplayer server simulation, and full unit/building roster while adding an intelligent enemy AI skirmish commander and a collapsible modern military command HUD.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions incorporate your confirmed preferences and define how the 3D upgrade will be executed across the engine, simulation, and command interface.

- **Confirmed Decision 1 — Hybrid 3D Asset & Procedural PBR Pipeline**: Existing local Kenney City Kit (Industrial) GLB models (`building-a.glb` through `building-t.glb`, chimneys, storage tanks, detail props) are loaded via `GLTFLoader` with automatic caching and fallback safety for military bases and industrial facilities, while all 13 combat unit types (ground vehicles, tanks, artillery, anti-air, helicopters, jets, naval warships, and the Iron Dreadnought rail siege train) plus defensive turrets are constructed as multi-part 3D `THREE.Group` hierarchies with articulated turrets, barrels, rotors, and team color markings.
- **Confirmed Decision 2 — Instant Offline AI Skirmish + Authoritative Multiplayer Sync**: Entering the game launches an immediately playable 3D battlefield where an autonomous Enemy AI Commander (`Kodiak PMC`) actively harvests resources, constructs facilities, produces counter-units, scouts, attacks, and captures neutral bases across configurable difficulty levels (`Easy`, `Normal`, `Hard`), synchronized seamlessly with the authoritative 5Hz Socket.IO server simulation and local offline fallback.
- **Confirmed Decision 3 — Realistic Modern Military Command HUD with Collapsible Bottom Dock**: The 3D viewport occupies 100% of the screen with zero side-panel clutter. A sleek top strategic bar displays live resources, supply/unit counts, faction status, AI difficulty controls, and connection telemetry, while a unified, collapsible bottom command dock houses unit telemetry, multi-unit selection rosters, tactical order buttons (`Move`, `Attack-Move`, `Attack`, `Patrol`, `Hold`, `Retreat`, `Stop`), base construction/production queues, and the interactive 2D/3D-synchronized tactical minimap.

---

### 1. Overview & Core Concept

- **What It Does**: Upgrades Frontline Dominion into a full 3D real-time strategy game where players command ground armor, aircraft, naval fleets, and railway siege trains across a 3D elevated terrain map of grasslands, forests, mountain peaks, rivers, bridges, highways, and rail corridors. All unit selection, box-selection, formation movement, A* pathfinding, turret tracking, projectile ballistics, base capture, and fog-of-war visibility operate directly in 3D space.
- **Target Audience / Persona**: PC real-time strategy players and tactical commanders looking for an immediate, responsive browser-based 3D RTS combining base building, 4-resource logistics (`Concrete`, `Steel`, `Aluminum`, `Fuel`), combined-arms warfare, and both AI skirmish and multi-user online battles.
- **Key Value**: Delivers true 3D spatial depth—elevated mountain ridges, depressed river basins, banking aircraft at flight altitude, rotating radar dishes and tank turrets, physical projectile trajectories, and instanced forests—without sacrificing high frame rates, deterministic pathfinding, or authoritative multiplayer synchronization.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Immediate Battlefield Deployment & Camera Navigation**: Upon launch, the camera frames the player's home base (`Fortress Alpha`) from an elevated angled RTS perspective. Players pan smoothly with `WASD`/Arrow keys, middle-mouse drag, or optional screen-edge scrolling; orbit/rotate with right-mouse drag; zoom smoothly from strategic theater overview to close tactical inspection with the scroll wheel; press `Space` or `H` to return to HQ; or click anywhere on the tactical minimap to glide the camera to that sector.
  2. **3D Raycast Selection & Box Selection**: Left-clicking a 3D unit or base selects it and illuminates a crisp ground selection ring and floating health bar. Left-dragging draws a 2D screen-space selection marquee that projects all enclosed player units into the active selection group. `Shift + Click` toggles individual units in/out of the selection, and `Ctrl + 1–5` / `1–5` binds and recalls control groups.
  3. **Tactical Orders & Formation Pathfinding**: Right-clicking passable 3D terrain issues a formation-aware move order with an animated 3D destination ring and A* waypoint path calculation respecting unit domain (`ground`, `air`, `naval`, `rail`). Right-clicking a hostile unit or base issues a direct attack or conquest order. Pressing `A` (or clicking `Attack-Move`) enters targeting mode so units engage hostiles along their route.
  4. **Base Industrial Management & Unit Production**: Selecting an owned base opens the integrated facility & production tab in the bottom command dock. Players construct or upgrade 22 building types (Command Centers, Concrete Works, Steel Foundries, Aluminum Smelters, Fuel Refineries, Vehicle Factories, Aviation Hangars, Naval Dockyards, Rail Depots, Vulcan Turrets, SAM Batteries, Coastal Guns) and queue units with live progress timers and visual rally deployment outside the compound perimeter.
  5. **Skirmish AI & Base Conquest**: Players battle the `Kodiak PMC` AI commander (adjustable between `Easy`, `Normal`, and `Hard` difficulty). To capture neutral or enemy bases, forces must reduce the base's defense shield below threshold and move a `Dominator Command Vehicle` within capture radius until the uplink completes.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian modern PC military command aesthetic inspired by classic and contemporary tactical RTS titles—restrained olive/slate military palette, physically based metallic and matte armor surfaces, warm directional sunlight paired with cool sky hemisphere fill, and distance horizon fog.
  - *Color Palette & Mood*:
    - **60% Battlefield Canvas & Terrain**: Natural temperate greens (`#3f5e36`, `#4f6f42`), rocky mountain slate (`#5c6166`), alpine snow peaks (`#dce3ea`), deep river/coastal water (`#184e68`), and warm asphalt/ballast corridors.
    - **30% Structural HUD Surfaces**: Deep obsidian command panels (`rgba(15, 23, 42, 0.92)`) with crisp `1px solid rgba(148, 163, 184, 0.18)` hairline borders (no `backdrop-filter` blur over the active WebGL canvas to guarantee zero GPU/software-WebGL compositing stalls).
    - **10% High-Intent Tactical Accents**: Friendly Dominion Blue (`#3b82f6`), Hostile Kodiak Crimson (`#ef4444`), Neutral Frontier Amber (`#f59e0b`), and Emerald Selection/Resource indicators (`#10b981`).
  - *Typography & Hierarchy*:
    - **Display / Command Headers**: `Chakra Petch` or `Barlow Condensed` (SemiBold/Bold, tight tracking) for tactical headers, unit designations, and sector titles.
    - **UI Body & Descriptions**: `Plus Jakarta Sans` (Regular/Medium) for clean legibility across command tooltips, building descriptions, and combat logs.
    - **Telemetry, Coordinates & Resource Counters**: `JetBrains Mono` with `tabular-nums` (`font-variant-numeric: tabular-nums`) so resource tickers, cooldowns, health ratios, and grid coordinates never jitter horizontally.
  - *Component Styling & Layout*:
    - **Unobstructed 3D Viewport**: The Three.js canvas fills `100vw × 100vh`.
    - **Top Strategic Bar**: Single-row header displaying the 4 live resource counters + per-second rates, active unit/population count, owned base count, AI Skirmish difficulty selector & match controls, and secondary modal triggers (`Intel`, `Alliance`, `Map Editor`, `Help`, `Audio`, `Commander Profile`).
    - **Collapsible Bottom Command Dock**: Pinned to bottom-center (`max-width: min(1180px, 96vw)`) with a `▾ Hide HUD / ▴ Show HUD` zen-mode toggle (`Z` key) and integrated 3-column tactical layout:
      1. *Left*: Interactive 2D/3D-synchronized Tactical Minimap with Fog-of-War mask, unit blips, base ownership icons, and live 3D camera frustum trapezoid.
      2. *Center*: Selected Unit / Group Inspector or Base Facility & Production Queue matrix with unboxed metadata (`·` separators) and live progress bars.
      3. *Right*: Tactical Order Matrix (`Move`, `Attack-Move`, `Attack`, `Patrol`, `Hold`, `Retreat`, `Stop`) and Control Group quick-slots (`1–5`).

- **Interactive Feedback & Motion**:
  - Frame-rate independent exponential camera damping (`THREE.MathUtils.damp`) for panning, orbiting, zooming, and minimap jump transitions.
  - 3D animated ground rings for move orders (emerald pulse), attack orders (crimson target reticle), and invalid destination feedback (amber warning flash).
  - Real-time turret slewing toward target vectors, muzzle flash point lights/sprites, ballistic artillery arcs, smoky SAM/Hellfire missile trails, water wakes for naval ships, rotating helicopter blades, and pooled multi-stage explosions with rising smoke plumes and scorch marks.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Unified Authoritative Grid-to-3D World Coordinate Mapping**
  - *Chosen Approach*: Map each logical grid cell $(x, y) \in [0..99] \times [0..74]$ to 3D world space $(X, Y, Z)$ where $X = x \times S$, $Z = y \times S$ (with world scale $S = 4.0$ units per tile), and $Y = \text{elevationAt}(x, y)$ derived deterministically from terrain type (`deep_water` = $-0.8$, `water` = $-0.35$, `plains/grass/road` = $0.0$, `hills` = $+1.4$, `rock` = $+2.6$, `mountain` = $+4.5$, `snow` = $+6.2$, bridges spanning at $Y = +0.35$ over water, and air units cruising at $Y = \text{ground} + 5.5$).
  - *Why*: Preserves 100% compatibility with existing server simulation coordinates, A* pathfinding (`findPath`), weapon ranges, base capture radii, and persistence snapshots while providing genuine 3D elevation, slopes, bridges, and altitude separation.
  - *Alternatives Considered*: Replacing grid coordinates with continuous navmesh coordinates on the server was rejected because it would break existing unit tests, saved states, and deterministic tile passability rules.

- **Decision 2: Chunked/Merged Terrain Geometry + Instanced Environmental Meshes**
  - *Chosen Approach*: Build the $100 \times 75$ 3D terrain as a continuous vertex-colored and procedurally textured heightfield `BufferGeometry` with smooth bevel/slope transitions between adjacent tiles, overlaid with raised 3D road/highway/railway spline/tile meshes, 3D bridge trusses, animated water surface shaders/materials, and `THREE.InstancedMesh` batches for all forest trees (Oak, Pine, Birch, Cedar), bushes, and boulders.
  - *Why*: Keeps draw calls low (< 50 for the entire environment) and eliminates the "7,500 individual cubes" bottleneck while delivering lush forests, readable roads/railways, and smooth 60 FPS performance on standard laptops and software WebGL environments.
  - *Alternatives Considered*: Creating 7,500 separate `THREE.Mesh` tiles was rejected due to severe draw-call overhead.

- **Decision 3: Hybrid Kenney GLB Loader + Multi-Part Articulated Unit Factory**
  - *Chosen Approach*: Expose `/assets_kenney/Models/GLB format/` via static server routing (`/assets/models/kenney/*.glb`) and load industrial buildings, smokestacks, storage tanks, and detail meshes via `GLTFLoader` with an automatic procedural PBR fallback so buildings render immediately and upgrade seamlessly when GLBs finish loading. Build all 13 unit types and 8 defensive structures via a dedicated `UnitModelFactory` that returns a hierarchical `THREE.Group` with named articulated sub-nodes (`turret`, `barrel`, `mainRotor`, `tailRotor`, `wheels`, `teamStripe`).
  - *Why*: Combines authentic Kenney 3D industrial kit geometry for bases with purpose-built, articulated military vehicles, aircraft, warships, and rail dreadnoughts that can rotate turrets, elevate barrels, and spin rotors during combat.
  - *Alternatives Considered*: Relying solely on static GLBs for units was rejected because the workspace only contains the Kenney Industrial building kit, not military tanks/helicopters/ships.

- **Decision 4: Server-Integrated & Offline-Capable Autonomous Skirmish AI**
  - *Chosen Approach*: Implement a dedicated `EnemyAICommander` module that runs on a 2-second strategic decision cadence (both inside the server simulation loop for `enemy_insurgent` / `Kodiak PMC` and in client offline skirmish mode). The AI evaluates its base economy, constructs missing production/economy/defense buildings, queues balanced unit compositions (plus counter-units based on visible player forces), dispatches recon scouts, assigns attack squads with formation waypoints, retreats critically damaged high-value units, and deploys `Dominator Command Vehicles` to capture neutral bases.
  - *Why*: Guarantees an immediately engaging, fair opponent that obeys the exact same resource costs, build timers, fog-of-war visibility, and pathfinding constraints as the player without per-frame CPU spikes.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                        FRONTLINE DOMINION — 3D RTS ARCHITECTURE                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌────────────────────────────────────┐      ┌────────────────────────────────────┐  │
│  │   AUTHORITATIVE SERVER & AI LOOP   │      │    CLIENT GAME STATE & ADAPTER     │  │
│  │  • 5Hz Simulation Tick (200ms)     │◄────►│  • Socket.IO Sync + Offline Mode   │  │
│  │  • 1Hz Economy & Production Queue  │ WS / │  • Snapshot Interpolation Buffer   │  │
│  │  • A* Pathfinding & Formation Calc │ REST │  • Fog-of-War Visibility Grid      │  │
│  │  • Enemy AI Commander (Easy/N/Hard)│      │  • Control Groups (1–5) & Selection│  │
│  └─────────────────┬──────────────────┘      └─────────────────┬──────────────────┘  │
│                    │                                           │                     │
│                    ▼                                           ▼                     │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │                       THREE.JS 3D BATTLEFIELD ENGINE                           │  │
│  │                                                                                │  │
│  │  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  │  │
│  │  │ 3D World & Terrain   │  │ Hybrid Model Factory │  │ RTS Camera & Input   │  │  │
│  │  │ • 100x75 Heightfield │  │ • Kenney GLB Loader  │  │ • WASD/Edge/MMB Pan  │  │  │
│  │  │ • 3D Roads/Rail/Water│  │ • 13 Articulated 3D  │  │ • RMB Orbit & Zoom   │  │  │
│  │  │ • Bridges & Bases    │  │   Unit Hierarchies   │  │ • 3D Raycast & Box   │  │  │
│  │  │ • Instanced Forests  │  │ • Turrets & Defenses │  │   Marquee Selection  │  │  │
│  │  │ • 3D Fog of War Mask │  │ • Team Color PBR     │  │ • Order Ground Rings │  │  │
│  │  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘  │  │
│  │                                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                Pooled Combat VFX & Ballistics System                     │  │  │
│  │  │  • Turret Slew & Barrel Elevation   • Pooled Shells, Missiles & Tracers  │  │  │
│  │  │  • Multi-Stage Explosions & Smoke   • Floating 3D Health & Shield Bars   │  │  │
│  │  └──────────────────────────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                        │                                             │
│                                        ▼                                             │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │                 MODERN MILITARY COMMAND HUD (REACT OVERLAY)                    │  │
│  │  ┌──────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Top Strategic Bar: 4 Resources + Rates | Units | AI Difficulty | Modals  │  │  │
│  │  └──────────────────────────────────────────────────────────────────────────┘  │  │
│  │  ┌───────────────────────┬──────────────────────────┬───────────────────────┐  │  │
│  │  │ Tactical Minimap      │ Unit / Base Inspector    │ Command & Order Matrix│  │  │
│  │  │ • Terrain & Fog Layer │ • Unit Stats & Telemetry │ • Move / Attack-Move  │  │  │
│  │  │ • Live Unit/Base Blips│ • Multi-Unit Group Grid  │ • Patrol / Hold / Stop│  │  │
│  │  │ • 3D Camera Frustum   │ • Base Build & Unit Queue│ • Control Groups 1–5  │  │  │
│  │  └───────────────────────┴──────────────────────────┴───────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

#### Data Model & State Synchronization

- **World & Terrain Coordinate Model**:
  - Logical Grid: $100 \times 75$ cells (`TerrainType[][]`), deterministic seed `202610` (or custom skirmish seed).
  - 3D World Conversion: `gridToWorld(gx, gy)` converts logical $(x, y)$ to $(x \times 4.0, \text{getTerrainElevation}(x, y), y \times 4.0)$, and `worldToGrid(wx, wz)` converts 3D raycast intersection points back to logical grid coordinates $(wx / 4.0, wz / 4.0)$ with full unit-tested round-trip accuracy.
- **Unit & Interpolation State**:
  - Authoritative unit state (`id`, `type`, `ownerId`, `x`, `y`, `rotation`, `health`, `maxHealth`, `command`, `path`, `targetUnitId`, `targetBaseId`, `kills`, `homeBaseId`) is maintained by the simulation engine.
  - Client 3D entities store interpolated visual transforms (`renderX`, `renderY`, `renderZ`, `renderRotation`, `turretRotation`, `rotorAngle`) updated smoothly each animation frame via `THREE.MathUtils.damp` so 5Hz server snapshots render at 60 FPS without stutter or teleportation.
  - Formation Assignment: Group movement commands compute offset slots (`computeFormationOffsets(units, targetX, targetY, terrain)`) arranged in a tactical rank/wedge around the destination tile, ensuring each unit receives a valid passable tile for its `UnitCategory` (`ground`, `air`, `naval`, `rail`) and separating nearby units during movement.
- **Enemy AI State & Difficulty Profiles**:
  - Configurable difficulty (`easy` | `normal` | `hard`) stored in simulation state and controllable via REST/Socket (`ai:set_difficulty` and `skirmish:reset`).
  - AI state tracks scouted sectors, active squad assignments (`defense`, `harass`, `siege`, `capture`), build priorities, and counter-production weights (e.g., prioritizing `skyguard_aa` and `sam_launcher` when player fields air units, or `titan_mbt` and `goliath_howitzer` against heavy ground defenses).

#### Interactive Component & State Mapping

1. **3D Viewport & Raycasting Controller**:
   - Pointer down/drag/up on `<canvas>` distinguishes single click (< 6px drag) from box-selection marquee ($\ge 6\text{px}$ drag).
   - Single left-click raycasts against dedicated selectable layers (Unit hitboxes and Base compound meshes), supporting `Shift` multi-select.
   - Right-click (when not orbiting camera or when quick-clicked) raycasts against enemy units/bases (issuing `attack` command) or terrain mesh (issuing `move` command, or `attack_move` if targeting mode is active).
   - Validates destination passability for the selected unit categories; if unreachable (e.g., commanding a naval ship onto land or the Iron Dreadnought off railway tracks), displays a clear 3D red/amber invalid-order indicator and HUD toast message.
2. **Collapsible Bottom Command Dock**:
   - **Tactical Order Buttons**: Clicking `Move (M)`, `Attack-Move (A)`, `Attack (T)`, `Patrol (P)`, `Hold (H)`, `Retreat (R)`, or `Stop (S)` immediately dispatches the corresponding command or activates targeting cursor mode with visual active-state feedback.
   - **Base Construction & Unit Production Tabs**: Selecting an owned base switches the center dock panel between *Overview & Defenses*, *Construct / Upgrade Facilities* (showing all valid buildings from `BUILDING_CATALOG` with 4-resource costs, level badges, and build timers), and *Deploy Combat Units* (filtering `UNIT_CATALOG` by required facility, showing live training progress bars, and enabling one-click enqueueing).
3. **Top Strategic Bar & Skirmish Controls**:
   - Displays live `Concrete`, `Steel`, `Aluminum`, and `Fuel` stockpiles + net production rates, total unit count, owned bases, AI difficulty selector (`Easy` / `Normal` / `Hard`), `New Skirmish` reset trigger, camera reset (`Reset View`), and existing modal launchers (`Intel`, `Alliances`, `Map Editor`, `Shortcuts`, `Account`).
