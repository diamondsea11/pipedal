// Copyright (c) 2026 Thomas Rapolani
// SPDX-License-Identifier: MIT
//
// Control Hub: a per-snapshot MIDI-action editor. "Base" holds the actions that
// apply whenever the active snapshot doesn't define its own; each snapshot can
// override with its own set. Reuses MidiActionTable so it stays in sync with the
// Settings "MIDI action chains" editor.

import { useMemo, useState } from 'react';
import {
    AppBar,
    Box,
    Button,
    Dialog,
    FormControlLabel,
    IconButton,
    Switch,
    Tab,
    Tabs,
    Toolbar,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { MidiAction, Snapshot } from './Pedalboard';
import { PiPedalModelFactory } from './PiPedalModel';
import MidiActionTable from './MidiActionTable';

interface ControlHubDialogProps {
    open: boolean;
    onClose: () => void;
}

interface SnapshotEdit {
    name: string;
    hasMidiActions: boolean;
    actions: MidiAction[];
}

// NOTE: mount this dialog conditionally ({open && <ControlHubDialog .../>}) so the
// state initialisers re-read the pedalboard each time it is opened.
export default function ControlHubDialog(props: ControlHubDialogProps) {
    const model = PiPedalModelFactory.getInstance();
    const initial = useMemo(() => {
        const pedalboard = model.pedalboard.get();
        const base = pedalboard.midiActions.map((action) => action.clone());
        const snapshots: (SnapshotEdit | null)[] = pedalboard.snapshots.map((snapshot) =>
            snapshot
                ? {
                    name: snapshot.name,
                    hasMidiActions: snapshot.hasMidiActions,
                    actions: snapshot.midiActions.map((action) => action.clone()),
                }
                : null);
        return { base, snapshots };
    }, [model]);

    const [base, setBase] = useState<MidiAction[]>(initial.base);
    const [snapshots, setSnapshots] = useState<(SnapshotEdit | null)[]>(initial.snapshots);
    const [tab, setTab] = useState<number>(-1); // -1 = Base, otherwise the snapshot array index.

    const snapshotTabs = snapshots
        .map((snapshot, index) => (snapshot
            ? { index, name: snapshot.name || `Snapshot ${index + 1}` }
            : null))
        .filter((entry): entry is { index: number; name: string } => entry !== null);

    const setSnapshotActions = (index: number, actions: MidiAction[]) => {
        setSnapshots((current) => current.map((snapshot, snapshotIndex) =>
            (snapshotIndex === index && snapshot ? { ...snapshot, actions } : snapshot)));
    };
    const toggleOverride = (index: number, enabled: boolean) => {
        setSnapshots((current) => current.map((snapshot, snapshotIndex) => {
            if (snapshotIndex !== index || !snapshot) return snapshot;
            // When first enabling an override, seed it from the Base actions so the
            // snapshot starts from the same behaviour, then diverges (Helix-style).
            if (enabled && snapshot.actions.length === 0) {
                return {
                    ...snapshot,
                    hasMidiActions: true,
                    actions: base.map((action) => action.clone()),
                };
            }
            return { ...snapshot, hasMidiActions: enabled };
        }));
    };

    const save = () => {
        model.setMidiActions(base.map((action) => action.clone()));
        const pedalboard = model.pedalboard.get();
        const newSnapshots = pedalboard.snapshots.map((snapshot, index) => {
            if (!snapshot) return null;
            const edit = snapshots[index];
            const copy = Object.assign(new Snapshot(), snapshot);
            copy.hasMidiActions = edit ? edit.hasMidiActions : snapshot.hasMidiActions;
            copy.midiActions = edit && edit.hasMidiActions
                ? edit.actions.map((action) => action.clone())
                : [];
            return copy;
        });
        model.setSnapshots(newSnapshots, pedalboard.selectedSnapshot);
        props.onClose();
    };

    const activeSnapshot = tab >= 0 ? snapshots[tab] : null;

    return (
        <Dialog open={props.open} onClose={props.onClose} fullScreen>
            <AppBar position="static" color="default" elevation={0}
                sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Toolbar variant="dense">
                    <IconButton edge="start" aria-label="Back" onClick={props.onClose} sx={{ mr: 1 }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <div style={{ flex: '1 1 auto' }}>
                        <Typography variant="h6">Control Hub</Typography>
                        <Typography variant="caption" color="textSecondary">
                            Per-snapshot MIDI actions
                        </Typography>
                    </div>
                    <Button onClick={props.onClose}>Cancel</Button>
                    <Button variant="contained" onClick={save} sx={{ ml: 1 }}>Save</Button>
                </Toolbar>
            </AppBar>

            <Tabs
                value={tab}
                onChange={(_event, value) => setTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ borderBottom: '1px solid', borderColor: 'divider', flex: '0 0 auto' }}
            >
                <Tab label="Base" value={-1} />
                {snapshotTabs.map(({ index, name }) => (
                    <Tab key={index} label={name} value={index} />
                ))}
            </Tabs>

            <Box sx={{ flex: '1 1 auto', overflow: 'auto' }}>
                {tab === -1 ? (
                    <>
                        <Typography variant="body2" color="textSecondary" sx={{ px: 2, pt: 2, pb: 1 }}>
                            Base actions apply whenever the active snapshot doesn&apos;t define its own.
                        </Typography>
                        <MidiActionTable actions={base} onChange={setBase} />
                    </>
                ) : activeSnapshot ? (
                    <>
                        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
                            <FormControlLabel
                                control={<Switch
                                    checked={activeSnapshot.hasMidiActions}
                                    onChange={(event) => toggleOverride(tab, event.target.checked)}
                                />}
                                label="Override MIDI actions for this snapshot"
                            />
                        </Box>
                        {activeSnapshot.hasMidiActions ? (
                            <MidiActionTable
                                actions={activeSnapshot.actions}
                                onChange={(actions) => setSnapshotActions(tab, actions)}
                            />
                        ) : (
                            <Typography variant="body2" color="textSecondary" sx={{ px: 2, py: 3 }}>
                                This snapshot uses the Base MIDI actions. Turn on the switch above to give
                                it its own set (it starts as a copy of Base).
                            </Typography>
                        )}
                    </>
                ) : null}

                {snapshotTabs.length === 0 && tab === -1 && (
                    <Typography variant="caption" color="textSecondary" sx={{ px: 2, pb: 2, display: 'block' }}>
                        Tip: create snapshots to give each its own MIDI actions.
                    </Typography>
                )}
            </Box>
        </Dialog>
    );
}
