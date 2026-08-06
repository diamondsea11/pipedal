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
  order to be usable. **Checked — see the section below.** Short answer: for
  control ports the concern does not apply; for patch properties it does, and
  that is the part worth discussing.
- LV2 category patching
- Custom layouts — **only Dragonfly is PiPedal code.** Draft PR
  [#562](https://github.com/rerdavies/pipedal/pull/562) covers
  `urn:dragonfly:early`/`:plate`/`:room` (not Hall, which has a different
  control set). Dusk is written but blocked on item 3 — its view needs seven
  extra `Lv2PatchPropertyInfo` fields plus `isNumeric()`/`toUiControl()`,
  populated host-side; `tsc` caught this when the first attempt at the branch
  included it. Chow Tape and Calf are **not PiPedal code at all** — they are
  MOD GUI skins under `patches/`, i.e. third-party plugin assets, and per
  Robin's own note do not belong in a core PR.
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

1. ✅ **ALSA multichannel detection fix** — draft PR [#558](https://github.com/rerdavies/pipedal/pull/558):
   [`upstream-pr/alsa-multichannel-detection`](https://github.com/diamondsea11/pipedal/tree/upstream-pr/alsa-multichannel-detection),
   branched directly from `upstream/main`. One line: disables
   `ShouldForceStereoChannels()`'s channel-map heuristic for genuinely
   multichannel devices. No isolated test exists for this function; noted as an
   open point in the PR rather than claimed.
2. ✅ **S24_LE scaling fix** — draft PR [#559](https://github.com/rerdavies/pipedal/pull/559):
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
3. ✅ **Generic numeric LV2 patch properties** — draft PR
   [#563](https://github.com/rerdavies/pipedal/pull/563):
   [`upstream-pr/numeric-patch-properties`](https://github.com/diamondsea11/pipedal/tree/upstream-pr/numeric-patch-properties),
   branched from `upstream/main`. `FindWritablePathProperties` gains an
   `atom:Float` branch so numeric parameters no longer set
   `unsupportedPatchProperty` (which hides the whole plugin);
   `Lv2PatchPropertyInfo` reads `lv2:minimum`/`maximum`/`default`, the
   `lv2:portProperty` flags and `lv2:scalePoint`/`rdf:value`, and finally
   populates `rdfs:label`, which upstream serialized but never set;
   `writable`, `readable` and `index` added to the JSON map because
   `Lv2Plugin.tsx` already deserialized them. New
   `PatchPropertyControl.tsx` renders one property through the existing
   `PluginControl`; `PluginControlView` emits the writable numeric ones in
   `lv2:index` order. No protocol change — `get/set/monitorPatchProperty`
   already exist. Verified with `npx tsc -b --force`; C++ not built locally.
   **Deliberately excluded:** `getPatchPropertyBySymbol` and the
   `ModGuiHost` mod-port-symbol resolution (a separate, much larger topic).
   No tests — no existing pattern for plugin-metadata parsing tests in the
   tree; offered to follow Robin's preference. This unblocks the Dusk view
   (item under Custom layouts), which needs `isNumeric()`/`toUiControl()`.
4. 💬 **Block editing interactions**: copy, paste, duplicate, delete and touch
   long-press. He flagged the added gestures and the copy/paste entry point as
   a UI-conventions problem on small screens — resolve that discussion before
   opening this PR, since the interaction surface may need to change first.
5. ✅ **LV2 category patching** — draft PR [#561](https://github.com/rerdavies/pipedal/pull/561):
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
7. ✅ **JUCE sidechain port-group name fallback** — draft PR [#560](https://github.com/rerdavies/pipedal/pull/560):
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

## Answer to Robin's TTL-ordering question (control ports vs. patch properties)

He asked whether the TTL parser preserves the control order a JUCE plugin
intends, given that RDF/Turtle carries no statement-order guarantee. Traced
through the actual code path rather than reasoned about in the abstract:

**Control ports — the concern does not apply.** Order never comes from
statement order at any stage:

1. `lv2:index` is mandatory on every port. Lilv places each port at its
   declared index (`lilv_plugin_get_port_by_index` indexes a densely-filled
   array; a missing or duplicate index is a load error), so nothing downstream
   ever sees RDF iteration order.
2. `PluginHost.cpp:992` sorts `ports_` explicitly with `ports_sort_compare`,
   which compares `index()`. Even if lilv's array order were ever to change,
   PiPedal's order would not.
3. `Lv2PluginUiInfo` builds `controls_` by walking `plugin->ports()` in that
   sorted order (`PluginHost.cpp:1502`), so the wire order is index order.
4. Port-*group* order is derived the same way: `portGroups` is filled while
   walking ports `0..n-1` (`PluginHost.cpp:953`), so a group's position is the
   index of its first port. `PluginControlView` then emits groups in the order
   they first appear in `plugin.controls`.

JUCE's LV2 wrapper emits control ports in `AudioProcessor` parameter order with
sequential `lv2:index` values, so the plugin's intended layout order survives
end to end. Nothing needs fixing here, and no PR is required for it.

**Patch properties — the concern is real, and this is the part to discuss.**
`lv2:Parameter` has no mandatory index, so for a plugin that exposes its
controls as `patch:writable` parameters instead of ports there is genuinely no
ordering information in the general case. This is not hypothetical: the Dusk
Audio plugins do exactly that (see `modgui-skins/README.md`), which is why the
Multi-Comp skin exists at all.

Draft PR [#563](https://github.com/rerdavies/pipedal/pull/563) sorts numeric
patch properties by `lv2:index` where the plugin declares one, and falls back
to the property label. That fallback is alphabetical, i.e. *not* the plugin's
intended order — it is deterministic, not correct. Whether PiPedal should
require `lv2:index` on parameters, define its own ordering convention, or lean
on `modgui` templates for these plugins is a design call, and it is his.

Not verified here: whether the Dusk bundles actually declare `lv2:index` on
their parameters. Their TTL is not in this tree — it would have to be read off
the Pi installation.

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

### What went to ToobAmp instead

Two unambiguous bugs found in that block while investigating are now
[ToobAmp draft PR #86](https://github.com/rerdavies/ToobAmp/pull/86), separate
from the calibration-semantics question:

- `output_level_dbu` was assigned from `GetModelInputLevelDBu()` instead of
  `GetModelOutputLevelDBu()`.
- `fgModelMetadata.flags` was written *before* `has_output_level_dbu` was
  OR-ed in, so that bit never reached the host.

Both values are published via `SendModelMetadataNotification()`, so a host
reading them gets a wrong output level and never sees the availability flag.
Seven lines, no design decision involved — deliberately kept apart from the
port-redefinition question, which is Robin's call.

The rest of `patches/toobamp-1.3.83-gateway-calibration.patch` was **not**
submitted. It bundles two further topics that each need their own discussion:
the calibration-semantics redefinition (the `calibration` port change above),
and Raspberry-Pi-specific realtime work in `NamBackgroundProcessor.*`,
`ConvolutionReverb.cpp` and `AudioThreadToBackgroundQueue.cpp` (CPU pinning,
buffer preallocation) that has nothing to do with calibration.

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
