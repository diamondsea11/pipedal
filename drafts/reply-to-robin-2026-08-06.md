# Reply to Robin Davies — Discussion #555

*Draft. Not sent, not posted. Review and edit freely before using.*

---

Thanks for going through the fork in that much detail — the point-by-point
reply made it much easier to work out what is actually worth your review time
and what isn't.

I've split the parts you flagged as interesting into six small draft PRs, one
topic each, all branched from `upstream/main` rather than from my integration
branch. They're drafts because none of them has been through your CI yet; the
TypeScript ones type-check clean locally (`tsc -b --force`), but I don't have a
Linux build of the daemon here to verify the C++ side. Flip any of them to
ready — or tell me to fold them together differently — as you prefer.

**PiPedal**

- **#558 — ALSA multichannel detection.** One line: `ShouldForceStereoChannels()`'s
  channel-map heuristic misfires on genuinely multichannel interfaces. There's
  no isolated test for that function, and I didn't invent one; that's noted in
  the PR rather than papered over.
- **#559 — S24_LE/S24_BE full-scale constant.** The unpacked-into-4-bytes
  paths used `0x00FFFFFF` where the signed 24-bit full scale is `0x7FFFFF`.
  Capture just decoded 6 dB low. Playback was the nasty one: anything above
  −6 dBFS multiplied past the valid range and wrapped polarity in the low 24
  bits — level-dependent HF distortion with no xruns and normal CPU load. The
  packed `S24_3LE`/`S24_3BE` paths were already correct (they left-justify into
  the full 32-bit range, a different convention that genuinely wants a different
  constant) and are untouched.
- **#560 — JUCE sidechain port groups.** I owe you a correction here: my earlier
  write-up claimed sidechain *input selection* as fork work. That was wrong. I
  checked it against `upstream/main` and the whole mechanism — `sideChainInputId`,
  its `GetEffect()` resolution in `Lv2Pedalboard.cpp`, the `IEffect`/`Lv2Effect`
  plumbing, `SideChainSelectControl.tsx` — is already yours, byte for byte. The
  one genuine gap is a name-based fallback for JUCE plugins that omit
  `pg:sideChainOf` but name the group "sidechain". Three lines plus a helper.
- **#561 — Plugin categories.** A curated category set with a name/type/author
  heuristic that only runs to refine an unhelpful declared class. Two things
  left out on purpose and called out in the PR: the localStorage
  re-categorisation override (its only caller is a fork-only component), and
  five unrelated fixes that happen to live in `LoadPluginDialog.tsx`.
  Internationalisation is still open — the labels are English literals.
- **#562 — Dragonfly custom layouts.** Covers `urn:dragonfly:early`/`:plate`/`:room`;
  Hall has a different control set and isn't included. Also carries a small
  `ControlViewFactory` fix so a registered custom view doesn't shadow the MOD UI
  when the user has asked for it.
- **#563 — Numeric (atom:Float) patch properties.** Today
  `FindWritablePathProperties` accepts only `atom:Path` and `atom:String`;
  anything else sets `unsupportedPatchProperty` and the plugin vanishes from the
  list. This adds an `atom:Float` branch and reads the usual range/portProperty/
  scalePoint metadata so the properties render with the existing `PluginControl`.
  It also finally populates `rdfs:label`, which was already serialized but never
  set. No protocol change. It deliberately does *not* touch `ModGuiHost` —
  resolving MOD-GUI `mod-port-symbol` references to patch properties is a much
  larger separate diff.

**ToobAmp**

- **#86 — output-level metadata.** Two unambiguous bugs: `output_level_dbu` was
  assigned from `GetModelInputLevelDBu()`, and `fgModelMetadata.flags` was
  written before `has_output_level_dbu` was OR-ed in, so the host never saw the
  bit. Seven lines, no design decision in it.

---

**Your TTL-ordering question.** You asked whether the parser preserves the
control order a JUCE plugin intends, since Turtle guarantees nothing about
statement order. I traced it rather than guessed:

For **control ports** the concern doesn't apply. `lv2:index` is mandatory,
lilv places each port at its declared index, and PiPedal additionally sorts
`ports_` by `index()` before anything else sees them; `Lv2PluginUiInfo` walks
that sorted list, and port-group order falls out of the first port index in each
group. JUCE emits ports in parameter order with sequential indices, so the
intended order survives end to end. Nothing to fix.

For **patch properties** it's a real problem. `lv2:Parameter` has no mandatory
index, and plugins do exist that put every control on patch properties rather
than ports — the Dusk Audio set does exactly that. #563 sorts by `lv2:index`
where declared and falls back to the label, which is deterministic but is not
the plugin's intended order. Whether PiPedal should require an index on
parameters, define its own convention, or lean on `modgui` for those plugins is
your call, not mine — I'd rather ask than pick.

---

**On the parts you declined:** understood on both, and no PR is coming for
either.

On preset changes and reverb tails — you suspected the fork doesn't preserve
them the way snapshots do. I checked: it does.
`PluginHost::UpdateLv2PedalboardStructure` keeps an `ExistingEffectMap`, and
`PedalboardItem::IsStructurallyIdentical` (instance ID, URI, MIDI bindings)
decides whether an instance is reused rather than recreated. So structurally
identical preset changes already reuse the effect and keep the tail. That's
upstream behaviour, not something the fork added.

On multipath: I'll wait for your main/aux channel model rather than re-proposing
mine. The input-terminal noise gate was scoped on top of per-path terminals, so
it needs re-scoping against your design once it exists — I'd rather redo it than
hand you something shaped around a routing model you don't want.

---

**One thing I'd like your view on before I write any of it: NAM calibration.**

I'm not proposing the PiPedal half, because it can't work correctly against the
ToobAmp that ships today. Reading the TTL of each build:

| build | `calibration` port name | range | default |
|---|---|---|---|
| ToobAmp master (2026-07-27) | `Value` | −30 … 12 | −6.0 |
| my patched arm64 build | `Interface Input Level` | −60 … 60 | 13.0 |

The two ports mean different things — "analog input level in dBu RMS
corresponding to 0 dBFS peak" versus "measured instrument voltage level in dBu".
`PiPedalModel.cpp` writes 13.0 for an RME Babyface, which against the stock
plugin is both out of range and the wrong quantity, silently. So the ToobAmp
side has to land first, and since it redefines an existing port it needs a
versioning story. You own both repos, so the ordering is yours to pick. I'd
take you up on the versioning advice you offered *before* I write migration
code — my schema steps 2→6 were designed around the patched semantics, and if
you choose a different ToobAmp-side design the migration path changes with it.

The rest of that patch file is two further topics I've kept out entirely: the
calibration redefinition above, and some Pi-specific realtime work (CPU pinning,
buffer preallocation) in `NamBackgroundProcessor.*`, `ConvolutionReverb.cpp` and
`AudioThreadToBackgroundQueue.cpp` that has nothing to do with calibration.

Happy to reshape, split, or drop any of the six. Thanks again for the time you
put into the review.
