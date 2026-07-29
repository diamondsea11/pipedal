#!/usr/bin/env python3
"""Add the sidechain port-group metadata missing from Calf LV2 files."""

from __future__ import annotations

import argparse
from pathlib import Path

from rdflib import Graph


GROUP = """
:pipedal_sidechain a pg:StereoGroup , pg:InputGroup ;
    lv2:symbol "pipedal_sidechain" ;
    rdfs:label "Sidechain" ;
    pg:sideChainOf :in .

"""


def patch_port(source: str, symbol: str, designation: str) -> str:
    marker = f'        lv2:symbol "{symbol}" ;'
    replacement = (
        marker
        + "\n        pg:group :pipedal_sidechain ;"
        + f"\n        lv2:designation pg:{designation} ;"
    )
    if source.count(marker) != 1:
        raise RuntimeError(f"Expected exactly one {symbol} port")
    return source.replace(marker, replacement)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    source = args.source.read_text(encoding="utf-8")
    plugin_marker = next(
        line for line in source.splitlines()
        if line.startswith("<http://calf.sourceforge.net/plugins/")
        and " a lv2:Plugin" in line
    )
    if ":pipedal_sidechain" not in source:
        source = source.replace(plugin_marker, GROUP + plugin_marker, 1)
    source = patch_port(source, "sidechain", "left")
    source = patch_port(source, "sidechain2", "right")

    Graph().parse(data=source, format="turtle")
    args.output.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
