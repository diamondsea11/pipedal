import React from "react";
import {
    AppBar,
    Box,
    ButtonBase,
    Dialog,
    Divider,
    IconButton,
    Stack,
    Toolbar,
    Tooltip,
    Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import GridViewIcon from "@mui/icons-material/GridView";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import PluginIcon, { getIconColor } from "./PluginIcon";
import { getUiPluginCategory, pluginCategories } from "./PluginCategories";
import {
    Pedalboard,
    PedalboardItem,
    PedalboardPath,
    PedalboardSplitItem,
} from "./Pedalboard";
import { PiPedalModel, PiPedalModelFactory } from "./PiPedalModel";
import { PluginType } from "./Lv2Plugin";

type GigViewDialogProps = {
    open: boolean;
    pedalboard: Pedalboard;
    onClose: () => void;
};

type PathView = {
    id: "A" | "B" | "C" | "D";
    name: string;
    items: PedalboardItem[];
    mute: boolean;
    toggleMute: () => void;
};

function collectStomps(items: PedalboardItem[], output: PedalboardItem[]): void {
    for (const item of items) {
        if (item.isSplit()) {
            const split = item as PedalboardSplitItem;
            collectStomps(split.topChain, output);
            collectStomps(split.bottomChain, output);
        } else if (!item.isEmpty() && !item.isStart() && !item.isEnd()) {
            output.push(item);
        }
    }
}

function stompItems(items: PedalboardItem[]): PedalboardItem[] {
    const result: PedalboardItem[] = [];
    collectStomps(items, result);
    return result;
}

function getPathViews(pedalboard: Pedalboard, model: PiPedalModel): PathView[] {
    const result: PathView[] = [{
        id: "A",
        name: "Path A",
        items: stompItems(pedalboard.items),
        mute: pedalboard.pathAMute,
        toggleMute: () => model.configurePathMix("A", !pedalboard.pathAMute, pedalboard.pathAPan),
    }];
    if (pedalboard.pathBEnabled) {
        result.push({
            id: "B",
            name: pedalboard.pathBName || "Path B",
            items: stompItems(pedalboard.pathBItems),
            mute: pedalboard.pathBMute,
            toggleMute: () => model.configurePathMix("B", !pedalboard.pathBMute, pedalboard.pathBPan),
        });
    }
    for (const path of pedalboard.additionalPaths) {
        if (!path.enabled || (path.id !== "C" && path.id !== "D")) continue;
        const additionalPath = path as PedalboardPath;
        result.push({
            id: additionalPath.id as "C" | "D",
            name: additionalPath.name || `Path ${additionalPath.id}`,
            items: stompItems(additionalPath.items),
            mute: additionalPath.mute,
            toggleMute: () => model.configureAdditionalPathMix(
                additionalPath.id as "C" | "D",
                !additionalPath.mute,
                additionalPath.pan),
        });
    }
    return result;
}

function SnapshotStrip(props: { pedalboard: Pedalboard; model: PiPedalModel }) {
    const theme = useTheme();
    const snapshots = props.pedalboard.snapshots
        .map((snapshot, index) => snapshot ? { snapshot, index } : null)
        .filter((value): value is NonNullable<typeof value> => value !== null);
    if (snapshots.length === 0) return null;

    return <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="overline" color="text.secondary">Snapshots</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(snapshots.length, 6)}, minmax(112px, 1fr))`, gap: 1.25, mt: 0.5, overflowX: "auto", pb: 0.5 }}>
            {snapshots.map(({ snapshot, index }) => {
                const selected = props.pedalboard.selectedSnapshot === index;
                const color = getIconColor(snapshot.color) ?? theme.palette.primary.main;
                return <ButtonBase
                    key={index}
                    onClick={() => props.model.selectSnapshot(index)}
                    aria-label={`Select ${snapshot.name || `Snapshot ${index + 1}`}`}
                    sx={{
                        minWidth: 112,
                        minHeight: 76,
                        px: 1.5,
                        border: 2,
                        borderColor: selected ? color : alpha(color, 0.45),
                        bgcolor: selected ? alpha(color, 0.2) : alpha(color, 0.06),
                        color: selected ? color : "text.primary",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        justifyContent: "center",
                        borderRadius: 1,
                    }}
                >
                    <Typography variant="caption" sx={{ opacity: 0.72 }}>SCENE {index + 1}</Typography>
                    <Typography variant="subtitle1" noWrap sx={{ width: "100%", textAlign: "left", fontWeight: selected ? 700 : 500 }}>
                        {snapshot.name || `Snapshot ${index + 1}`}{snapshot.isModified ? " *" : ""}
                    </Typography>
                </ButtonBase>;
            })}
        </Box>
    </Box>;
}

function StompTile(props: { item: PedalboardItem; model: PiPedalModel }) {
    const plugin = props.model.getUiPlugin(props.item.uri);
    const category = plugin ? getUiPluginCategory(plugin) : pluginCategories.other;
    const color = getIconColor(props.item.iconColor) ?? category.color;
    const label = props.item.title || plugin?.label || props.item.pluginName || "Plugin";
    const pluginType = plugin?.uri === "http://two-play.com/plugins/toob-nam"
        ? PluginType.NamPlugin
        : plugin?.plugin_type ?? PluginType.Plugin;

    return <ButtonBase
        onClick={() => props.model.setPedalboardItemEnabled(props.item.instanceId, !props.item.isEnabled)}
        aria-label={`${label}, ${props.item.isEnabled ? "on" : "bypassed"}`}
        sx={{
            minHeight: { xs: 104, sm: 126 },
            p: 1.5,
            border: 2,
            borderColor: props.item.isEnabled ? color : alpha(color, 0.32),
            bgcolor: props.item.isEnabled ? alpha(color, 0.14) : alpha(color, 0.035),
            borderRadius: 1,
            display: "grid",
            gridTemplateRows: "1fr auto",
            textAlign: "left",
            opacity: props.item.isEnabled ? 1 : 0.58,
            transition: "background-color 120ms ease, border-color 120ms ease, opacity 120ms ease",
        }}
    >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ width: "100%" }}>
            <PluginIcon pluginType={pluginType} color={color} size={34} opacity={props.item.isEnabled ? 1 : 0.65} />
            <PowerSettingsNewIcon sx={{ color: props.item.isEnabled ? color : "text.disabled", fontSize: 22 }} />
        </Stack>
        <Box sx={{ width: "100%", minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>{label}</Typography>
            <Typography variant="caption" sx={{ color, textTransform: "uppercase" }}>
                {category.label} / {props.item.isEnabled ? "On" : "Bypass"}
            </Typography>
        </Box>
    </ButtonBase>;
}

function PathSection(props: { path: PathView; model: PiPedalModel }) {
    return <Box component="section" sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.25 }}>
            <Box sx={{ width: 5, height: 28, bgcolor: "primary.main" }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" noWrap>{props.path.name}</Typography>
                <Typography variant="caption" color="text.secondary">PATH {props.path.id}</Typography>
            </Box>
            <Tooltip title={props.path.mute ? "Unmute path" : "Mute path"}>
                <IconButton
                    onClick={props.path.toggleMute}
                    color={props.path.mute ? "primary" : "default"}
                    aria-label={`${props.path.mute ? "Unmute" : "Mute"} ${props.path.name}`}
                    sx={{ width: 48, height: 48, border: 1, borderColor: props.path.mute ? "primary.main" : "divider" }}
                >
                    <VolumeOffIcon />
                </IconButton>
            </Tooltip>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(154px, 1fr))", gap: 1.25 }}>
            {props.path.items.map((item) => <StompTile key={item.instanceId} item={item} model={props.model} />)}
        </Box>
    </Box>;
}

export default function GigViewDialog(props: GigViewDialogProps) {
    const model = PiPedalModelFactory.getInstance();
    const paths = getPathViews(props.pedalboard, model);
    return <Dialog open={props.open} onClose={props.onClose} fullScreen>
        <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
            <Toolbar sx={{ minHeight: { xs: 58, sm: 66 }, gap: 1.5 }}>
                <GridViewIcon color="primary" />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" noWrap>{props.pedalboard.name || "Untitled preset"}</Typography>
                    <Typography variant="caption" color="text.secondary">GIG VIEW</Typography>
                </Box>
                <Tooltip title="Close Gig View">
                    <IconButton edge="end" onClick={props.onClose} aria-label="Close Gig View" sx={{ width: 48, height: 48 }}>
                        <CloseIcon />
                    </IconButton>
                </Tooltip>
            </Toolbar>
        </AppBar>
        <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "background.default" }}>
            <SnapshotStrip pedalboard={props.pedalboard} model={model} />
            {paths.map((path, index) => <React.Fragment key={path.id}>
                {index !== 0 && <Divider />}
                <PathSection path={path} model={model} />
            </React.Fragment>)}
        </Box>
    </Dialog>;
}
