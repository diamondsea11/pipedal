# Preparing Changes for PiPedal Upstream

The development repository at `diamondsea11/pipedal` is currently an independent
GitHub repository, not a GitHub fork. Although it shares Git ancestry with
`rerdavies/pipedal`, GitHub cannot use it as the normal head repository for an
upstream pull request.

## One-Time Fork Setup

1. Keep the current repository as the archival integration repository, ideally
   by renaming it to `pipedal-performance` on GitHub.
2. Fork `rerdavies/pipedal` into `diamondsea11/pipedal` using GitHub's Fork
   button. Do not delete the archival repository until its tags and branches
   are confirmed in the renamed repository.
3. Clone the real fork separately and add
   `https://github.com/rerdavies/pipedal.git` as `upstream`.
4. Create each contribution branch from the current upstream development base,
   not from `feature/multipath-v1`.
5. Port one coherent feature at a time, add focused tests, and open it first as
   a draft pull request.

GitHub Support may be able to attach an independent repository to an existing
fork network, but renaming and creating a real fork is reproducible and keeps
the current integration history intact.

## Recommended Pull Request Series

1. **ALSA multichannel detection fix**: the narrow device-detection correction
   and its hardware-independent tests.
2. **S24_LE scaling and host fixes**: audio-format correction, bounded block
   length and sidechain compatibility, split into separate PRs if requested.
3. **Generic numeric LV2 patch properties**: host model, persistence, controls
   and tests. This enables Dusk controls without bundling Dusk skins.
4. **Block editing interactions**: copy, paste, duplicate, delete and touch
   long-press as a self-contained UI contribution.
5. **Plugin categorization/browser**: category inference, search and inline
   empty-block browser.
6. **MIDI monitor and action extensions**: start with diagnostics, then propose
   controller profiles and per-snapshot actions separately.
7. **Input-terminal noise gate**: data model, DSP, UI, snapshot behavior and
   tests. This depends on per-path terminals only if submitted in its current
   multi-path form.
8. **Multipath routing**: propose the model and audio architecture before a PR.
   Split engine/preset serialization, hardware routing, editor and send/return
   support into reviewable stages.
9. **Global EQ and Control Hub/Gig UI**: submit only after the underlying state
   and routing contracts are accepted.

NAM Gateway behavior belongs partly to TooB Amp. Rebuilt TooB binaries, plugin
bundles and third-party skins should not be mixed into PiPedal core PRs.

## What to Send the Maintainer

Start with an issue or discussion linking to:

- `docs/ForkChanges.md` for scope and behavior;
- `ROADMAP.md` for completed and pending hardware validation;
- a short screen recording of the iPad workflow;
- the first small draft PR, including reproduction steps and test output.

Avoid presenting the entire integration branch as one merge request. Against
the current upstream line it spans roughly 200 files and combines audio-engine,
preset-schema, UI, plugin-host and bundled-binary changes. Small PRs let the
maintainer accept useful foundations without adopting the complete product
direction.
