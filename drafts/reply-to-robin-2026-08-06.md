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
> 2. **UI conventions.** He asked directly: "Discuss your UI conventions,
>    please." Long-press is reserved for the plugin browser in his UI; he's
>    weighing double-tap; Android discourages context menus; multiselect vs.
>    drag-to-scroll is his concrete worry.
>
> The Helix question is answered below and in #564 — checked against the code:
> the only "Helix" strings anywhere in the fork are a NAM calibration profile
> for a Line 6 Helix used as an audio interface, and a comment describing the
> Control Hub as "Helix Command Center style". Nothing in the restyling.

---

Thanks for going through the fork in that much detail — the point-by-point
reply made it much easier to work out what is actually worth your review time
and what isn't.

I've split the parts you flagged as interesting into eight small draft PRs, one
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
- **#560 — JUCE sidechain port groups.** Directly answering your two
  questions: **selection of a specific plugin's output as another plugin's
  sidechain input is already supported** — and it's not fork work. I owe you a
  correction here: my earlier write-up claimed that as something I'd added.
  Checked against `upstream/main` and the whole mechanism —
  `sideChainInputId`, its `GetEffect()` resolution in `Lv2Pedalboard.cpp`, the
  `IEffect`/`Lv2Effect` plumbing, `SideChainSelectControl.tsx` — is already
  yours, byte for byte. So if you were seeing that as a fork feature, it isn't
  one; it's already in `main`.

  **A send from a lower split branch to an upper one is not implemented**,
  in either the fork or upstream. Signal processing is strictly top-to-bottom
  in both, so that direction would still incur the one-buffer delay you asked
  about. Building it means reordering plugin execution, which is new work, not
  an extraction, and I'd want your view on the intended semantics (does the
  reordering apply per-buffer or per-block, does it change bypass/latency
  reporting) before starting rather than guess and hand you something you'd
  have to unwind.

  What #560 actually contains is much narrower: the one genuine gap I found is
  a name-based fallback for JUCE plugins (Dusk Multi-Comp) that omit
  `pg:sideChainOf` but name their port group "sidechain". Three lines plus a
  helper function.
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
- **#564 — control-group styling hooks.** This is the restyling you singled
  out, and the answer to your Helix question is **no**. There is no
  Helix-derived layout, artwork or colour anywhere in it — I went back through
  the fork to check, and the only "Helix" strings in the whole tree are a NAM
  calibration profile for a Line 6 Helix used as an audio interface, and one
  comment describing the Control Hub as "Helix Command Center style" (a
  different feature, and one you've asked to defer anyway).

  What's actually in the PR is six `data-pipedal-role` attributes on the
  control-group frame, title, grid and outer frame, plus `data-group-name`
  carrying the LV2 port-group name. Attributes only — no behaviour change, and
  the default appearance is byte-for-byte identical. The look you liked is a
  *plugin view's own stylesheet* using those as selectors: for Dragonfly,
  squared-off frames (`border-radius: 0`), flush panels with hairline
  separators, inline uppercase titles and a coloured top rule per group, in
  Dragonfly's palette. The square groups are one CSS line in a skin, and any
  skin can decline them.

  **This also fixes #562**, which I got wrong: `DragonflyView` styles
  everything through these selectors, and I extracted the view without noticing
  the attributes it depends on were still only in my fork. On `main` as
  submitted, none of the selectors matched and the skin rendered unstyled. I've
  pushed the missing commit onto that branch too and commented on it.
- **#565 — MIDI monitor.** The diagnostics half you had no objection to, with
  none of the Control Hub material. Right now the only path reporting incoming
  MIDI to a client is MIDI learn, which by design shows only what it can bind
  to; program change, note-off, pitch bend and aftertouch are filtered out in
  two places. So when a footswitch "does nothing" there's nothing to look at,
  and no way to distinguish "sent nothing" from "sent something PiPedal
  ignores". Adds a monitor mode on the existing listener list (learn clients
  receive exactly the same messages as before), plus a read-only dialog off the
  System MIDI Bindings toolbar.

  Two caveats I'd rather state than have you find: this one is **new code, not
  an extraction** — in my fork the monitor lives inside the Control Hub dialog,
  so I rewrote it standalone — and the C++ is **uncompiled**. Also worth your
  judgement: while the monitor is open, every channel-voice message writes to
  the ring buffer rather than only bindable ones. You know that buffer's
  headroom better than I do.

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

**NAM calibration — taking you up on the offer, one thing to settle first.**

Good that you're in favour of this — I'm not proposing the PiPedal half yet,
because it can't work correctly against the ToobAmp that ships today, and I'd
like your take on scope before I touch preset versioning. Reading the TTL of
each build:

| build | `calibration` port name | range | default |
|---|---|---|---|
| ToobAmp master (2026-07-27) | `Value` | −30 … 12 | −6.0 |
| my patched arm64 build | `Interface Input Level` | −60 … 60 | 13.0 |

Worth being precise about what's actually changing, since it's more than a
default: your current port measures the **physical guitar's** signal voltage
(per `NamCalibration.md` — real guitars −20 … −2 dBu, humbucker ≈ −6, single
coil ≈ −11), and step 2 of your procedure deliberately trims the interface out
of the picture before that number ever gets used
(`Db2Af(calibrationDbu - modelInputLevelDbu)` in `CalculateNamVolumeAdjustments`
only ever sees the guitar level and the model's training level). The NAM
Gateway convention my fork uses is a different quantity — the *interface's*
dBu level at 0 dBFS — auto-resolved per device rather than measured with a
voltmeter. So this isn't tightening a range, it's redefining what the port
means, which is exactly the kind of change your own instinct to ask for
"careful versioning" is right to flag.

Where the fork's value comes from, concretely:
`JackServerSettings::GetNamInputCalibrationDbu()` resolves it as an explicit
per-ALSA-device user override, else a lookup in a 69-entry table built from the
public Ghost Note Audio "Amp Simulation Input Gain" database
(https://ghostnoteaudio.uk/pages/app-inputgain) matched on the ALSA device
name, else a 12.0 dBu fallback — unit-tested in `jsonTest.cpp`. `PiPedalModel`
writes the result to `toob-nam` automatically on pedalboard load.

One thing I haven't verified and would rather ask than assert: the Ghost Note
figures look like each interface's *maximum* input level, which I'd guess
means gain at minimum. If that's right, the auto-filled value is only accurate
at that gain setting and drifts as soon as the user turns the interface gain
up — worth knowing before it becomes the new default behaviour.

The live bug in the fork right now, unrelated to which design wins: it writes
this interface-semantics number into whichever ToobAmp happens to be
installed. Against my patched arm64 build that's coherent; against stock it
silently puts an interface figure (13.0 for a Babyface Pro) into what is
currently a guitar-voltage port, clamped to 12.0 and misread. That's on me to
fix once the target port semantics are settled, not something for you to
worry about.

**Quality defaults, the other half of what you said yes to:** the patch also
changes `modelSize`'s (`"Slim"`) default from 0.0 to 1.0, `version` from 1.0/max
1.0 to 5.0/max 5.0, and `inputCalibrationMode` stays at default 1.0 (Calibrated)
but the range around it changes. I have not traced what `modelSize`/`Slim`
actually selects in the NAM inference path (full vs. a lighter model variant,
by the naming and the `epp:expensive` tag on it), so I can't yet tell you
whether flipping its default is something every user should get or something
that should ship as an explicit opt-in. I'd rather flag that gap than guess at
it — happy to dig into the NAM core (sdatkinson/neural-amp-modeler) source if
that's where it's decided, once we're talking versioning anyway.

So: happy to build the PiPedal side once ToobAmp defines the new ports and
their defaults. I'd take you up on the versioning advice you offered before
writing migration code — my fork's schema steps 2→6 were built around the
patched semantics for all three of these fields, and the migration path
depends on exactly how you redefine them.

The rest of that patch file is two further topics I've kept out entirely: the
calibration redefinition above, and some Pi-specific realtime work (CPU pinning,
buffer preallocation) in `NamBackgroundProcessor.*`, `ConvolutionReverb.cpp` and
`AudioThreadToBackgroundQueue.cpp` that has nothing to do with calibration.

---

**Still open, waiting on you:**

- **[[TODO: your answer on UI conventions]]** — everything gesture-related
  (block copy/paste/duplicate, long-press, multiselect) is on hold until that
  conversation, per your request. No PR incoming for any of it.
- The **JUCE control-handling** PR turned out not to be needed for control
  ports at all, per the ordering answer above. What remains of that topic is
  the patch-property ordering question, which is #563 plus your design call.
- Control Hub, Gig view, global EQ, the noise gate: all waiting on your
  routing model and your hands-on pass, as you asked.

Happy to reshape, split, or drop any of the eight. Thanks again for the time
you put into the review.
