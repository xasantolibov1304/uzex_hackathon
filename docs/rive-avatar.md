# UZEX 2.0 agent avatar — Rive spec

This document is everything you need to build the agent avatar in Rive so it works in the app on first try.
The app is already wired: when `client/public/avatar.riv` exists, the app plays it. If not, it falls back to the current 3D cube.

---

## 1. Hard rules (the app depends on these exact names)

| What | Value |
|---|---|
| Artboard name | `Avatar` (make it the main/default artboard in the file) |
| Artboard size | **512 × 512**, transparent background (no fill on the artboard) |
| Logo size at rest | The logo square must be **338 × 338** (66% of 512), centred. The header logo slot relies on this. |
| State machine name | `Avatar` |
| Export file | `avatar.riv` → put it in `client/public/avatar.riv` |

### Inputs (create them in the `Avatar` state machine, names are case-sensitive)

| Input | Type | Values | Who sets it |
|---|---|---|---|
| `state` | Number | `0` idle · `1` thinking · `2` working · `3` speaking · `4` listening | The app, whenever the agent changes what it is doing |
| `mood` | Number | `0` calm · `1` happy · `2` excited · `3` concerned | The app, based on the agent's reply tone |
| `level` | Number | `0`–`100` | The app, ~60 times a second while the agent speaks or the mic listens (voice volume) |
| `pulse` | Trigger | — | The app, once each time the agent finishes a step |

You don't have to use every input. Missing inputs are simply ignored by the app.

---

## 2. Brand

The logo is a 2×2 grid of sharp squares (no rounded corners, no gaps):

| Position | Colour |
|---|---|
| Top-left | `#12C26B` (green) |
| Top-right | `#3EE28C` (mint) |
| Bottom-left | `#5B80EC` (periwinkle) |
| Bottom-right | `#3E5FD8` (blue) |

Build each of the 4 squares out of **4 smaller squares (2×2)**, so the logo is really a **4×4 grid of 16 tiles**.
At rest they touch with no gaps and look exactly like the flat logo. That lets every state "open up" the tiles.

The app background is near-white with soft green. Avoid dark fills and heavy black shadows. Use soft coloured glows instead.

---

## 3. What each state should look like

Keep motion smooth, calm and premium (think Apple / Stripe), never bouncy-cartoon.
Every state must loop seamlessly, and every transition between states should blend over ~0.3–0.5 s.

**0 — Idle (kutish).** The flat logo, perfectly still, 16 tiles touching. Optional: a very soft diagonal shine sweeps across every ~6 s. This version also shows at 30 px in the header, so no small details.

**1 — Thinking (o'ylash).** Tiles separate slightly (small gaps ~4% of tile size). A gentle brightness wave runs diagonally across the tiles (top-left → bottom-right, ~1.5 s cycle). The whole grid tilts a few degrees back and forth.

**2 — Working (ishlash).** The busiest state. Gaps open more (~8%). Rows and columns slide like a Rubik's cube: a row shifts one tile sideways and the tile leaving one edge enters on the other side. Do this every ~0.35 s on different rows/columns. Optional: the grid turns 90° now and then. Must still loop cleanly (the final arrangement equals the first).

**3 — Speaking (gapirish).** Tiles go back to the logo arrangement with small gaps. Each tile scales up and down with `level` (0 = rest, 100 = biggest, about +25%), with centre tiles reacting more than corner tiles, like an equaliser. Add a soft green/blue glow behind the grid whose opacity follows `level`.

**4 — Listening (tinglash).** A ripple moves outward from the centre through the tiles (scale + brightness, ~1 s cycle). Colours shift slightly toward cyan. `level` (microphone volume) makes the ripple stronger.

**Moods** (layer on top of any state):
- `0` calm — the brand colours above.
- `1` happy — all four colours ~10% lighter.
- `2` excited — slightly more saturated colours and faster motion (~1.3×).
- `3` concerned — colours shift to amber/coral: `#E2A026`, `#F4C052`, `#E87A5C`, `#CC5C48`, with slower motion.

**`pulse` trigger:** a quick, subtle "pop" of the whole grid (scale up ~6% and back, 0.25 s). Plays on top of the current state.

---

## 4. Prompts for Rive's built-in agent

Paste these one at a time and check the result after each. Adjust by hand where needed.

**Prompt 1 — setup**
> Create an artboard named "Avatar", 512×512, with a transparent background. In the centre, draw a 338×338 square made of a 4×4 grid of 16 equal square tiles with no gaps and sharp corners. Colour the top-left 2×2 tiles #12C26B, the top-right 2×2 tiles #3EE28C, the bottom-left 2×2 tiles #5B80EC and the bottom-right 2×2 tiles #3E5FD8. Name the tiles t00 to t33 by row and column.

**Prompt 2 — state machine and inputs**
> Create a state machine named "Avatar" with these inputs: a Number input "state", a Number input "mood", a Number input "level" (0 to 100) and a Trigger input "pulse". Create five looping states: Idle, Thinking, Working, Speaking, Listening. Transition to each one when "state" equals 0, 1, 2, 3 or 4 respectively, from any state, with a 0.4 second blend.

**Prompt 3 — idle and thinking**
> Idle animation: keep the 16 tiles still and touching, with a soft white diagonal shine (20% opacity) sweeping from top-left to bottom-right every 6 seconds. Thinking animation: separate the tiles with small gaps, run a brightness wave diagonally across the tiles every 1.5 seconds, and tilt the whole grid back and forth by 3 degrees. Both must loop seamlessly.

**Prompt 4 — working**
> Working animation: open gaps between tiles (about 8% of tile size). Every 0.35 seconds, slide one row or column by one tile like a Rubik's cube, with the tile leaving one edge re-entering on the opposite edge (clip the grid to its square). Use smooth ease-in-out. Make the sequence return to the starting arrangement so it loops seamlessly, about 4 seconds long.

**Prompt 5 — speaking and listening with level**
> Speaking animation: tiles in the logo arrangement with small gaps. Bind each tile's scale to the "level" input so that level 0 is scale 1.0 and level 100 is scale 1.25, with centre tiles reacting more than corner tiles. Add a soft blurred glow behind the grid, mixing #3EE28C and #5B80EC, whose opacity follows "level". Listening animation: a ripple of scale and brightness moving outward from the centre through the tiles every second, colours shifted slightly toward cyan, with ripple strength driven by "level".

**Prompt 6 — mood and pulse**
> Add a mood layer driven by the "mood" input: 0 keeps the original colours; 1 makes them 10% lighter; 2 makes them more saturated; 3 changes them to #E2A026, #F4C052, #E87A5C and #CC5C48. Blend colour changes over 0.6 seconds. When the "pulse" trigger fires, scale the whole grid to 106% and back over 0.25 seconds, on top of whatever is playing.

---

## 5. Testing in Rive before exporting

In the state machine panel, use the input controls on the right:
1. Set `state` to 0 → 4 in turn and check each loop and transition.
2. With `state` = 3, drag `level` from 0 to 100 and back. Tiles should grow and shrink smoothly.
3. Fire `pulse` a few times.
4. Shrink the preview to about 30 px and check Idle still reads as the logo.

## 6. Export

1. **Export → for runtime (.riv)**.
2. Save it as `client/public/avatar.riv` in the project (replace the old one if there is one).
3. Reload the app. The header logo and the centre avatar now use your Rive file.

On the free plan, exports show a Rive splash screen. Upgrade before the investor demo so it's gone.

To check it without the agent, open `http://localhost:3000/avatar-lab.html`: the state and mood buttons and the level slider drive the same inputs.
