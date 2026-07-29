## TooB NAM Gateway Calibration Patch

PiPedal 2.0.108+codex6 bundles a patched build of TooB Amp 1.3.83, based on
ToobAmp commit `a56e392`.

The patch makes TooB Neural Amp Modeler's calibration behavior match NAM
Gateway:

- calibrated input gain is `interface_level - model_input_level`;
- calibrated output gain is `model_output_level - interface_level`;
- normalized output gain is `-18 - model_loudness`;
- raw and unsupported calibration modes apply no metadata-based gain;
- the former fixed `+6/-6 dB` gain-staging offsets are removed;
- output calibration no longer silently falls back to normalized output;
- output metadata reports the output level and its availability flag correctly.

This installation also sets `Interface Input Level` to `13 dBu` and
`Quality`/`Slim` to `1.0` for new and migrated TooB NAM instances. Input
Input Calibration defaults to `Calibrated`. The adjustment is applied only
when a capture contains `input_level_dbu`; models without calibration metadata
remain at unity gain. The `1.0` quality setting selects the full A2 model when
the loaded model supports slimming; other model types ignore it.

Preset schema 4 removes historical negative input trims only from bundled
Factory NAM presets. Schema 5 enables metadata-aware input calibration by
default. User model gain trims are preserved.

For Raspberry Pi 5, the audio callback is pinned to CPU 1 and TooB background
NAM/convolution workers use CPUs 2 and 3. Background NAM buffers are allocated
when the frame size is configured instead of being resized during processing.
PiPedal logs callback load every 30 seconds as `Audio DSP headroom`, including
average load, maximum load, and callbacks that consumed at least 80 percent of
their deadline.

The calibration formulas match NAM Gateway commit `96337e9` exactly. The
complete plugins are not bit-identical: TooB is an LV2 plugin with threaded
processing and an optimized A2 path, while Gateway also has its own optional
gate, tone stack, IR, and DC-blocker stages. TooB's neutral defaults bypass its
gate and tone stack, so the NAM path is not deliberately filtered, but exact
sample equality is not guaranteed.
