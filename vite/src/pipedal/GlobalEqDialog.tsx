import React from "react";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    InputAdornment,
    Slider,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EqualizerIcon from "@mui/icons-material/Equalizer";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { Pedalboard } from "./Pedalboard";

export type GlobalEqSettings = {
    enabled: boolean;
    lowCutHz: number;
    lowCutSlopeDb: number;
    lowGainDb: number;
    midGainDb: number;
    midFrequencyHz: number;
    midQ: number;
    highGainDb: number;
    highCutHz: number;
    highCutSlopeDb: number;
};

type GlobalEqDialogProps = {
    open: boolean;
    pedalboard: Pedalboard;
    onChange: (settings: GlobalEqSettings) => void;
    onPreview: (settings: GlobalEqSettings) => void;
    onClose: () => void;
};

type FilterType = "lowPass" | "highPass" | "lowShelf" | "peak" | "highShelf";
type DragTarget = "lowCut" | "lowShelf" | "mid" | "highShelf" | "highCut";
type Coefficients = { b0: number; b1: number; b2: number; a1: number; a2: number };

const SAMPLE_RATE = 48000;
const MIN_FREQUENCY = 10;
const MAX_FREQUENCY = 24000;
const GRAPH_MIN_DB = -24;
const GRAPH_MAX_DB = 12;
const CUT_SLOPES = [6, 12, 18, 24];

function settingsFromPedalboard(pedalboard: Pedalboard): GlobalEqSettings {
    return {
        enabled: pedalboard.globalEqEnabled,
        lowCutHz: pedalboard.globalEqLowCutHz,
        lowCutSlopeDb: pedalboard.globalEqLowCutSlopeDb,
        lowGainDb: pedalboard.globalEqLowGainDb,
        midGainDb: pedalboard.globalEqMidGainDb,
        midFrequencyHz: pedalboard.globalEqMidFrequencyHz,
        midQ: pedalboard.globalEqMidQ,
        highGainDb: pedalboard.globalEqHighGainDb,
        highCutHz: pedalboard.globalEqHighCutHz,
        highCutSlopeDb: pedalboard.globalEqHighCutSlopeDb,
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function frequencyToX(frequency: number, width: number): number {
    return Math.log(clamp(frequency, MIN_FREQUENCY, MAX_FREQUENCY) / MIN_FREQUENCY)
        / Math.log(MAX_FREQUENCY / MIN_FREQUENCY) * width;
}

function xToFrequency(x: number, width: number): number {
    return MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, clamp(x / width, 0, 1));
}

function dbToY(db: number, height: number): number {
    return (GRAPH_MAX_DB - clamp(db, GRAPH_MIN_DB, GRAPH_MAX_DB))
        / (GRAPH_MAX_DB - GRAPH_MIN_DB) * height;
}

function yToDb(y: number, height: number): number {
    return clamp(GRAPH_MAX_DB - y / height * (GRAPH_MAX_DB - GRAPH_MIN_DB), -12, 12);
}

function bypass(): Coefficients {
    return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
}

function firstOrderCut(type: FilterType, frequency: number): Coefficients {
    const k = Math.tan(Math.PI * clamp(frequency, 10, SAMPLE_RATE * 0.45) / SAMPLE_RATE);
    const norm = 1 / (1 + k);
    const b0 = type === "lowPass" ? k * norm : norm;
    return {
        b0,
        b1: type === "lowPass" ? b0 : -b0,
        b2: 0,
        a1: (k - 1) * norm,
        a2: 0,
    };
}

function biquad(type: FilterType, frequency: number, gainDb = 0, q = 0.70710678): Coefficients {
    frequency = clamp(frequency, 10, SAMPLE_RATE * 0.45);
    const a = Math.pow(10, gainDb / 40);
    const omega = 2 * Math.PI * frequency / SAMPLE_RATE;
    const cosine = Math.cos(omega);
    const sine = Math.sin(omega);
    let alphaValue = sine / (2 * q);
    const sqrtA = Math.sqrt(a);
    let b0: number;
    let b1: number;
    let b2: number;
    let a0: number;
    let a1: number;
    let a2: number;

    if (type === "lowPass") {
        b0 = (1 - cosine) * 0.5;
        b1 = 1 - cosine;
        b2 = b0;
        a0 = 1 + alphaValue;
        a1 = -2 * cosine;
        a2 = 1 - alphaValue;
    } else if (type === "highPass") {
        b0 = (1 + cosine) * 0.5;
        b1 = -(1 + cosine);
        b2 = b0;
        a0 = 1 + alphaValue;
        a1 = -2 * cosine;
        a2 = 1 - alphaValue;
    } else if (type === "lowShelf") {
        alphaValue = sine * 0.5 * Math.sqrt(2);
        b0 = a * ((a + 1) - (a - 1) * cosine + 2 * sqrtA * alphaValue);
        b1 = 2 * a * ((a - 1) - (a + 1) * cosine);
        b2 = a * ((a + 1) - (a - 1) * cosine - 2 * sqrtA * alphaValue);
        a0 = (a + 1) + (a - 1) * cosine + 2 * sqrtA * alphaValue;
        a1 = -2 * ((a - 1) + (a + 1) * cosine);
        a2 = (a + 1) + (a - 1) * cosine - 2 * sqrtA * alphaValue;
    } else if (type === "highShelf") {
        alphaValue = sine * 0.5 * Math.sqrt(2);
        b0 = a * ((a + 1) + (a - 1) * cosine + 2 * sqrtA * alphaValue);
        b1 = -2 * a * ((a - 1) + (a + 1) * cosine);
        b2 = a * ((a + 1) + (a - 1) * cosine - 2 * sqrtA * alphaValue);
        a0 = (a + 1) - (a - 1) * cosine + 2 * sqrtA * alphaValue;
        a1 = 2 * ((a - 1) - (a + 1) * cosine);
        a2 = (a + 1) - (a - 1) * cosine - 2 * sqrtA * alphaValue;
    } else {
        b0 = 1 + alphaValue * a;
        b1 = -2 * cosine;
        b2 = 1 - alphaValue * a;
        a0 = 1 + alphaValue / a;
        a1 = -2 * cosine;
        a2 = 1 - alphaValue / a;
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function cutFilters(type: FilterType, frequency: number, slope: number): Coefficients[] {
    if (slope === 6) return [firstOrderCut(type, frequency), bypass()];
    if (slope === 18) return [firstOrderCut(type, frequency), biquad(type, frequency, 0, 1)];
    if (slope === 24) {
        return [biquad(type, frequency, 0, 0.5411961), biquad(type, frequency, 0, 1.306563)];
    }
    return [biquad(type, frequency), bypass()];
}

function magnitudeDb(filter: Coefficients, frequency: number): number {
    const omega = 2 * Math.PI * frequency / SAMPLE_RATE;
    const cos1 = Math.cos(omega);
    const sin1 = Math.sin(omega);
    const cos2 = Math.cos(2 * omega);
    const sin2 = Math.sin(2 * omega);
    const nr = filter.b0 + filter.b1 * cos1 + filter.b2 * cos2;
    const ni = -filter.b1 * sin1 - filter.b2 * sin2;
    const dr = 1 + filter.a1 * cos1 + filter.a2 * cos2;
    const di = -filter.a1 * sin1 - filter.a2 * sin2;
    return 10 * Math.log10(Math.max(1e-12, (nr * nr + ni * ni) / (dr * dr + di * di)));
}

function responseDb(settings: GlobalEqSettings, frequency: number): number {
    const filters = [
        ...cutFilters("highPass", settings.lowCutHz, settings.lowCutSlopeDb),
        biquad("lowShelf", 120, settings.lowGainDb),
        biquad("peak", settings.midFrequencyHz, settings.midGainDb, settings.midQ),
        biquad("highShelf", 4000, settings.highGainDb),
        ...cutFilters("lowPass", settings.highCutHz, settings.highCutSlopeDb),
    ];
    return filters.reduce((sum, filter) => sum + magnitudeDb(filter, frequency), 0);
}

function formatFrequency(frequency: number): string {
    if (frequency >= 1000) return `${(frequency / 1000).toFixed(frequency >= 10000 ? 0 : 1)}k`;
    return `${Math.round(frequency)}`;
}

function qToSlider(q: number): number {
    return Math.log(clamp(q, 0.2, 10) / 0.2) / Math.log(50) * 100;
}

function sliderToQ(value: number): number {
    return Math.round(0.2 * Math.pow(50, value / 100) * 100) / 100;
}

function GlobalEqGraph(props: {
    settings: GlobalEqSettings;
    onPreview: (settings: GlobalEqSettings) => void;
    onCommit: (settings: GlobalEqSettings) => void;
}) {
    const theme = useTheme();
    const width = 760;
    const height = 260;
    const [dragTarget, setDragTarget] = React.useState<DragTarget | null>(null);
    const settingsRef = React.useRef(props.settings);
    settingsRef.current = props.settings;

    const points = React.useMemo(() => {
        const result: string[] = [];
        for (let x = 0; x <= width; x += 3) {
            const frequency = xToFrequency(x, width);
            const y = dbToY(responseDb(props.settings, frequency), height);
            result.push(`${x},${y.toFixed(2)}`);
        }
        return result.join(" ");
    }, [props.settings]);

    const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
        if (!dragTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width * width;
        const y = (event.clientY - rect.top) / rect.height * height;
        const next = { ...settingsRef.current };
        if (dragTarget === "lowCut") next.lowCutHz = clamp(Math.round(xToFrequency(x, width)), 10, 500);
        if (dragTarget === "highCut") next.highCutHz = clamp(Math.round(xToFrequency(x, width)), 1000, 24000);
        if (dragTarget === "mid") {
            next.midFrequencyHz = clamp(Math.round(xToFrequency(x, width)), 100, 8000);
            next.midGainDb = Math.round(yToDb(y, height) * 10) / 10;
        }
        if (dragTarget === "lowShelf") next.lowGainDb = Math.round(yToDb(y, height) * 10) / 10;
        if (dragTarget === "highShelf") next.highGainDb = Math.round(yToDb(y, height) * 10) / 10;
        settingsRef.current = next;
        props.onPreview(next);
    };

    const handleY = (frequency: number) => dbToY(responseDb(props.settings, frequency), height);
    const handles: Array<{ target: DragTarget; frequency: number; color: string }> = [
        { target: "lowCut", frequency: props.settings.lowCutHz, color: "#42a5f5" },
        { target: "lowShelf", frequency: 120, color: "#26c6da" },
        { target: "mid", frequency: props.settings.midFrequencyHz, color: "#f2b84b" },
        { target: "highShelf", frequency: 4000, color: "#ff8a65" },
        { target: "highCut", frequency: props.settings.highCutHz, color: "#ef5350" },
    ];
    const frequencyGrid = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const dbGrid = [-24, -12, -6, 0, 6, 12];

    return (
        <Box sx={{ border: `1px solid ${theme.palette.divider}`, bgcolor: alpha(theme.palette.common.black, 0.24), overflow: "hidden" }}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                width="100%"
                style={{ display: "block", touchAction: "none", minHeight: 220 }}
                onPointerMove={handlePointer}
                onPointerUp={(event) => {
                    if (!dragTarget) return;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    setDragTarget(null);
                    props.onCommit(settingsRef.current);
                }}
                onPointerCancel={() => setDragTarget(null)}
                aria-label="Global EQ response"
            >
                {frequencyGrid.map((frequency) => {
                    const x = frequencyToX(frequency, width);
                    return <g key={frequency}>
                        <line x1={x} x2={x} y1={0} y2={height} stroke={theme.palette.divider} strokeWidth="1" />
                        <text
                            x={frequency === 20000 ? x - 4 : x + 4}
                            y={height - 8}
                            textAnchor={frequency === 20000 ? "end" : "start"}
                            fill={theme.palette.text.secondary}
                            fontSize="11"
                        >{formatFrequency(frequency)}</text>
                    </g>;
                })}
                {dbGrid.map((db) => {
                    const y = dbToY(db, height);
                    return <g key={db}>
                        <line x1={0} x2={width} y1={y} y2={y} stroke={db === 0 ? alpha(theme.palette.common.white, 0.42) : theme.palette.divider} strokeWidth={db === 0 ? 1.5 : 1} />
                        <text x={8} y={y - 5} fill={theme.palette.text.secondary} fontSize="11">{db > 0 ? "+" : ""}{db} dB</text>
                    </g>;
                })}
                <polygon points={`0,${height} ${points} ${width},${height}`} fill={alpha("#f2b84b", props.settings.enabled ? 0.12 : 0.04)} />
                <polyline points={points} fill="none" stroke={props.settings.enabled ? "#f2b84b" : theme.palette.text.disabled} strokeWidth="3" />
                {handles.map((handle) => {
                    const x = frequencyToX(handle.frequency, width);
                    const y = handleY(handle.frequency);
                    return <g
                        key={handle.target}
                        role="button"
                        aria-label={handle.target}
                        style={{ cursor: handle.target === "lowCut" || handle.target === "highCut" ? "ew-resize" : "move" }}
                        onPointerDown={(event) => {
                            event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                            setDragTarget(handle.target);
                        }}
                    >
                        <circle cx={x} cy={y} r="14" fill={alpha(handle.color, 0.18)} />
                        <circle cx={x} cy={y} r="7" fill={handle.color} stroke={theme.palette.common.white} strokeWidth="2" />
                    </g>;
                })}
            </svg>
        </Box>
    );
}

function NumberControl(props: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    onPreview: (value: number) => void;
    onCommit: () => void;
}) {
    return <TextField
        size="small"
        label={props.label}
        type="number"
        value={props.value}
        onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) props.onPreview(clamp(value, props.min, props.max));
        }}
        onBlur={props.onCommit}
        slotProps={{
            htmlInput: { min: props.min, max: props.max, step: props.step },
            input: { endAdornment: <InputAdornment position="end">{props.unit}</InputAdornment> },
        }}
        sx={{ minWidth: 130 }}
    />;
}

function SlopeControl(props: { value: number; onChange: (value: number) => void }) {
    return <ToggleButtonGroup
        exclusive
        size="small"
        value={props.value}
        onChange={(_event, value) => value !== null && props.onChange(value)}
        aria-label="Filter slope"
        sx={{ '& .MuiToggleButton-root': { minWidth: 48, px: 1 } }}
    >
        {CUT_SLOPES.map((slope) => <ToggleButton key={slope} value={slope}>{slope}</ToggleButton>)}
    </ToggleButtonGroup>;
}

export default function GlobalEqDialog(props: GlobalEqDialogProps) {
    const [settings, setSettings] = React.useState(() => settingsFromPedalboard(props.pedalboard));
    const settingsRef = React.useRef(settings);
    const previewFrameRef = React.useRef<number | null>(null);
    const preview = (next: GlobalEqSettings) => {
        settingsRef.current = next;
        setSettings(next);
        if (previewFrameRef.current === null) {
            previewFrameRef.current = requestAnimationFrame(() => {
                previewFrameRef.current = null;
                props.onPreview(settingsRef.current);
            });
        }
    };
    const commit = (next = settingsRef.current) => {
        if (previewFrameRef.current !== null) {
            cancelAnimationFrame(previewFrameRef.current);
            previewFrameRef.current = null;
        }
        props.onChange(next);
    };

    React.useEffect(() => () => {
        if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
    }, []);

    React.useEffect(() => {
        if (!props.open) return;
        const next = settingsFromPedalboard(props.pedalboard);
        settingsRef.current = next;
        setSettings(next);
    }, [props.open, props.pedalboard]);

    const patchSettings = (patch: Partial<GlobalEqSettings>, commitNow = false) => {
        const next = { ...settingsRef.current, ...patch };
        preview(next);
        if (commitNow) commit(next);
    };
    const reset = () => {
        const next: GlobalEqSettings = {
            enabled: settings.enabled,
            lowCutHz: 20,
            lowCutSlopeDb: 12,
            lowGainDb: 0,
            midGainDb: 0,
            midFrequencyHz: 800,
            midQ: 1,
            highGainDb: 0,
            highCutHz: 20000,
            highCutSlopeDb: 12,
        };
        preview(next);
        commit(next);
    };

    return <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 1.5 }}>
            <EqualizerIcon color={settings.enabled ? "primary" : "disabled"} />
            <Box sx={{ flex: 1 }}>
                <Typography variant="h6" component="div">Global EQ</Typography>
                <Typography variant="caption" color="text.secondary">Stereo output</Typography>
            </Box>
            <FormControlLabel
                control={<Switch checked={settings.enabled} onChange={(event) => patchSettings({ enabled: event.target.checked }, true)} />}
                label={settings.enabled ? "On" : "Off"}
            />
            <Tooltip title="Reset EQ">
                <IconButton onClick={reset} aria-label="Reset EQ"><RestartAltIcon /></IconButton>
            </Tooltip>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 1.5, sm: 2 }, pt: '8px !important' }}>
            <GlobalEqGraph settings={settings} onPreview={preview} onCommit={commit} />

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1.15fr 1fr" }, mt: 2, borderTop: 1, borderColor: "divider" }}>
                <Stack spacing={1.5} sx={{ py: 2, pr: { md: 2 }, borderRight: { md: 1 }, borderColor: "divider" }}>
                    <Typography variant="subtitle2" color="#42a5f5">Low cut</Typography>
                    <NumberControl label="Frequency" value={settings.lowCutHz} min={10} max={500} step={1} unit="Hz"
                        onPreview={(value) => patchSettings({ lowCutHz: value })} onCommit={() => commit()} />
                    <Box>
                        <Typography variant="caption" color="text.secondary">dB / octave</Typography>
                        <SlopeControl value={settings.lowCutSlopeDb} onChange={(value) => patchSettings({ lowCutSlopeDb: value }, true)} />
                    </Box>
                    <NumberControl label="Low shelf" value={settings.lowGainDb} min={-12} max={12} step={0.1} unit="dB"
                        onPreview={(value) => patchSettings({ lowGainDb: value })} onCommit={() => commit()} />
                </Stack>

                <Stack spacing={1.5} sx={{ p: { xs: "16px 0", md: 2 }, borderRight: { md: 1 }, borderColor: "divider" }}>
                    <Typography variant="subtitle2" color="#f2b84b">Mid bell</Typography>
                    <Stack direction="row" spacing={1}>
                        <NumberControl label="Frequency" value={settings.midFrequencyHz} min={100} max={8000} step={1} unit="Hz"
                            onPreview={(value) => patchSettings({ midFrequencyHz: value })} onCommit={() => commit()} />
                        <NumberControl label="Gain" value={settings.midGainDb} min={-12} max={12} step={0.1} unit="dB"
                            onPreview={(value) => patchSettings({ midGainDb: value })} onCommit={() => commit()} />
                    </Stack>
                    <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">Q factor</Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={settings.midQ}
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    if (Number.isFinite(value)) patchSettings({ midQ: clamp(value, 0.2, 10) });
                                }}
                                onBlur={() => commit()}
                                slotProps={{ htmlInput: { min: 0.2, max: 10, step: 0.05, 'aria-label': 'Mid Q value' } }}
                                sx={{ width: 92 }}
                            />
                        </Stack>
                        <Slider min={0} max={100} step={1} value={qToSlider(settings.midQ)}
                            onChange={(_event, value) => patchSettings({ midQ: sliderToQ(value as number) })}
                            onChangeCommitted={() => commit()} aria-label="Mid Q factor" />
                    </Box>
                </Stack>

                <Stack spacing={1.5} sx={{ py: 2, pl: { md: 2 } }}>
                    <Typography variant="subtitle2" color="#ef5350">High cut</Typography>
                    <NumberControl label="Frequency" value={settings.highCutHz} min={1000} max={24000} step={1} unit="Hz"
                        onPreview={(value) => patchSettings({ highCutHz: value })} onCommit={() => commit()} />
                    <Box>
                        <Typography variant="caption" color="text.secondary">dB / octave</Typography>
                        <SlopeControl value={settings.highCutSlopeDb} onChange={(value) => patchSettings({ highCutSlopeDb: value }, true)} />
                    </Box>
                    <NumberControl label="High shelf" value={settings.highGainDb} min={-12} max={12} step={0.1} unit="dB"
                        onPreview={(value) => patchSettings({ highGainDb: value })} onCommit={() => commit()} />
                </Stack>
            </Box>
        </DialogContent>
        <DialogActions><Button onClick={props.onClose}>Close</Button></DialogActions>
    </Dialog>;
}
