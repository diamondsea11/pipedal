// Copyright (c) 2026 Thomas Rapolani
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from "react";
import { css } from "@emotion/react";
import { Theme } from "@mui/material/styles";
import { withStyles } from "tss-react/mui";

import IControlViewFactory from "./IControlViewFactory";
import { PedalboardItem } from "./Pedalboard";
import { ListenHandle, PiPedalModel, PiPedalModelFactory } from "./PiPedalModel";
import PluginControlView, {
    ControlGroup,
    ControlViewCustomization,
    ICustomizationHost
} from "./PluginControlView";
import PatchPropertyControl from "./PatchPropertyControl";
import WithStyles, { createStyles } from "./WithStyles";

interface DuskSection {
    name: string;
    controls: string[];
}

interface DuskDefinition {
    uri: string;
    title: string;
    family: string;
    // Colours below are taken from each plugin's own JUCE LookAndFeel in the
    // upstream dusk-audio/dusk-audio-plugins source, so the PiPedal skin matches
    // the original plugin's palette rather than an invented one.
    accent: string;
    secondary: string;
    background?: string;
    panel?: string;
    sections: DuskSection[];
    gainReductionProperty?: string;
}

const bandControls = (band: number): string[] => {
    const prefix = `band${band}_`;
    const edge = band === 1 || band === 8;
    return edge
        ? [
            `${prefix}enabled`, `${prefix}freq`, `${prefix}q`,
            `${prefix}channel_routing`, `${prefix}slope`, `${prefix}invert`,
            `${prefix}phase_invert`, `${prefix}pan`
        ]
        : [
            `${prefix}enabled`, `${prefix}freq`, `${prefix}gain`, `${prefix}q`,
            `${prefix}shape`, `${prefix}channel_routing`, `${prefix}sat_type`,
            `${prefix}sat_drive`, `${prefix}invert`, `${prefix}phase_invert`,
            `${prefix}pan`
        ];
};

const dynamicBandControls = (band: number): string[] => {
    const prefix = `band${band}_dyn_`;
    return [
        `${prefix}enabled`, `${prefix}threshold`, `${prefix}ratio`,
        `${prefix}attack`, `${prefix}release`, `${prefix}range`
    ];
};

const compressorEngine = (name: string, prefix: string, controls: string[]): DuskSection => ({
    name,
    controls: controls.map(control => `${prefix}_${control}`)
});

const DUSK_DEFINITIONS: DuskDefinition[] = [
    {
        uri: "https://dusk-audio.github.io/plugins/duskverb",
        title: "DuskVerb",
        family: "ALGORITHMIC REVERB",
        accent: "#e89c4f",
        secondary: "#4a9eff",
        background: "#1a1a1a",
        panel: "#242424",
        sections: [
            { name: "Main", controls: ["algorithm", "mix", "bus_mode", "bypass", "predelay", "predelay_sync", "decay", "size"] },
            { name: "Motion", controls: ["mod_depth", "mod_rate", "tail_spin_depth", "tail_spin_rate", "diffusion", "saturation", "width"] },
            { name: "Decay Spectrum", controls: ["sub_mult", "bass_mult", "mid_mult", "hi_mid_mult", "damping", "crossover_sub", "crossover", "high_crossover", "crossover_air"] },
            { name: "Input Shape", controls: ["transient_shaper", "shaper_time", "shaper_xover", "shaper_sens", "input_sub_gain", "input_mid_gain", "input_high_gain", "bass_choke"] },
            { name: "Early Reflections", controls: ["er_level", "er_size", "er_boost", "er_rise", "er_bus_low_gain", "er_bus_high_gain", "er_stereo_neutral", "er_decorr", "xtalk"] },
            { name: "Tank", controls: ["tank_level", "tank_split_hz", "qt_himid_mult", "qt_air_mult", "freeze", "gate_enabled", "duck", "gain_trim"] },
            { name: "Multiband", controls: ["mb_enable", "mb_low_decay", "mb_mid_decay", "mb_high_decay", "lo_cut", "hi_cut", "hi_cut_shelf_db"] },
            { name: "Post EQ", controls: ["pteq_band0_gain_db", "pteq_band1_gain_db", "pteq_band2_gain_db", "pteq_band3_gain_db", "post_band_sub_db", "post_band_lowmid_db", "post_band_midhi_db", "post_band_air_db"] },
            { name: "Envelope", controls: ["edt_sub_attack_db", "edt_sub_tau_ms", "edt_lowmid_attack_db", "edt_lowmid_tau_ms", "edt_midhi_attack_db", "edt_midhi_tau_ms", "edt_air_attack_db", "edt_air_tau_ms"] },
            { name: "Bass Motion", controls: ["in_loop_peak_hz", "in_loop_peak_q", "in_loop_peak_db", "bass_shelf_fast_fc", "bass_shelf_slow_fc", "bass_shelf_fast_db", "bass_shelf_slow_db", "bass_shelf_transition_ms"] },
            { name: "Stereo & Character", controls: ["mono_below", "mono_below_depth", "tone", "character", "tonal_correction", "dpv_hf_shelf_db", "dpv_hf_shelf_hz", "dpv_struct_hf_damp_hz", "dpv_box_cut_db", "dpv_box_cut_hz", "dpv_bass_shelf_db", "dpv_bass_shelf_hz"] },
        ]
    },
    {
        uri: "https://dusk-audio.github.io/plugins/multi-comp",
        title: "Multi-Comp",
        family: "MULTI-MODE DYNAMICS",
        accent: "#ffaa00",
        secondary: "#cc6600",
        background: "#161616",
        panel: "#232323",
        gainReductionProperty: "gr_meter",
        sections: [
            { name: "Global", controls: ["mode", "bypass", "mix", "stereo_link", "stereo_link_mode", "auto_makeup", "global_lookahead", "oversampling", "true_peak_enable", "true_peak_quality"] },
            { name: "Sidechain", controls: ["sidechain_enable", "sidechain_hp", "global_sidechain_listen", "sc_low_freq", "sc_low_gain", "sc_high_freq", "sc_high_gain"] },
            { name: "Colour", controls: ["distortion_type", "distortion_amount", "envelope_curve", "saturation_mode", "noise_enable"] },
            compressorEngine("Opto", "opto", ["peak_reduction", "gain", "limit"]),
            compressorEngine("Vintage FET", "fet", ["input", "output", "attack", "release", "ratio", "threshold", "curve_mode", "transient"]),
            compressorEngine("Classic VCA", "vca", ["threshold", "ratio", "attack", "release", "output", "overeasy", "detector_mode"]),
            compressorEngine("Bus VCA", "bus", ["threshold", "ratio", "attack", "release", "makeup", "mix"]),
            compressorEngine("Studio VCA", "studio_vca", ["threshold", "ratio", "attack", "release", "output", "mix"]),
            compressorEngine("Digital", "digital", ["threshold", "ratio", "knee", "attack", "release", "lookahead", "mix", "output", "adaptive"]),
            { name: "MB Crossovers", controls: ["mb_crossover_1", "mb_crossover_2", "mb_crossover_3", "mb_output", "mb_mix"] },
            { name: "MB Low", controls: ["mb_low_enabled", "mb_low_threshold", "mb_low_ratio", "mb_low_attack", "mb_low_release", "mb_low_makeup", "mb_low_bypass", "mb_low_solo"] },
            { name: "MB Low-Mid", controls: ["mb_lowmid_enabled", "mb_lowmid_threshold", "mb_lowmid_ratio", "mb_lowmid_attack", "mb_lowmid_release", "mb_lowmid_makeup", "mb_lowmid_bypass", "mb_lowmid_solo"] },
            { name: "MB High-Mid", controls: ["mb_highmid_enabled", "mb_highmid_threshold", "mb_highmid_ratio", "mb_highmid_attack", "mb_highmid_release", "mb_highmid_makeup", "mb_highmid_bypass", "mb_highmid_solo"] },
            { name: "MB High", controls: ["mb_high_enabled", "mb_high_threshold", "mb_high_ratio", "mb_high_attack", "mb_high_release", "mb_high_makeup", "mb_high_bypass", "mb_high_solo"] },
        ]
    },
    {
        uri: "https://dusk-audio.github.io/plugins/multi-q",
        title: "Multi-Q",
        family: "DYNAMIC EQUALIZER",
        accent: "#4488ff",
        secondary: "#e89c4f",
        background: "#181818",
        panel: "#222224",
        sections: [
            { name: "Master", controls: ["master_gain", "bypass", "hq_enabled", "processing_mode", "q_couple_mode", "eq_type", "auto_gain_enabled", "limiter_enabled", "limiter_ceiling"] },
            ...Array.from({ length: 8 }, (_, index) => ({ name: `Band ${index + 1}`, controls: bandControls(index + 1) })),
            { name: "Analyzer", controls: ["analyzer_enabled", "analyzer_pre_post", "analyzer_mode", "analyzer_resolution", "analyzer_smoothing", "analyzer_decay", "display_scale_mode", "visualize_master_gain"] },
            { name: "Match", controls: ["match_apply", "match_smoothing", "match_limit_boost", "match_limit_cut"] },
            { name: "British Filters", controls: ["british_hpf_enabled", "british_hpf_freq", "british_lpf_enabled", "british_lpf_freq", "british_mode", "british_saturation", "british_input_gain", "british_output_gain"] },
            { name: "British Low", controls: ["british_lf_gain", "british_lf_freq", "british_lf_bell", "british_lm_gain", "british_lm_freq", "british_lm_q"] },
            { name: "British High", controls: ["british_hm_gain", "british_hm_freq", "british_hm_q", "british_hf_gain", "british_hf_freq", "british_hf_bell"] },
            { name: "Tube EQ Low", controls: ["pultec_lf_boost_gain", "pultec_lf_boost_freq", "pultec_lf_atten_gain", "pultec_input_gain", "pultec_output_gain", "pultec_tube_drive"] },
            { name: "Tube EQ High", controls: ["pultec_hf_boost_gain", "pultec_hf_boost_freq", "pultec_hf_boost_bw", "pultec_hf_atten_gain", "pultec_hf_atten_freq", "pultec_mid_enabled", "pultec_mid_low_freq", "pultec_mid_low_peak", "pultec_mid_dip_freq", "pultec_mid_dip", "pultec_mid_high_freq", "pultec_mid_high_peak"] },
            ...Array.from({ length: 8 }, (_, index) => ({ name: `Dynamics ${index + 1}`, controls: dynamicBandControls(index + 1) })),
            { name: "Dynamics Global", controls: ["dyn_detection_mode"] },
        ]
    },
    {
        uri: "https://dusk-audio.github.io/plugins/_4K_EQ",
        title: "4K EQ",
        family: "CONSOLE EQUALIZER",
        accent: "#007bff",
        secondary: "#c44444",
        background: "#242424",
        panel: "#2f2f2f",
        sections: [
            { name: "Master", controls: ["eq_type", "bypass", "input_gain", "output_gain", "saturation", "oversampling", "ms_mode", "auto_gain"] },
            { name: "Filters", controls: ["hpf_enabled", "hpf_freq", "lpf_enabled", "lpf_freq"] },
            { name: "Low", controls: ["lf_gain", "lf_freq", "lf_bell"] },
            { name: "Low-Mid", controls: ["lm_gain", "lm_freq", "lm_q"] },
            { name: "High-Mid", controls: ["hm_gain", "hm_freq", "hm_q"] },
            { name: "High", controls: ["hf_gain", "hf_freq", "hf_bell"] },
            { name: "Display", controls: ["spectrum_prepost"] },
        ]
    },
    {
        uri: "https://dusk-audio.github.io/plugins/tapemachine",
        title: "TapeMachine",
        family: "ANALOG TAPE",
        accent: "#c4a77d",
        secondary: "#d4c090",
        background: "#1a1512",
        panel: "#2d2520",
        sections: [
            { name: "Machine", controls: ["tapeMachine", "tapeSpeed", "tapeType", "signalPath", "eqStandard", "calibration", "autoCal"] },
            { name: "Gain & Tone", controls: ["inputGain", "saturation", "bias", "highpassFreq", "lowpassFreq", "outputGain", "autoComp"] },
            { name: "Motion & Noise", controls: ["noiseEnabled", "noiseAmount", "wowAmount", "flutterAmount"] },
            { name: "Quality", controls: ["oversampling", "bypass"] },
        ]
    },
    {
        uri: "https://dusk-audio.github.io/plugins/tapemachine-2",
        title: "TapeMachine 2",
        family: "ADVANCED TAPE",
        accent: "#c4a77d",
        secondary: "#d4c090",
        background: "#1a1512",
        panel: "#2d2520",
        sections: [
            { name: "Machine", controls: ["tapeMachine", "tapeSpeed", "tapeType", "signalPath", "eqStandard", "calibration", "autoCal", "headWidth"] },
            { name: "Gain & Tone", controls: ["inputGain", "bias", "highpassFreq", "lowpassFreq", "outputGain", "autoComp"] },
            { name: "Motion & Noise", controls: ["noiseEnabled", "noiseAmount", "wowAmount", "flutterAmount", "wowFlutterOn", "crosstalk", "transformer"] },
            { name: "Repro EQ", controls: ["reproLF", "reproLMF", "reproHMF", "reproHF", "reproSubBell"] },
            { name: "Advanced", controls: ["levelHmfTrim", "levelHfTrim", "lpQ", "progHmfTrim", "progHfTrim", "progLfTrim", "oversampling"] },
        ]
    },
    {
        uri: "https://dusk-audio.github.io/plugins/spectrum-analyzer",
        title: "Spectrum Analyzer",
        family: "ANALYSIS",
        accent: "#00aaff",
        secondary: "#ffaa00",
        background: "#1a1a1a",
        panel: "#252525",
        sections: [
            { name: "Analysis", controls: ["channelMode", "fftResolution", "smoothing", "slope", "decayRate", "peakHold", "peakHoldTime"] },
            { name: "Display", controls: ["displayMin", "displayMax", "kSystemType"] },
        ]
    },
];

const styles = (_theme: Theme) => createStyles({
    skin: css({
        width: "100%",
        height: "100%",
        color: "#e0e0e0",
        background: "var(--dusk-bg, #1a1a1a)",
        "& [data-pipedal-role='plugin-control-frame']": { background: "var(--dusk-bg, #1a1a1a)" },
        "& [data-pipedal-role='control-grid']": {
            gap: 7,
            rowGap: 7,
            padding: "8px 42px 16px 20px",
            alignContent: "flex-start",
        },
        "& [data-pipedal-role='custom-control']": {
            width: "100%",
            height: "auto",
            flex: "1 0 100%",
        },
        "& [data-pipedal-role='control-group']": {
            minHeight: 158,
            margin: 0,
            padding: "12px 9px 7px",
            color: "#e0e0e0",
            background: "var(--dusk-panel, #242424)",
            border: "1px solid #3a3a3a",
            borderTop: "3px solid var(--dusk-secondary)",
            borderRadius: 4,
            boxShadow: "none",
        },
        "& [data-pipedal-role='control-group-title']": {
            minWidth: 0,
            position: "absolute",
            top: 8,
            left: 12,
            margin: 0,
            padding: 0,
            color: "#cfd4d2",
            background: "transparent",
            textTransform: "uppercase",
        },
        "& [data-pipedal-role='control-group-title'] p": {
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0,
        },
        "& [data-pipedal-role='control-group-controls']": {
            minWidth: 170,
            paddingTop: 23,
            paddingBottom: 0,
        },
        "& [data-group-name='Main'], & [data-group-name='Global'], & [data-group-name='Master'], & [data-group-name='Machine']": {
            borderTopColor: "var(--dusk-accent)",
        },
        "& [data-group-name^='Band '], & [data-group-name^='Dynamics ']": {
            borderTopColor: "#6e9fca",
        },
        "& [data-group-name*='Low'], & [data-group-name='Bass Motion']": {
            borderTopColor: "#b78a5e",
        },
        "& [data-group-name*='High'], & [data-group-name='Motion']": {
            borderTopColor: "#a97596",
        },
    }),
    header: css({
        minHeight: 72,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 24px",
        color: "#f0f0f0",
        background: "var(--dusk-panel, #202425)",
        borderTop: "4px solid var(--dusk-accent)",
        borderBottom: "1px solid #3a3a3a",
        boxSizing: "border-box",
        "@media (max-width: 700px)": {
            padding: "9px 16px",
            gap: 11,
            flexWrap: "wrap",
        },
    }),
    mark: css({
        width: 42,
        height: 42,
        position: "relative",
        flex: "0 0 42px",
        border: "2px solid var(--dusk-accent)",
        borderRadius: 4,
        "&::before": {
            content: "\"\"",
            width: 22,
            height: 2,
            position: "absolute",
            top: 19,
            left: 8,
            background: "var(--dusk-secondary)",
            boxShadow: "0 -7px 0 var(--dusk-accent), 0 7px 0 var(--dusk-accent)",
        },
    }),
    title: css({
        minWidth: 190,
        display: "flex",
        flexDirection: "column",
        "& strong": { fontSize: 21, lineHeight: "24px", fontWeight: 700 },
        "& span": { marginTop: 2, color: "#aeb6b3", fontSize: 11, lineHeight: "14px", fontWeight: 700 },
    }),
    badges: css({
        display: "flex",
        alignItems: "center",
        gap: 7,
        marginLeft: "auto",
    }),
    badge: css({
        minHeight: 24,
        display: "flex",
        alignItems: "center",
        padding: "3px 8px",
        color: "#dce1df",
        background: "#292e2f",
        border: "1px solid #596061",
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 700,
        whiteSpace: "nowrap",
    }),
    meter: css({
        minWidth: 230,
        display: "grid",
        gridTemplateColumns: "auto minmax(120px, 1fr) 52px",
        alignItems: "center",
        gap: 9,
        marginLeft: 4,
        fontSize: 11,
        fontWeight: 700,
        "@media (max-width: 800px)": { width: "100%", marginLeft: 0 },
    }),
    meterTrack: css({
        height: 9,
        position: "relative",
        overflow: "hidden",
        background: "#101213",
        border: "1px solid #4c5354",
        borderRadius: 2,
    }),
    meterFill: css({
        height: "100%",
        background: "linear-gradient(90deg, #3fae6a 0%, #ffaa00 62%, #cc3b30 100%)",
        transition: "width 70ms linear",
    }),
    meterValue: css({
        color: "#eef0ef",
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
    }),
});

interface GainReductionMeterProps {
    classes: Record<string, string>;
    instanceId: number;
    propertyUri: string;
}

function GainReductionMeter(props: GainReductionMeterProps) {
    const model = PiPedalModelFactory.getInstance();
    const [reduction, setReduction] = useState(0);

    useEffect(() => {
        let mounted = true;
        const handle: ListenHandle = model.monitorPatchProperty(
            props.instanceId,
            props.propertyUri,
            (_instanceId, _uri, value) => {
                if (mounted && typeof value === "number") {
                    setReduction(Math.max(0, Math.min(30, -value)));
                }
            }
        );
        void model.getPatchProperty<number>(props.instanceId, props.propertyUri)
            .then(value => {
                if (mounted && typeof value === "number") {
                    setReduction(Math.max(0, Math.min(30, -value)));
                }
            })
            .catch(() => { });
        return () => {
            mounted = false;
            model.cancelMonitorPatchProperty(handle);
        };
    }, [model, props.instanceId, props.propertyUri]);

    return (
        <div className={props.classes.meter}>
            <span>GAIN REDUCTION</span>
            <div className={props.classes.meterTrack}>
                <div className={props.classes.meterFill} style={{ width: `${reduction / 30 * 100}%` }} />
            </div>
            <span className={props.classes.meterValue}>{reduction.toFixed(1)} dB</span>
        </div>
    );
}

interface DuskViewProps extends WithStyles<typeof styles> {
    instanceId: number;
    item: PedalboardItem;
    definition: DuskDefinition;
}

const DuskView = withStyles(
    class extends React.Component<DuskViewProps> implements ControlViewCustomization {
        model: PiPedalModel;
        customizationId = 40;

        constructor(props: DuskViewProps) {
            super(props);
            this.model = PiPedalModelFactory.getInstance();
        }

        fullScreen(): boolean {
            return false;
        }

        makeGroup(host: ICustomizationHost, section: DuskSection): ControlGroup | null {
            const plugin = this.model.getUiPlugin(this.props.item.uri);
            if (!plugin) return null;

            const indexes: number[] = [];
            const controls: React.ReactNode[] = [];
            for (const id of section.controls) {
                const control = plugin.getControl(id);
                if (control && !control.isHidden()) {
                    indexes.push(control.index);
                    controls.push(host.makeStandardControl(control, this.props.item.controlValues));
                    continue;
                }
                const property = plugin.patchProperties.find(item =>
                    item.uri.endsWith(`:${id}`) && item.isNumeric() && (item.writable || item.readable)
                );
                if (property) {
                    indexes.push(property.index);
                    controls.push(
                        <PatchPropertyControl
                            key={property.uri}
                            instanceId={this.props.instanceId}
                            property={property}
                        />
                    );
                }
            }
            if (controls.length === 0) return null;
            return new ControlGroup(section.name, indexes, controls);
        }

        modifyControls(
            host: ICustomizationHost,
            _controls: (React.ReactNode | ControlGroup)[]
        ): (React.ReactNode | ControlGroup)[] {
            const classes = withStyles.getClasses(this.props);
            const plugin = this.model.getUiPlugin(this.props.item.uri);
            const result: (React.ReactNode | ControlGroup)[] = [
                <div className={classes.header} key="dusk-header">
                    <div className={classes.mark} aria-hidden="true" />
                    <div className={classes.title}>
                        <strong>{this.props.definition.title}</strong>
                        <span>DUSK AUDIO / {this.props.definition.family}</span>
                    </div>
                    {this.props.definition.gainReductionProperty && plugin && (() => {
                        const property = plugin.patchProperties.find(item =>
                            item.uri.endsWith(`:${this.props.definition.gainReductionProperty}`)
                        );
                        return property ? (
                            <GainReductionMeter
                                classes={classes}
                                instanceId={this.props.instanceId}
                                propertyUri={property.uri}
                            />
                        ) : null;
                    })()}
                    <div className={classes.badges}>
                        <div className={classes.badge}>LV2</div>
                        <div className={classes.badge}>STEREO</div>
                    </div>
                </div>
            ];
            for (const section of this.props.definition.sections) {
                const group = this.makeGroup(host, section);
                if (group) result.push(group);
            }
            return result;
        }

        render() {
            const classes = withStyles.getClasses(this.props);
            const skinStyle = {
                "--dusk-accent": this.props.definition.accent,
                "--dusk-secondary": this.props.definition.secondary,
                "--dusk-bg": this.props.definition.background ?? "#1a1a1a",
                "--dusk-panel": this.props.definition.panel ?? "#242424",
            } as React.CSSProperties;
            return (
                <div className={classes.skin} style={skinStyle}>
                    <PluginControlView
                        instanceId={this.props.instanceId}
                        item={this.props.item}
                        customization={this}
                        customizationId={this.customizationId}
                        showModGui={false}
                        onSetShowModGui={() => { }}
                    />
                </div>
            );
        }
    },
    styles
);

class DuskViewFactory implements IControlViewFactory {
    uri: string;
    private definition: DuskDefinition;

    constructor(definition: DuskDefinition) {
        this.definition = definition;
        this.uri = definition.uri;
    }

    Create(_model: PiPedalModel, pedalboardItem: PedalboardItem): React.ReactNode {
        return (
            <DuskView
                key={pedalboardItem.instanceId}
                instanceId={pedalboardItem.instanceId}
                item={pedalboardItem}
                definition={this.definition}
            />
        );
    }
}

export const duskViewFactories: IControlViewFactory[] =
    DUSK_DEFINITIONS.map(definition => new DuskViewFactory(definition));
