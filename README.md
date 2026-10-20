# Frontline Dominion - Real-Time Browser Military Strategy RTS

**Frontline Dominion** is a fully functional, browser-based, persistent real-time strategy (RTS) game inspired by modern military grand strategy and combat games.

Players take command of forward tactical bases, establish defense networks, extract vital wartime materials, manufacture combined-arms land, air, naval, and armored rail units, navigate a large tactical map with obstacle-avoiding A* pathfinding, engage in real-time combat, coordinate alliances, and capture enemy bases.

---

## Key Features

1. **Persistent Tactical Map & Seeded World**:
   - 100x75 tactical battlefield with grasslands, plains, forests, mountains, rivers, paved highways, railway networks, and bridges.
   - Deterministic PRNG seed ensures reproducible world generation for fair multiplayer testing.
   - Dynamic Fog of War with scouting vision radius per unit and base.
   - Radar minimap with real-time unit and base indicators, camera frustum, and click-to-jump.

2. **Full Combined-Arms Military Catalog (13 Units)**:
   - **Ground**: Vanguard Scout Buggy (fast recon), Ironclad APC (armored support), Titan MBT (heavy direct fire), Goliath Heavy Howitzer (extreme siege standoff range), Skyguard Vulcan (rotary flak anti-air), Dominator Command Vehicle (base conquest uplink).
   - **Air**: Hawk Recon Helicopter (aerial spotting), Cobra Gunship (air-to-ground missiles), Stormbringer Interceptor (mach-2 air superiority), Thunderbolt Heavy Bomber (ground carpet bombing).
   - **Naval**: Wavecutter Corvette (fast patrol boat), Trident Guided-Missile Destroyer (cruise missiles & CIWS).
   - **Rail**: Iron Dreadnought (armored twin-railgun siege train restricted to railway corridors).

3. **Real-Time Point-and-Click RTS Controls**:
   - Left-click to select units or bases.
   - Left-drag box selection to select multiple units at once.
   - Shift-click to add or remove units from selection.
   - Right-click to issue contextual Move, Attack, or Attack-Move orders.
   - Tactical order actions: Move (M), Attack (A), Hold (H), Patrol (P), Retreat (R), Stop (S).
   - Control Groups: Ctrl + 1-5 to assign, 1-5 to instantly recall.
   - Smooth continuous camera panning via WASD / Arrow keys and mouse wheel zooming.
   - Spacebar to jump camera to Home Base.

4. **Resource Economy & Base Construction**:
   - Four vital resources: Concrete, Steel, Aluminum, and Fuel.
   - Automated factory extraction over time with configurable storage caps.
   - Real-time construction and unit production queues with live timers.
   - Offline progression calculation: resources and queues advance while players are away.

5. **Authoritative Server Combat & Base Conquest**:
   - Server-authoritative 5Hz simulation tick loop.
   - Target acquisition, range checks, weapon cooldowns, and damage modifiers (e.g. Flak vs Air = 2.4x).
   - Base defense turrets (Vulcan Turret, SAM Battery, Coastal Gun) auto-fire at hostiles.
   - Base capture system: neutralize base defenses and deploy a Dominator Command Vehicle into the perimeter to capture the base and seize its factories!

6. **Procedural Web Audio Sound Synthesizer**:
   - Zero external audio files required: realistic cannon blasts, machine gun bursts, missile launches, flak bursts, explosions, base alarms, and command clicks synthesized using the Web Audio API.

7. **Multiplayer, Alliances & Tactical Comms**:
   - Socket.IO real-time multiplayer synchronization.
   - Global chat, Alliance-only comms, and real-time Combat Event feeds.
   - Clickable map coordinates `[X, Y]` in chat that instantly center the camera on the target.
   - In-game alliance creation, roster browsing, and diplomacy.

8. **Admin Sandbox & Testing Suite**:
   - Built-in Sandbox modal to spawn friendly or enemy units, add resources, and stress test combat.
   - Automated unit tests covering world generation, pathfinding, unit catalog balance, and base conquest.

---

## Development Setup & Installation

### Prerequisites
- Node.js (v18 or higher, Node 20/22 recommended)
- npm

### Installation
```bash
npm install
```

### Run Automated Tests
```bash
npm test
```

### Launch Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

### Build for Production
```bash
npm run build
npm start
```

---

## Environment Variables
See `.env.example`:
- `PORT`: Server port (defaults to 3000)
- `NODE_ENV`: `development` or `production`
