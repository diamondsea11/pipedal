# Experimental ARM64 Test Build

The [GitHub prerelease](https://github.com/diamondsea11/pipedal/releases/tag/pipedal-2.0.110-codex22)
for `pipedal-2.0.110-codex22` provides the complete
PiPedal Performance Fork server, web application and bundled TooB Amp LV2
plugins as an installable Debian package.

## Target Platform

- Raspberry Pi 5 or compatible arm64 system
- Raspberry Pi OS Lite / Debian 13 (Trixie), 64-bit
- External ALSA USB audio interface

This package is built natively on Trixie and depends on its `t64` libraries. It
is not a Bookworm package.

## Installation

Download the `.deb` and its checksum from the GitHub prerelease, then run:

```bash
sha256sum -c SHA256SUMS
sudo apt install ./pipedal_2.0.110+codex22_arm64.deb
sudo systemctl restart pipedald
```

PiPedal settings and user presets under `/var/pipedal` are not intentionally
removed by an upgrade, but they should be backed up before installing an
experimental build. Return to the official PiPedal package to leave the fork.

## Included and Excluded Software

The package includes the modified `pipedald`, the production web UI, service
configuration, factory presets and the fork's bundled TooB Amp build. It does
not redistribute the separately installed Dragonfly, Calf, LSP, Chow/Airwindows
or Dusk Audio suites. `PLUGIN-INVENTORY.txt` records the additional LV2 bundles
present on the reference system so the test environment can be reconstructed
from the projects' own releases.

## Source and Validation

- Source tag: `pipedal-2.0.110-codex22`
- Integration branch: `feature/multipath-v1`
- Change inventory: `docs/ForkChanges.md`
- Open hardware checks: `ROADMAP.md`

The release is experimental and is not published or supported by Robin Davies.
