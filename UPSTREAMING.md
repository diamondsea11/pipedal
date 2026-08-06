# Preparing Changes for PiPedal Upstream

The public repository at `diamondsea11/pipedal` is a GitHub fork of
`rerdavies/pipedal`. The earlier independent integration repository is preserved
privately as `diamondsea11/pipedal-performance`.

## Repository Layout

- `origin`: public contribution fork, `diamondsea11/pipedal`.
- `upstream`: official project, `rerdavies/pipedal`.
- `archive`: private integration repository, `diamondsea11/pipedal-performance`.
- `feature/multipath-v1`: complete experimental integration branch, published
  in the public fork for review and preserved in the private archive.

Create every contribution branch from the current upstream development base,
not from `feature/multipath-v1`. Port one coherent feature at a time, add focused
tests and open it first as a draft pull request.

## Maintainer Response (2026-08-05)

Robin Davies reviewed the fork end to end and replied point by point in
[Discussion #555](https://github.com/rerdavies/pipedal/discussions/555). This
section records his position per topic and two facts about the fork that his
questions required checking against the actual code, so the PR series below
reflects what he will and will not consider rather than what we hoped he would.

**Ready to prepare as PRs, per his explicit interest:**
- Control-group restyling (his favorite; not a Helix copy, no objection raised)
- JUCE-style control handling — his concern: whether the TTL parser used
  (Lilv/Serd, "drobzilla's") preserves JUCE control order, since TTL gives no
  ordering guarantee and JUCE plugins tend to need their generated layout
  order to be usable. Confirm this before opening the PR, not after.
- LV2 category patching
- Custom layouts for Chow Tape, Calf, Dragonfly, Dusk Reverb
- S24_LE capture/playback scaling fix
- NAM Gateway calibration/quality-default alignment, with careful preset
  versioning (he offered to advise on the versioning approach — take him up
  on it before writing migration code)

**Declined — do not prepare a PR:**
- Four independent signal paths (multipath) as currently designed. He
  considers it device-specific and non-shareable, and has his own preferred
  design already in mind: separate main/aux(+aux2) signal paths that persist
  independently of preset changes (so a microphone channel does not need to be
  reconfigured, or even present, in every preset), plus a global preset layer
  (pre/post EQ, gate, reverb) with its own bank. **Do not submit the multipath
  routing model as a PR.** If a mic + guitar use case still needs solving,
  wait for his channel model rather than re-proposing this one.
- Suspended-processor warm-up + S-curve crossfade. He does not want this
  pulled in and prefers keeping all processors running continuously — same
  conclusion the fork independently reached in the parallel `uPedal` project
  (see the note at the end of this document). He also asked directly whether
  structurally-identical preset changes already preserve reverb tails the way
  snapshots do, suspecting the fork's version does not. **Checked, and they
  do**: `PluginHost::UpdateLv2PedalboardStructure` keeps an `ExistingEffectMap`
  and `PedalboardItem::IsStructurallyIdentical` (matching instance ID, URI and
  MIDI bindings) decides whether an effect instance is reused rather than
  recreated. Tell him this directly — it closes the question and is not a bug
  to fix.

**Needs his design decision before any PR, not ours:**
- UI gesture/context-menu conventions (Android vs. desktop conventions,
  long-press vs. double-tap, where context menus are acceptable). He asked to
  discuss this rather than receive a PR; do not preempt it with one.
- Control Hub → he is evaluating it against his own MIDI Mappings roadmap.
- Gig/Performance UI → same; waiting on his hands-on pass.

## Recommended Pull Request Series

Status markers reflect the response above: ✅ confirmed interest, ⛔ declined,
💬 his call to make, ⏳ blocked on his own design work landing first.

1. ✅ **ALSA multichannel detection fix** — extracted and pushed:
   [`upstream-pr/alsa-multichannel-detection`](https://github.com/diamondsea11/pipedal/tree/upstream-pr/alsa-multichannel-detection),
   branched directly from `upstream/main`. One line: disables
   `ShouldForceStereoChannels()`'s channel-map heuristic for genuinely
   multichannel devices. No isolated test exists for this function; noted as an
   open point in the commit rather than claimed. Not yet opened as a PR against
   `rerdavies/pipedal` — that step is the maintainer's to take.
2. ✅ **S24_LE scaling and host fixes**: audio-format correction, bounded block
   length, split into separate PRs if requested. The S24_LE bug is real and
   already fixed in the fork (verified: old scale constant used 2^24 instead of
   the correct 2^23 full-scale for signed 24-bit; on playback this overflowed
   past the valid range at any level above -6 dBFS, causing level-dependent
   high-frequency distortion, not just a quiet signal). The JUCE-style
   sidechain-*group* compatibility part of this item is now its own entry — see
   item 7 below, which supersedes the mention of it here.
3. ✅ **Generic numeric LV2 patch properties**: host model, persistence, controls
   and tests. This enables Dusk controls without bundling Dusk skins.
4. 💬 **Block editing interactions**: copy, paste, duplicate, delete and touch
   long-press. He flagged the added gestures and the copy/paste entry point as
   a UI-conventions problem on small screens — resolve that discussion before
   opening this PR, since the interaction surface may need to change first.
5. ✅ **Plugin categorization/browser**: category inference, search and inline
   empty-block browser.
6. 💬 **MIDI monitor and action extensions**: start with diagnostics (no
   objection). Controller profiles and per-snapshot actions overlap with his
   own MIDI Mappings → Control Hub evolution plan — sequence after that
   conversation, not before.
7. ✅ **JUCE sidechain port-group name fallback** — extracted and pushed:
   [`upstream-pr/juce-sidechain-group-fallback`](https://github.com/diamondsea11/pipedal/tree/upstream-pr/juce-sidechain-group-fallback),
   branched from `upstream/main`. **This replaces an earlier, incorrect entry
   in this document** that described "sidechain input selection" (choosing a
   specific plugin's output as another plugin's sidechain source) as fork work
   worth a PR. That was checked directly against `upstream/main` and is wrong:
   the entire mechanism — `sideChainInputId`, its `GetEffect()`-based
   resolution in `Lv2Pedalboard.cpp`, the `IEffect`/`Lv2Effect` plumbing, and
   `SideChainSelectControl.tsx` — already exists in upstream, byte-for-byte
   identical to the fork. There is nothing to submit for that. The one
   genuine, narrow gap is `isSidechainGroupName()`: a name-based fallback so
   JUCE-exported plugins (Dusk Multi-Comp) that omit the proper
   `pg:sideChainOf` property but name their port group with "sidechain" are
   still recognized. Three lines of real logic plus a helper function; nothing
   else changes.

   Still genuinely unresolved and *not* part of this PR: execution reordering
   for a sidechain send from a lower split branch to an upper one. Signal
   processing is strictly top-to-bottom in both the fork and upstream, so that
   direction still incurs the one-buffer delay he asked about. This would be
   new work, not an extraction, and needs his input on the intended semantics
   before anyone builds it.
8. ⏳ **Input-terminal noise gate**: data model, DSP, UI, snapshot behavior and
   tests. Was scoped to depend on per-path terminals; multipath is declined
   (item 9), so this needs re-scoping to his main/aux(+aux2) channel model once
   he publishes it. Do not resubmit against the current multi-path terminals.
9. ⛔ **Multipath routing**: declined. Do not open this PR. His alternative
   (independent main/aux(+aux2) paths, global pre/post EQ + gate + reverb with
   its own bank) is the direction to build toward instead, once he shares
   design details.
10. ⏳ **Global EQ and Control Hub/Gig UI**: unchanged from before — still gated
    on state/routing contracts, which are now specifically *his* routing model
    (item 9) rather than the fork's.

NAM Gateway behavior belongs partly to TooB Amp. Rebuilt TooB binaries, plugin
bundles and third-party skins should not be mixed into PiPedal core PRs.

## uPedal (context, not part of this upstreaming effort)

A separate from-scratch project, `uPedal`, is in early development in parallel:
a headless, web-controlled Linux plugin host built on Carla (LV2/VST2/VST3/CLAP,
including Windows VSTs via yabridge). It shares no code with PiPedal and is not
proposed for merge here. It is mentioned only because one design choice
overlaps with Robin's stated preference above: uPedal keeps every signal lane
running continuously and crossfades between them, rather than suspending
processors, for the same reasons he gave (avoids ducking, keeps state and tails
alive). No action needed on the PiPedal side; noted here so the two efforts
are not confused with each other in review.

## What to Send the Maintainer

Start with an issue or discussion linking to:

- `docs/ForkChanges.md` for scope and behavior;
- `ROADMAP.md` for completed and pending hardware validation;
- a short screen recording of the iPad workflow;
- the first small draft PR, including reproduction steps and test output.

The initial upstream conversation is
[Discussion #555](https://github.com/rerdavies/pipedal/discussions/555).

Avoid presenting the entire integration branch as one merge request. Against
the current upstream line it spans roughly 200 files and combines audio-engine,
preset-schema, UI, plugin-host and bundled-binary changes. Small PRs let the
maintainer accept useful foundations without adopting the complete product
direction.
