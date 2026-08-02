# PiPedal Performance Roadmap

This roadmap tracks the Helix-inspired performance work on top of PiPedal
2.0.110. "Complete" means implemented and included in a tagged build. Hardware
acceptance items remain open until they have been exercised with real audio and
MIDI controllers.

## Complete

- [x] Preserve a known-good 2.0.108 baseline (`statusquo-2.0.108-codex6`).
- [x] Detect multichannel ALSA interfaces dynamically without forcing genuine
  multichannel devices to stereo.
- [x] Support up to four independent signal paths with selectable hardware
  inputs, mute, pan and level controls.
- [x] Route each path to the main mix, a mono hardware output or a stereo
  hardware output pair discovered from the active interface.
- [x] Provide practical routing templates for common guitar, vocal and parallel
  processing layouts.
- [x] Include path mix and routing state in presets and snapshots.
- [x] Preserve reverb and delay tails during compatible preset changes.
- [x] Add block copy, paste, duplicate and delete actions, including pointer
  context menus and touch long-press handling.
- [x] Add performance MIDI actions derived from the Tonex controller workflow:
  preset/bank navigation, snapshot selection, tuner, tap tempo, path mute,
  global EQ, bypass and parameter control.
- [x] Add a Helix-style plugin browser with functional categories,
  subcategories, color cues, favorites and search.
- [x] Show the categorized plugin browser directly in the lower editor when an
  empty block is selected, with global text search and category tags.
- [x] Prefer name and display-type evidence when categorizing plugins so effects
  such as reverbs are not hidden under misleading LV2 classes.
- [x] Apply NAM capture calibration automatically when calibration metadata is
  available, with interface-specific input calibration profiles and a 13 dBu
  Babyface Pro FS profile.
- [x] Align TooB Neural Amp Modeler calibration and quality defaults with the
  NAM Gateway workflow.
- [x] Add tailored web skins for TooB NAM, Chow, Calf and Dragonfly plugins.
- [x] Add functional gain-reduction metering where the LV2 plugin publishes a
  real-time reduction value.
- [x] Install and scan Dragonfly, Calf, LSP, Airwindows/Chow-family and Dusk
  Audio LV2 plugins on the Raspberry Pi target.
- [x] Support numeric LV2 `patch:` properties in the generic PiPedal web UI.
  This exposes Dusk Audio controls that are not conventional LV2 control ports.
- [x] Advertise the LV2 bounded-block-length feature at runtime as well as
  during scanning, which is required by DuskVerb.
- [x] Accept JUCE-style sidechain port groups used by Dusk Multi-Comp.

## Validation Pending

- [ ] Run a repeatable round-trip latency measurement with a physical cable at
  the selected sample rate, period size and period count.
- [ ] Exercise every Dusk Audio effect with real audio, save/reload its state
  and verify automation for representative numeric, toggle and enum controls.
  All seven effects now pass isolated DSP runs in PiPedal's own 64-frame LV2
  host; the remaining work is audible signal and UI save/reload acceptance.
- [x] Record CPU, temperature and XRUN results for representative live rigs at
  48 kHz with 48-, 64- and 96-frame periods.
- [ ] Perform an end-to-end MIDI acceptance pass with the intended foot
  controller, including press, release, long press, expression, channel
  filtering and snapshot changes.
  Synthetic ALSA input has verified Program Change, CC and Note events from
  `PiPedal:in` through to preset switching and the web activity monitor.
- [ ] Verify input and output routing on at least one non-RME multichannel
  interface to guard against device-specific assumptions.

## Next Features

- [x] Replace the routing template selector with a compact visual split/merge
  editor while retaining templates as fast starting points.
- [x] Add explicit send/return blocks so parallel paths can share selected
  effects without duplicating processor instances.
- [x] Add per-path input and output meters to make gain staging and hardware
  routing visible before opening an effect.
- [x] Add reusable MIDI controller profiles and an import/export format for
  complete assignments.
- [x] Add a MIDI activity and action monitor for troubleshooting controller
  mappings without SSH access.
- [x] Add BLE-MIDI-aware input selection and explicit external MIDI output
  routing for Control Hub CC, Program Change and Note actions.
- [x] Add focused, grouped Dusk Audio skins. DuskVerb, Multi-Comp, Multi-Q,
  4K EQ, both TapeMachine variants and Spectrum Analyzer now use compact
  processor-specific groups; Multi-Comp also exposes its live GR telemetry.
- [x] Add automated integration tests for path routing, snapshot restoration,
  plugin duplication and generic LV2 patch-property persistence.
- [x] Add a per-path, linked-channel input noise gate with threshold and decay
  controls in each input terminal and snapshot/preset persistence.

## Build Line

- Base release: `2.0.110`
- Current development branch: `feature/multipath-v1`
- Current tagged build: `pipedal-2.0.110-codex22`
- Current package build: `2.0.110+codex22`

## Performance Record

- Current Fender Clean live rig, 48 kHz, three periods, 35-second steady-state
  windows: 48 frames = 6 underruns, 64 frames = 2, 96 frames = 3.
- DSP headroom averaged 27.9-30.0%; short peaks, rather than average CPU load,
  caused the remaining underruns. Soak temperature stayed between 51.6 and
  52.7 degrees C.
- 64 frames is the selected live default for this rig; it provided the best
  measured stability without the latency increase of 96 frames.
- A physical round-trip latency result still requires a cable from a selected
  Babyface output to an input. The installed tester detects the interface as
  `hw:Pro73095311`; no mixer loopback control is exposed through ALSA.
- 4K EQ, DuskVerb, Multi-Comp, Multi-Q, Spectrum Analyzer, TapeMachine and
  TapeMachine 2 each completed an isolated PiPedal-hosted DSP run at 64 frames
  with exit status zero.
- Synthetic ALSA acceptance verified CC 7 values 100 and 0 and Note 60 velocity
  127 in the web monitor. Program Change switched presets correctly; the
  monitor was corrected to report Program Change and consumed binding events.
