#!/usr/bin/env python3
"""Generate PiPedal MOD GUIs from Calf's LV2 metadata."""

from __future__ import annotations

import argparse
import html
import re
import shutil
from collections import defaultdict
from pathlib import Path

from rdflib import Graph, Namespace, RDF


LV2 = Namespace("http://lv2plug.in/ns/lv2core#")
DOAP = Namespace("http://usefulinc.com/ns/doap#")
EPP = Namespace("http://lv2plug.in/ns/ext/port-props#")
RDFS = Namespace("http://www.w3.org/2000/01/rdf-schema#")

GROUP_RULES = (
    ("Dynamics", ("threshold", "ratio", "attack", "release", "knee", "makeup", "limit", "compression", "hold")),
    ("Filter", ("freq", "cutoff", "reson", "bandwidth", "slope", "filter", "bass", "treble", "high", "low")),
    ("Modulation", ("rate", "depth", "feedback", "phase", "lfo", "mod", "delay", "chorus", "flutter", "wow")),
    ("Stereo", ("stereo", "balance", "width", "mid", "side", "haas", "mono", "phase")),
    ("Drive & Character", ("drive", "satur", "dist", "clip", "shape", "harmonic", "blend", "color")),
)

MAIN_WORDS = ("bypass", "level", "gain", "mix", "amount", "input", "output", "dry", "wet")
HIDDEN_WORDS = (
    "meter_",
    "clip_",
    "led",
    "phase_graph",
    "frequency_response",
    "blank",
    "assign_",
)


def text(graph: Graph, subject, predicate, fallback: str = "") -> str:
    value = graph.value(subject, predicate)
    return str(value) if value is not None else fallback


def is_type(graph: Graph, subject, rdf_type) -> bool:
    return (subject, RDF.type, rdf_type) in graph


def port_data(graph: Graph, port) -> dict:
    properties = {str(value) for value in graph.objects(port, LV2.portProperty)}
    scale_points = []
    for point in graph.objects(port, LV2.scalePoint):
        scale_points.append(
            (
                text(graph, point, RDFS.label, text(graph, point, LV2.name, "")),
                text(graph, point, RDF.value, "0"),
            )
        )
    return {
        "index": int(text(graph, port, LV2.index, "0")),
        "symbol": text(graph, port, LV2.symbol),
        "name": text(graph, port, LV2.name),
        "input": is_type(graph, port, LV2.InputPort),
        "output": is_type(graph, port, LV2.OutputPort),
        "control": is_type(graph, port, LV2.ControlPort),
        "toggled": str(LV2.toggled) in properties
        or bool(re.search(r"(?:^|_)(?:bypass|mono|enabled?|on_off)(?:_|$)", text(graph, port, LV2.symbol), re.I))
        or text(graph, port, LV2.symbol).lower() == "wet_gain_comp_",
        "enumeration": str(LV2.enumeration) in properties,
        "not_on_gui": str(EPP.notOnGUI) in properties,
        "scale_points": scale_points,
    }


def control_markup(port: dict, header: bool = False) -> str:
    symbol = html.escape(port["symbol"], quote=True)
    name = html.escape(port["name"] or port["symbol"])
    classes = "calf-control header" if header else "calf-control"
    if port["toggled"]:
        widget = (
            f'<div class="calf-switch" mod-role="input-control-port" '
            f'mod-port-symbol="{symbol}" mod-widget="switch" mod-widget-rotation="48"></div>'
        )
    elif port["enumeration"] and port["scale_points"]:
        options = "".join(
            f'<div mod-role="enumeration-option" mod-port-value="{html.escape(value, quote=True)}">'
            f'{html.escape(label)}</div>'
            for label, value in port["scale_points"]
        )
        widget = (
            f'<div class="calf-select" mod-role="input-control-port" '
            f'mod-port-symbol="{symbol}" mod-widget="custom-select">'
            f'<span mod-role="input-control-value"></span>'
            f'<div class="mod-enumerated-list">{options}</div></div>'
        )
    else:
        widget = (
            f'<div class="calf-dial" mod-role="input-control-port" '
            f'mod-port-symbol="{symbol}" mod-widget-rotation="270"></div>'
        )
    return f'<div class="{classes}">{widget}<span>{name}</span></div>'


def meter_markup(port: dict, compact: bool = False) -> str:
    symbol = html.escape(port["symbol"], quote=True)
    name = html.escape(port["name"] or "Gain Reduction")
    return (
        f'<div class="gr-meter" mod-role="output-control-port" mod-port-symbol="{symbol}" '
        f'mod-meter-scale="gain-reduction" mod-meter-max="30" aria-label="{name}">'
        f'<strong><span>{name}</span><span mod-role="output-control-value">0.0 dB</span></strong>'
        '<div class="gr-track"><div class="gr-fill"></div><div class="gr-peak"></div></div>'
        '<div class="gr-scale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span><span>30 dB</span></div>'
        '</div>'
    )


def group_for(port: dict) -> str:
    key = f'{port["symbol"]} {port["name"]}'.lower()
    for title, words in GROUP_RULES:
        if any(word in key for word in words):
            return title
    return "Advanced"


def band_number(port: dict) -> int | None:
    match = re.search(r"([0-3])$", port["symbol"])
    return int(match.group(1)) if match else None


def make_template(name: str, controls: list[dict], meters: list[dict], brand: str, accent: str) -> str:
    usable = [
        port for port in controls
        if not port["not_on_gui"] and not any(word in port["symbol"].lower() for word in HIDDEN_WORDS)
    ]
    header_controls = []
    for port in usable:
        key = f'{port["symbol"]} {port["name"]}'.lower()
        if len(header_controls) < 3 and any(word in key for word in MAIN_WORDS):
            header_controls.append(port)
    for port in header_controls:
        usable.remove(port)

    grouped: dict[str, list[dict]] = defaultdict(list)
    multiband = any(band_number(port) is not None for port in usable)
    for port in usable:
        band = band_number(port) if multiband else None
        grouped[f"Band {band + 1}" if band is not None else group_for(port)].append(port)

    sections = []
    if len(meters) > 1:
        meter_html = "".join(meter_markup(port, True) for port in meters)
        sections.append(
            '<section class="calf-section dynamics"><h2>Gain Reduction</h2>'
            f'<div class="multi-gr">{meter_html}</div></section>'
        )
    order = ["Dynamics", "Filter", "Modulation", "Stereo", "Drive & Character", "Advanced"]
    group_names = sorted(grouped, key=lambda value: (order.index(value) if value in order else -1, value))
    for title in group_names:
        ports = grouped[title]
        css_class = "band" if title.startswith("Band ") else title.lower().replace(" ", "-").replace("&", "")
        body = "".join(control_markup(port) for port in ports)
        sections.append(
            f'<section class="calf-section {css_class}"><h2>{html.escape(title)}</h2>'
            f'<div class="calf-controls">{body}</div></section>'
        )

    single_meter = meter_markup(meters[0]) if len(meters) == 1 else ""
    header = "".join(control_markup(port, True) for port in header_controls)
    if not any(port["symbol"].lower() == "bypass" for port in header_controls):
        header += (
            '<div class="calf-control header"><div class="calf-switch" '
            'mod-role="bypass" mod-widget-rotation="48"></div><span>Bypass</span></div>'
        )
    return (
        f'<div class="calf-ui" style="--accent:{html.escape(accent, quote=True)}">'
        '<header class="calf-header"><div class="calf-mark"></div>'
        f'<div class="calf-brand"><strong>{html.escape(name)}</strong><span>{html.escape(brand)}</span></div>'
        f'{single_meter}<div class="header-controls">{header}</div></header>'
        f'<main class="calf-sections">{"".join(sections)}</main></div>'
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--style", type=Path, required=True)
    parser.add_argument("--brand", default="Calf Studio Gear")
    parser.add_argument("--accent", default="#55b7a5")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    declarations = [
        "@prefix modgui: <http://moddevices.com/ns/modgui#> .",
        "",
    ]
    generated = 0
    meter_plugins = []
    plugin_uris = []
    for ttl_path in sorted(args.source.glob("*.ttl")):
        if ttl_path.name == "manifest.ttl" or ttl_path.name.startswith("presets-"):
            continue
        graph = Graph()
        graph.parse(ttl_path, format="turtle")
        plugins = sorted(
            {subject for subject in graph.subjects(RDF.type, LV2.Plugin)},
            key=str,
        )
        for plugin in plugins:
            ports = sorted(
                (port_data(graph, port) for port in graph.objects(plugin, LV2.port)),
                key=lambda value: value["index"],
            )
            controls = [port for port in ports if port["control"] and port["input"]]
            meters = [
                port for port in ports
                if port["control"] and port["output"]
                and re.fullmatch(r"compression\d*", port["symbol"], re.IGNORECASE)
            ]
            if not controls:
                continue
            name = text(graph, plugin, DOAP.name, ttl_path.stem)
            slug = re.sub(r"[^A-Za-z0-9_-]+", "-", ttl_path.stem)
            resource_dir = args.output / "modgui" / slug
            resource_dir.mkdir(parents=True, exist_ok=True)
            (resource_dir / "icon.html").write_text(
                make_template(name, controls, meters, args.brand, args.accent),
                encoding="utf-8",
            )
            shutil.copyfile(args.style, resource_dir / "style.css")
            gui_uri = f"{plugin}#PiPedalUI"
            declarations.extend(
                [
                    f"<{plugin}> modgui:gui <{gui_uri}> .",
                    f"<{gui_uri}>",
                    "    a modgui:Gui ;",
                    f"    modgui:resourcesDirectory <modgui/{slug}> ;",
                    f"    modgui:iconTemplate <modgui/{slug}/icon.html> ;",
                    f"    modgui:stylesheet <modgui/{slug}/style.css> ;",
                    f'    modgui:brand "{args.brand.replace(chr(34), chr(39))}" ;',
                    f'    modgui:label "{name.replace(chr(34), chr(39))}" ;',
                    f'    modgui:model "{name.replace(chr(34), chr(39))}" .',
                    "",
                ]
            )
            generated += 1
            plugin_uris.append(str(plugin))
            if meters:
                meter_plugins.append(f"{name}:{','.join(port['symbol'] for port in meters)}")

    (args.output / "modgui.ttl").write_text("\n".join(declarations), encoding="utf-8")
    manifest_additions = [
        "# PiPedal generated MOD GUI references",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "",
    ]
    manifest_additions.extend(
        f"<{uri}> rdfs:seeAlso <modgui.ttl> ." for uri in plugin_uris
    )
    (args.output / "manifest-additions.ttl").write_text(
        "\n".join(manifest_additions) + "\n",
        encoding="utf-8",
    )
    print(f"generated={generated}")
    print("gain_reduction=" + ";".join(meter_plugins))


if __name__ == "__main__":
    main()
