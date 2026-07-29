# CHOW Tape Model PiPedal UI

This overlay adds a PiPedal-compatible MOD GUI to the ARM64 LV2 build of
CHOWTapeModel. It changes presentation only; DSP, parameter ranges, saved
values, and presets are untouched.

Install the `modgui` directory and `modgui.ttl` in the plugin bundle, then add
`rdfs:seeAlso <modgui.ttl>` to the plugin entry in `manifest.ttl`.

PiPedal caches MOD GUI templates by the LV2 minor/micro version. Increment the
custom bundle's `lv2:microVersion` after UI changes so clients receive the new
template without clearing their browser cache.
