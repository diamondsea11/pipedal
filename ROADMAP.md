# PiPedal Performance Roadmap

This roadmap tracks the Helix-inspired performance work on top of PiPedal
2.0.108. "Complete" means implemented and included in a tagged build. Hardware
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
- [ ] Record CPU, temperature and XRUN results for representative live rigs at
  48 kHz with 48-, 64- and 96-frame periods.
- [ ] Perform an end-to-end MIDI acceptance pass with the intended foot
  controller, including press, release, long press, expression, channel
  filtering and snapshot changes.
- [ ] Verify input and output routing on at least one non-RME multichannel
  interface to guard against device-specific assumptions.

## Next Features

- [ ] Replace the routing template selector with a compact visual split/merge
  editor while retaining templates as fast starting points.
- [ ] Add explicit send/return blocks so parallel paths can share selected
  effects without duplicating processor instances.
- [ ] Add per-path input and output meters to make gain staging and hardware
  routing visible before opening an effect.
- [ ] Add reusable MIDI controller profiles and an import/export format for
  complete assignments.
- [ ] Add a MIDI activity and action monitor for troubleshooting controller
  mappings without SSH access.
- [ ] Add focused, grouped Dusk Audio skins. The current build exposes all
  supported controls, but complex processors such as DuskVerb remain denser
  than the tailored Chow, Calf and Dragonfly layouts.
- [ ] Add automated integration tests for path routing, snapshot restoration,
  plugin duplication and generic LV2 patch-property persistence.

## Build Line

- Base release: `2.0.108`
- Current development branch: `feature/multipath-v1`
- Current tagged build: `pipedal-2.0.108-codex16`
- Dusk compatibility build: `2.0.108+codex16`
