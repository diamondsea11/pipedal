# PiPedal Performance Fork: Changes from Upstream

This document describes the user-visible and architectural changes maintained
on `feature/multipath-v1`. It separates PiPedal source changes from software
installed only on the Raspberry Pi target.

## Baseline and Compatibility

- Git ancestry starts at upstream `v2.0.108` (`03676dc`).
- Upstream `v2.0.110` changes were integrated in commit `d379c55`.
- Existing single-path pedalboards remain valid. New fields have conservative
  defaults: one path, existing channel routing, global EQ off and input gate off.
- Presets produced by this fork contain extension fields that upstream PiPedal
  does not understand or reproduce.
- The production target is Raspberry Pi OS Lite on arm64. The UI remains a web
  application and is tested primarily with an iPad client.

## Audio Engine and Routing

- Dynamic ALSA multichannel detection avoids forcing genuine multichannel
  interfaces to stereo (`src/AlsaDriver.cpp`).
- Up to four independent paths provide interface-derived mono/stereo input and
  output choices, level, pan, mute, metering and routing templates
  (`src/AudioHost.*`, `src/Lv2Pedalboard.*`, `src/Pedalboard.*`).
- Paths may use hardware inputs or receive level-adjustable sends from other
  paths. Dragging a block downward creates a parallel split in the editor.
- Compatible preset changes preserve supported delay and reverb tails.
- Global EQ provides low/high cuts with selectable slopes, shelves and a
  parametric mid band. Graph and numeric edits are previewed in the audio thread
  in real time; the full pedalboard is persisted only when an edit is committed
  (`src/Lv2Pedalboard.*`, `GlobalEqDialog.tsx`).
- Every input terminal includes a linked-channel noise gate before the effect
  chain. Gate, threshold and decay are stored per path and in snapshots. The
  gate defaults off, uses a 20 ms hold and closes over the selected decay time.

## NAM Calibration

- TooB Neural Amp Modeler follows NAM Gateway calibration semantics when the
  capture provides calibration metadata. Full A2 model weight is the default.
- Interface input calibration is discovered by model/profile with an explicit
  per-device override. Babyface Pro FS uses 13 dBu by default.
- Details, formulas and limitations are in [NamCalibration.md](NamCalibration.md)
  and [ToobNamGatewayPatch.md](ToobNamGatewayPatch.md).
- The fork includes rebuilt arm64 TooB binaries. This part is unsuitable for a
  PiPedal-only source PR and should be proposed in the TooB Amp repository.

## Performance UI

- The signal-chain header, path controls and live Gig view are touch-oriented.
- Blocks use category colors and icons. Empty blocks open an inline category,
  manufacturer and search browser. Users can correct category assignments.
- Pointer context menus and touch long-press support copy, paste, duplicate and
  delete. File dialogs support marquee and multi-selection.
- Input and output terminals expose routing choices from the active interface,
  rather than only volume.
- Chow Tape, Calf, Dragonfly, Dusk and TooB NAM have tailored control layouts.
  Dusk MOD GUIs support numeric LV2 patch properties and live gain reduction
  when a plugin publishes reduction telemetry.

## MIDI and Snapshots

- The Control Hub provides preset, bank, snapshot, tuner, tap-tempo, path,
  global-EQ, bypass and parameter actions.
- Actions can be inherited from Base or overridden per snapshot. Controller
  profiles can be imported and exported.
- The MIDI monitor shows incoming events and matched actions for troubleshooting
  without SSH. Synthetic ALSA tests cover Note, CC and Program Change handling.
- MIDI connections distinguish inputs from outputs and identify BlueZ BLE-MIDI
  ports in the UI. Control Hub actions can send CC, Program Change and Note
  messages to selected USB or Bluetooth destinations. Offline destinations are
  restored automatically when a controller reconnects.
- MIDI actions use a responsive card editor with explicit PC, CC and Note
  fields and a large MIDI Learn control. A general `Add action` command is also
  available directly from the Control Hub block/parameter view.

## Host Compatibility and Performance

- LV2 bounded-block-length is advertised during scanning and at runtime.
- Generic numeric LV2 patch properties are editable and persisted.
- JUCE-style sidechain groups used by Dusk Multi-Comp are accepted.
- S24_LE capture scaling, NAM over-drive noise and avoidable single-path work
  were corrected. Measured Raspberry Pi results are recorded in `ROADMAP.md`.

## Repository Assets versus Target Installation

The repository contains reusable skin sources under `patches/` and
`modgui-skins/`. Dragonfly, Calf, LSP, Airwindows/Chow and Dusk plugin binaries
installed under `/usr/local/lib/lv2` on the test Pi are not all distributed by
this repository. Their licenses, releases and installation steps remain owned
by their respective projects.

## Validation Status

- TypeScript production build: passing.
- Native arm64 `pipedald` and `pipedaltest` builds: passing.
- JSON/preset multipath roundtrip and runtime-structure tests: passing.
- Live service startup and HTTP UI smoke test: required for each deployment.
- Physical loopback latency, non-RME multichannel hardware and complete foot
  controller acceptance remain open; see `ROADMAP.md`.
