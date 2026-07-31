# Dusk Audio MOD GUI skins for PiPedal

PiPedal-hosted MOD GUIs for the Dusk Audio plugins, which expose all controls as
LV2 *patch properties* (atom:Float) rather than control ports. Rendering these in
PiPedal's modgui host required teaching it to bind widgets to patch properties
(see `ModGuiHost.tsx`: `getPatchPropertyBySymbol` fallback + `createPatch*Control`).

## Multi-Comp
`Multi-Comp/` mirrors what is installed into the plugin bundle
`/usr/local/lib/lv2/Multi-Comp.lv2/`:
- `modgui.ttl` — declares `modgui:gui` (iconTemplate, stylesheet, resourcesDirectory).
- `modgui/Multi-Comp/icon.html` — panel template; knobs bind via `mod-port-symbol`.
- `modgui/Multi-Comp/style.css` — Dusk amber/dark look (colours from AnalogLookAndFeel).

Install: copy these into the plugin bundle and append to the bundle's manifest.ttl:
`<https://dusk-audio.github.io/plugins/multi-comp> rdfs:seeAlso <modgui.ttl> .`
then restart pipedald. In the UI, select the plugin and toggle **MOD UI**.

Scope: first working core (Classic VCA engine + Mix + gain-reduction meter). Other
engines (Opto/FET/Bus/Studio/Digital) and multiband are future iterations.
