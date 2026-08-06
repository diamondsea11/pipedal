# Reply to Robin Davies — email (rerdavies@gmail.com)

*Draft. Not sent, not posted. Review and edit freely before using.*
*He asked to move this off the discussion and onto direct email — so send it there.*

> **YOU MUST FILL THESE IN BEFORE SENDING — I can't answer them for you.**
> Search the draft for `[[TODO` to find each spot.
>
> 1. **Credentials + how AI-assisted this is.** His first two questions, and he
>    said explicitly that the answers decide how carefully he reviews the PRs.
>    Answer them plainly; understating the AI involvement would be found out in
>    review and would cost the whole relationship.
> 2. **Is the restyling copying Helix?** He likes the control-group restyling
>    ("especially", "definitely like to pull that in") but said he has a problem
>    with slavishly copying Helix UI. He specifically likes the *square groups*.
> 3. **UI conventions.** He asked directly: "Discuss your UI conventions,
>    please." Long-press is reserved for the plugin browser in his UI; he's
>    weighing double-tap; Android discourages context menus; multiselect vs.
>    drag-to-scroll is his concrete worry.

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

**Responsive UI — you were right to be suspicious.** Honest answer, checked
rather than claimed:

The custom plugin layouts do carry breakpoints — `DragonflyView` has
`@media (max-width: 700px)` rules. But that only helps a narrow *portrait*
phone; at 800x400 landscape the width is 800, the rule never fires, and the
constraint is the 400 px height, which nothing in there accounts for. So even
the part that has provisions doesn't have the right ones for your worst case.

The larger new surfaces — the Gig view, the Control Hub, the graphical Global
EQ, the inline plugin browser — have **no** responsive handling at all. Zero
media queries, no `ResizeResponsiveComponent`, no landscape/portrait branch.
They were laid out against an iPad Pro landscape viewport and nothing else. If
you pull any of them, assume they need the responsive work done from scratch,
and please don't take my word that they'll degrade gracefully — they won't.

None of those are in the six PRs, so nothing currently in front of you carries
that problem except the Dragonfly layout, where the breakpoint is present but
untested below 700 px and unhelpful at 800x400.

---

**Custom layouts — I want to check a scoping decision with you.** You named
Chow Tape, Calf, Dragonfly and Dusk. Only Dragonfly is in #562, and I should be
straight about why the others aren't:

- **Chow Tape and Calf** in my fork are not PiPedal code at all — they're MOD
  GUI skins (HTML/CSS/`modgui.ttl`) that get installed *into the plugin
  bundles*. Shipping them from the PiPedal tree means PiPedal starts carrying
  third-party plugin assets. I assumed you'd rather not, but that was my
  assumption, not something you said. If you do want them, say so and I'll
  prepare them — the question is where they should live, not whether they work.
- **Dusk** is a 540-line hardcoded view enumerating several hundred control
  symbols by hand across four plugins. It works, but it's a maintenance
  liability that breaks silently whenever Dusk renames anything, and it depends
  on #563 landing first. I'd rather you look at it and tell me it's worth it
  than push it at you. Say the word and it's a PR.
- **Dragonfly Hall** is deliberately out of #562 — different control set,
  and I didn't want to guess at it.

---

**Preset directories — taking your advice.** Point taken on
`/var/pipedal/presets` and the incompatible-preset problem; the experimental
release should not be able to contaminate a mainline install. I'll move the
fork's preset tree to its own directory and follow the existing preset-upgrade
code as the place to copy factory presets across. That's fork hygiene, not
something you need to review.

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

---

**Still to come from me, not forgotten:**

- The **control-group restyling** you singled out. It's not in this batch
  because I want to answer your Helix question first — [[TODO: see the note at
  the top; if it *is* Helix-derived, say so and offer the square-group idea on
  its own merits rather than as a port]]. It's a small, self-contained PR once
  that's settled.
- The **MIDI monitor diagnostics**, which you had no objection to. Sequenced
  after the Control Hub conversation only because they share a screen; the
  read-only monitor part can come first if you'd rather see it now.
- **[[TODO: your answer on UI conventions]]** — everything gesture-related
  (block copy/paste/duplicate, long-press, multiselect) is on hold until that
  conversation, per your request. No PR incoming for any of it.

Happy to reshape, split, or drop any of the six. Thanks again for the time you
put into the review.
