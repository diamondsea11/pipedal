import React from "react";
import {
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    Slider,
    Switch,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AddIcon from "@mui/icons-material/Add";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import CloseIcon from "@mui/icons-material/Close";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import InputIcon from "@mui/icons-material/Input";
import OutputIcon from "@mui/icons-material/Output";
import { Pedalboard, PedalboardPath } from "./Pedalboard";
import { PiPedalModel, PiPedalModelFactory } from "./PiPedalModel";

interface RoutingGraphDialogProps {
    open: boolean;
    pedalboard: Pedalboard;
    onClose: () => void;
}

const PATH_COLORS: Record<string, string> = {
    A: "#d28a3c",
    B: "#42a89b",
    C: "#6d91d8",
    D: "#bd70ad",
};

export default function RoutingGraphDialog(props: RoutingGraphDialogProps) {
    const model: PiPedalModel = PiPedalModelFactory.getInstance();
    const { pedalboard } = props;
    const pathC = pedalboard.additionalPaths.find((path) => path.id === "C");
    const pathD = pedalboard.additionalPaths.find((path) => path.id === "D");
    const pathBEnabled = pedalboard.pathBEnabled;

    const applyTemplate = (
        _event: React.MouseEvent<HTMLElement>,
        value: "single" | "dual" | "guitar-vocal" | null
    ) => {
        if (value) model.applyRoutingTemplate(value);
    };

    const setReturnEnabled = (id: "C" | "D", enabled: boolean) => {
        const path = id === "C" ? pathC : pathD;
        if (enabled) {
            const firstSource = pathBEnabled ? "B" : "A";
            model.configurePathSends(id, {
                ...(path?.sourceSendsDb ?? {}),
                [firstSource]: path?.sourceSendsDb?.[firstSource] ?? -12,
            });
        } else {
            model.configurePathSends(id, {});
        }
    };

    const toggleSend = (
        path: PedalboardPath | undefined,
        id: "C" | "D",
        sourceId: string,
        enabled: boolean
    ) => {
        const sends = { ...(path?.sourceSendsDb ?? {}) };
        if (enabled) sends[sourceId] = sends[sourceId] ?? -12;
        else delete sends[sourceId];
        model.configurePathSends(id, sends);
    };

    const setSendLevel = (
        path: PedalboardPath | undefined,
        id: "C" | "D",
        sourceId: string,
        levelDb: number
    ) => {
        model.configurePathSends(id, {
            ...(path?.sourceSendsDb ?? {}),
            [sourceId]: levelDb,
        });
    };

    const renderSource = (id: "A" | "B" | "C") => (
        <Box
            key={id}
            sx={{
                border: "1px solid",
                borderColor: "divider",
                borderLeft: `4px solid ${PATH_COLORS[id]}`,
                borderRadius: 1,
                px: 1.5,
                py: 1,
                minWidth: 130,
                display: "flex",
                alignItems: "center",
                gap: 1,
            }}
        >
            <InputIcon fontSize="small" />
            <Box>
                <Typography variant="subtitle2">Path {id}</Typography>
                <Typography variant="caption" color="text.secondary">
                    {id === "A" ? "Primary" : id === "B" ? pedalboard.pathBName : "Return C"}
                </Typography>
            </Box>
        </Box>
    );

    const renderReturn = (
        id: "C" | "D",
        path: PedalboardPath | undefined,
        availableSources: string[]
    ) => {
        const enabled = path?.enabled ?? false;
        const isReturn = Object.keys(path?.sourceSendsDb ?? {}).length > 0;
        return (
            <Box
                key={id}
                sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderLeft: `4px solid ${PATH_COLORS[id]}`,
                    borderRadius: 1,
                    p: 1.5,
                    minHeight: 142,
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CallMergeIcon fontSize="small" />
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>
                        Return {id}
                    </Typography>
                    {!enabled && (
                        <Tooltip title={`Add Path ${id}`}>
                            <IconButton
                                size="small"
                                onClick={() => model.configureAdditionalPath(id, true, 0)}
                            >
                                <AddIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    {enabled && (
                        <Tooltip title={`Remove Path ${id}`}>
                            <IconButton
                                size="small"
                                onClick={() => model.configureAdditionalPath(id, false)}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
                {enabled && (
                    <>
                        <FormControlLabel
                            sx={{ mt: 0.5 }}
                            control={
                                <Switch
                                    size="small"
                                    checked={isReturn}
                                    onChange={(event) =>
                                        setReturnEnabled(id, event.target.checked)}
                                />
                            }
                            label="Shared FX return"
                        />
                        {isReturn && availableSources.map((sourceId) => {
                            const level = path?.sourceSendsDb?.[sourceId];
                            const sendEnabled = level !== undefined;
                            return (
                                <Box
                                    key={sourceId}
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "28px 52px minmax(90px, 1fr) 48px",
                                        alignItems: "center",
                                        columnGap: 0.5,
                                    }}
                                >
                                    <Checkbox
                                        size="small"
                                        checked={sendEnabled}
                                        onChange={(event) =>
                                            toggleSend(path, id, sourceId, event.target.checked)}
                                        inputProps={{ "aria-label": `Send ${sourceId} to ${id}` }}
                                    />
                                    <Typography variant="caption">Send {sourceId}</Typography>
                                    <Slider
                                        size="small"
                                        min={-60}
                                        max={6}
                                        step={0.5}
                                        disabled={!sendEnabled}
                                        value={level ?? -12}
                                        onChangeCommitted={(_event, value) =>
                                            setSendLevel(path, id, sourceId, Number(value))}
                                        aria-label={`Send ${sourceId} level`}
                                    />
                                    <Typography variant="caption" align="right">
                                        {(level ?? -12).toFixed(1)}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </>
                )}
            </Box>
        );
    };

    const selectedItem = pedalboard.maybeGetItem(pedalboard.selectedPlugin);
    const canInsertSplit = selectedItem !== null && !selectedItem.isSplit();

    return (
        <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <AccountTreeIcon />
                Signal Routing
            </DialogTitle>
            <DialogContent>
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={null}
                    onChange={applyTemplate}
                    aria-label="Routing templates"
                    sx={{ mb: 2 }}
                >
                    <ToggleButton value="single">Single</ToggleButton>
                    <ToggleButton value="dual">Dual</ToggleButton>
                    <ToggleButton value="guitar-vocal">Guitar + Vocal</ToggleButton>
                </ToggleButtonGroup>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "180px 1fr" },
                        gap: 2,
                        alignItems: "start",
                    }}
                >
                    <Box sx={{ display: "grid", gap: 1 }}>
                        {renderSource("A")}
                        {pathBEnabled && renderSource("B")}
                        {pathC?.enabled && renderSource("C")}
                    </Box>
                    <Box sx={{ display: "grid", gap: 1 }}>
                        {renderReturn("C", pathC, pathBEnabled ? ["A", "B"] : ["A"])}
                        {renderReturn(
                            "D",
                            pathD,
                            [
                                "A",
                                ...(pathBEnabled ? ["B"] : []),
                                ...(pathC?.enabled ? ["C"] : []),
                            ])}
                    </Box>
                </Box>

                <Box
                    sx={{
                        mt: 2,
                        borderTop: "1px solid",
                        borderColor: "divider",
                        pt: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                    }}
                >
                    <DeviceHubIcon fontSize="small" />
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>
                        Selected block
                    </Typography>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CallMergeIcon />}
                        disabled={!canInsertSplit}
                        onClick={() => {
                            if (selectedItem) {
                                model.addPedalboardSplitItem(selectedItem.instanceId, true);
                            }
                        }}
                    >
                        Split after
                    </Button>
                    <OutputIcon fontSize="small" color="disabled" />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose}>Done</Button>
            </DialogActions>
        </Dialog>
    );
}
