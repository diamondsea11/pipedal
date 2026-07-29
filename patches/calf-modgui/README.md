# Calf Studio Gear PiPedal UIs

`generate.py` reads Calf's LV2 Turtle metadata with RDFLib and creates a
consistent, grouped MOD GUI for every effect that has input controls.

Calf's `compression` output ports report the remaining linear gain. PiPedal's
custom `output-control-port` converts those values to positive gain reduction
with `-20 * log10(gain)` and displays the result in dB.

Generated files are installed under `calf.lv2/modgui`, and `modgui.ttl` is
referenced once from the bundle's `manifest.ttl`.

`patch_sidechains.py` adds the missing LV2 sidechain groups for Calf's
Sidechain Compressor, Sidechain Gate, Sidechain Limiter, and Vocoder. This
lets PiPedal treat their extra input pair as a sidechain instead of rejecting
the plugins as four-input effects.

PiPedal still excludes Calf's four zero-input instruments, the CV-based
Envelope Filter, and the three crossovers with more than two audio outputs.
