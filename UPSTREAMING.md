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
- NAM Gateway calibration/quality-default alignment — **blocked on a ToobAmp
  change, not ready to extract.** See the dedicated section below before doing
  anything here.

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
2. ✅ **S24_LE scaling fix** — extracted and pushed:
   [`upstream-pr/s24-le-scaling-fix`](https://github.com/diamondsea11/pipedal/tree/upstream-pr/s24-le-scaling-fix),
   branched from `upstream/main`. Root cause confirmed precisely: the
   `SND_PCM_FORMAT_S24_LE`/`S24_BE` (24 bits unpacked into a 4-byte container)
   capture and playback paths used `0x00FFFFFF` (2^24-1) as the signed 24-bit
   full-scale constant instead of the correct `0x7FFFFF` (2^23-1). Capture
   simply decoded 6 dB low. Playback was worse: any level above 0.5 (-6 dBFS,
   an ordinary signal level) multiplied past the valid signed-24-bit range and
   wrapped to the opposite polarity in the low 24 bits — audible as
   level-dependent high-frequency distortion, with no xruns and normal CPU
   load, which is why it's an unpleasant one to chase by ear. The pre-existing
   `[-1, 1]` clamp was already correct; it just couldn't help while the scale
   put post-clamp full-scale outside the valid range. Only these two functions
   each on capture/playback are touched — the packed 3-byte `S24_3LE`/`S24_3BE`
   paths already used the correct constant (they reconstruct the sample
   left-justified into the full 32-bit range, a different convention that
   correctly calls for a different scale) and are confirmed identical to
   upstream. Bounded block length is unrelated and still open — split into its
   own PR if pursued. The JUCE-style sidechain-*group* compatibility part of
   this item is its own entry — see
   item 7 below, which supersedes the mention of it here.
3. ✅ **Generic numeric LV2 patch properties**: host model, persistence, controls
   and tests. This enables Dusk controls without bundling Dusk skins.
4. 💬 **Block editing interactions**: copy, paste, duplicate, delete and touch
   long-press. He flagged the added gestures and the copy/paste entry point as
   a UI-conventions problem on small screens — resolve that discussion before
   opening this PR, since the interaction surface may need to change first.
5. ✅ **LV2 category patching** — extracted and pushed:
   [`upstream-pr/lv2-category-patching`](https://github.com/diamondsea11/pipedal/tree/upstream-pr/lv2-category-patching),
   branched from `upstream/main`. New `PluginCategories.ts` (13 guitarist-facing
   categories with colours and display order, mapped from `PluginType`, plus a
   name/type/author heuristic that only runs to refine an unhelpful declared
   class), a category-grouped filter dropdown in `LoadPluginDialog` (filter
   values prefixed `category:`, hence `filterType` widened `PluginType` →
   `string`), and category-coloured block icons in `PedalboardView` where the
   user hasn't set an explicit `iconColor`. **Verified by actual compilation**
   this time, not just diffing: `npx tsc -b --force` in `vite/` exits 0 on the
   branch, and each edited region was additionally diffed byte-for-byte against
   the fork original.

   Two things deliberately left out, both noted in the commit message so he
   isn't surprised: (a) the user-facing "re-categorise this plugin" localStorage
   override — its two functions ship in `PluginCategories.ts` but are
   unreferenced here, because the only caller is the fork-only
   `InlinePluginBrowser` component; offer to strip them or propose that UI
   separately. (b) Five unrelated fixes that happen to live in
   `LoadPluginDialog.tsx` in the fork (a `"100%'"` typo, an operator-precedence
   bug in a `Typography` expression, search debounce 2000 ms → 250 ms, and two
   `disabled={selectedPlugin === null}` → `disabled={!selectedPlugin}` tweaks) —
   these are real but off-topic, and would muddy a categories review.

   Still open from his reply: internationalization. Category labels are English
   literals in the new file. Nothing here makes translation harder than the rest
   of the UI already does, but nothing makes it easier either.

   The **inline empty-block browser** originally bundled into this item is a
   separate, fork-only component and is *not* part of this branch.
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

## NAM calibration: blocked on ToobAmp, and a live bug in this fork's amd64 build

Investigated for extraction; **not extracted**, because the PiPedal-side code
cannot work correctly against the ToobAmp that ships today. Verified directly
from the TTL of each build rather than inferred:

| ToobAmp build | `calibration` port name | range | default |
|---|---|---|---|
| arm64 bundled in this fork (patched) | `Interface Input Level` | −60 … 60 | 13.0 |
| **amd64 `toobamp_1.3.85` bundled in this fork** | `Value` | **−30 … 12** | −6.0 |
| `rerdavies/ToobAmp` master (2026-07-27) | `Value` | **−30 … 12** | −6.0 |

The patched port means "analog input level in dBu RMS corresponding to 0 dBFS
peak". The stock port means "measured instrument voltage level in dBU" — a
different quantity, with a maximum of 12.0.

`PiPedalModel.cpp` writes `calibration = GetNamInputCalibrationDbu()`, which is
**13.0** for an RME Babyface Pro (`NamInputCalibrationProfiles.hpp`). Against a
stock plugin that value is both out of range (clamped to 12.0) and interpreted
as a different quantity. No error is raised; the gain staging is simply wrong.

**Consequence for upstreaming:** the PiPedal side is not independently
mergeable. The ToobAmp change has to land first, and it is a semantic
redefinition of an existing port, so it needs its own versioning discussion.
Robin owns both repositories, so the ordering is his to decide — but proposing
the PiPedal half now would hand him something that silently misbehaves for
every user running stock ToobAmp. The source patch is in
`patches/toobamp-1.3.83-gateway-calibration.patch`; it belongs in a ToobAmp
PR, not here.

**Consequence for this fork right now:** the bundled **amd64** ToobAmp is
stock, while the bundled **arm64** build is patched. The Raspberry Pi
deployment is therefore self-consistent, and the **x86-64 deployment is not** —
on the Intel box, NAM interface calibration is being clamped and misinterpreted.
Fixing that means building ToobAmp from source with the patch applied for
amd64, the same way the arm64 binaries were produced. Until then, treat NAM
calibration on x86-64 as not working, regardless of what the UI shows.

Take Robin up on his offer of versioning advice **before** writing any
migration code: the fork's schema steps 2→6 were designed around the patched
plugin's semantics, so if he chooses a different ToobAmp-side design the
migration path changes with it.

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
