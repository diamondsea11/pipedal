## TooB Neural Amp Modeler Calibration

TooB Neural Amp Modeler uses the same calibration convention as NAM Gateway.
Calibration matches the analog reference level of your audio interface to the
reference level stored in a `.nam` model.

### Interface Input Level

`Interface Input Level` is **not** the measured output level of your guitar.
It is the analog input level, in dBu RMS, that produces a digital 1 kHz sine
wave at 0 dBFS peak in your audio interface.

For example, if the interface specification says that its maximum input level
is `+13 dBu` at the gain setting you use, enter `13.0`. PiPedal automatically
recognizes many common interfaces using values from the
[Ghost Note Audio Input Gain database](https://ghostnoteaudio.uk/pages/app-inputgain).
Unknown interfaces default to NAM Gateway's `+12 dBu`. A value entered in the
Audio Device dialog is stored for that specific ALSA device and always takes
priority over automatic detection.

Some database values require a particular input mode, Pad setting, or minimum
gain. PiPedal can identify the interface model but cannot reliably read those
settings on every USB interface. Changing the interface gain or reference mode
therefore requires updating the stored calibration value to match.

The `.nam` file can contain `input_level_dbu`, the corresponding reference
level of the interface used to create the model. With Input Calibration on,
TooB applies:

```text
input adjustment (dB) =
    interface input level (dBu) - model input_level_dbu (dBu)
```

Input Gain is then added to this adjustment. Leave Input Gain at `0 dB` for a
strictly calibrated result, or use it as a creative trim.

If a model has no `input_level_dbu` metadata, Input Calibration is unavailable
and the signal is passed to the model without a calibration adjustment.

Input Calibration defaults to `Calibrated`. The adjustment is applied only
for captures that provide `input_level_dbu`; captures without the metadata
remain at unity gain.

### Output Calibration

Output Calibration has the same three modes as NAM Gateway:

- `Raw`: no metadata-based output adjustment.
- `Normalized`: adjusts the model's stored loudness toward `-18 dB`.
- `Calibrated`: matches the model output reference to the interface input
  reference entered above.

For Calibrated output, TooB applies:

```text
output adjustment (dB) =
    model output_level_dbu (dBu) - interface input level (dBu)
```

This is mainly useful when a model represents a pedal or another device whose
output feeds calibrated downstream equipment. For ordinary amp and full-rig
models, `Normalized` is generally the practical choice.

If the model lacks the metadata required by a mode, TooB applies no
metadata-based output adjustment. It does not silently switch to another
output mode.

### Setup

1. Find the maximum analog input level for the interface input and gain setting
   you use. Consult the interface specifications or measure it with a calibrated
   sine wave.
2. Enter that value in `Interface Input Level`.
3. Turn on `Input Calibration` when the loaded model provides input calibration
   metadata.
4. Keep `Input Gain` at `0 dB` for reference behavior.
5. Choose `Normalized` output for normal playing, or `Calibrated` when matching
   an analog downstream signal chain.

Changing the guitar, pickup, playing strength, or guitar volume does not
invalidate interface calibration. Changing the audio-interface input gain or
reference level does.

### Model Quality

`Quality` defaults to `1.0`, which loads the full A2 network for slimmable A2
captures. The setting has no effect on captures that do not support slimming.

--------
[<< An Intro to Snapshots](Snapshots.md) | [Up](Documentation.md) | [Choosing a USB Audio Adapter >>](ChoosingAUsbAudioAdapter.md)
