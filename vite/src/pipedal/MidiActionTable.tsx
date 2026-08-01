// Copyright (c) 2026 Thomas Rapolani
// SPDX-License-Identifier: MIT
//
// Reusable MIDI-action editing grid, shared by the Settings "MIDI action chains"
// dialog and the Control Hub (per-snapshot MIDI). Edits a MidiAction[] and reports
// changes through onChange.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    IconButton,
    MenuItem,
    Select,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SensorsIcon from '@mui/icons-material/Sensors';
import MidiBinding from './MidiBinding';
import {
    MidiAction,
    MidiActionGesture,
    MidiActionType,
} from './Pedalboard';
import { ListenHandle, PiPedalModelFactory } from './PiPedalModel';
import { UiControl } from './Lv2Plugin';

export const midiActionNames = new Map<number, string>([
    [MidiActionType.SetPluginControl, 'Set plugin control'],
    [MidiActionType.TogglePluginControl, 'Toggle plugin control'],
    [MidiActionType.TogglePluginBypass, 'Toggle plugin bypass'],
    [MidiActionType.SelectSnapshot, 'Select snapshot'],
    [MidiActionType.NextSnapshot, 'Next snapshot'],
    [MidiActionType.PreviousSnapshot, 'Previous snapshot'],
    [MidiActionType.NextPreset, 'Next preset'],
    [MidiActionType.PreviousPreset, 'Previous preset'],
    [MidiActionType.NextBank, 'Next bank'],
    [MidiActionType.PreviousBank, 'Previous bank'],
    [MidiActionType.SetPathMute, 'Set path mute'],
    [MidiActionType.TogglePathMute, 'Toggle path mute'],
    [MidiActionType.ToggleGlobalEq, 'Toggle Global EQ'],
    [MidiActionType.SendMidiControl, 'Send MIDI CC'],
    [MidiActionType.SendMidiProgram, 'Send MIDI PC'],
]);

const GRID_COLUMNS =
    '42px 70px 132px 82px 86px 150px minmax(180px, 1fr) 90px 94px 76px 76px 74px 110px';
const GRID_HEADERS =
    ['', 'On', 'Trigger', 'Channel', 'Gesture', 'Action', 'Target',
        'Value', 'Alt value', 'Position', 'Group', 'Reset', 'Delay ms'];

interface MidiActionTableProps {
    actions: MidiAction[];
    onChange: (actions: MidiAction[]) => void;
}

export default function MidiActionTable(props: MidiActionTableProps) {
    const { actions, onChange } = props;
    const model = PiPedalModelFactory.getInstance();
    const pedalboard = model.pedalboard.get();
    const [learningIndex, setLearningIndex] = useState<number | null>(null);
    const listenHandle = useRef<ListenHandle | null>(null);
    // Keep a ref to the latest actions so async handlers (MIDI learn) never
    // operate on a stale array.
    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    const pluginItems = useMemo(
        () => Array.from(pedalboard.itemsGenerator())
            .filter((item) => !item.isEmpty() && !item.isSplit()),
        [pedalboard]);
    const pluginControls = useMemo(() => {
        const result = new Map<number, UiControl[]>();
        for (const item of pluginItems) {
            const plugin = model.getUiPlugin(item.uri);
            const controls = (plugin?.controls ?? [])
                .filter((control) => control.is_input && !control.is_bypass)
                .sort((left, right) => {
                    const priority = left.display_priority - right.display_priority;
                    return priority !== 0 ? priority : left.name.localeCompare(right.name);
                });
            result.set(item.instanceId, controls);
        }
        return result;
    }, [model, pluginItems]);

    const update = (index: number, values: Partial<MidiAction>) => {
        onChange(actionsRef.current.map((action, actionIndex) => {
            if (actionIndex !== index) return action;
            return Object.assign(action.clone(), values);
        }));
    };
    const move = (index: number, direction: number) => {
        const target = index + direction;
        if (target < 0 || target >= actionsRef.current.length) return;
        const result = actionsRef.current.slice();
        [result[index], result[target]] = [result[target], result[index]];
        onChange(result);
    };
    const duplicate = (index: number) => {
        const result = actionsRef.current.slice();
        result.splice(index + 1, 0, actionsRef.current[index].clone());
        onChange(result);
    };
    const remove = (index: number) => {
        onChange(actionsRef.current.filter((_, row) => row !== index));
    };
    const add = () => {
        const action = new MidiAction();
        action.actionType = MidiActionType.TogglePluginBypass;
        action.targetId = pluginItems[0]?.instanceId ?? -1;
        onChange([...actionsRef.current, action]);
    };
    const controlValues = (control: UiControl, toggle: boolean) => ({
        symbol: control.symbol,
        value: toggle ? control.max_value : control.default_value,
        alternateValue: control.min_value,
    });
    const changeTarget = (index: number, action: MidiAction, targetId: number) => {
        const controls = pluginControls.get(targetId) ?? [];
        if (action.actionType === MidiActionType.TogglePluginBypass || controls.length === 0) {
            update(index, { targetId });
            return;
        }
        update(index, {
            targetId,
            ...controlValues(
                controls[0],
                action.actionType === MidiActionType.TogglePluginControl),
        });
    };
    const stopLearning = () => {
        if (listenHandle.current) {
            model.cancelListenForMidiEvent(listenHandle.current);
            listenHandle.current = null;
        }
        setLearningIndex(null);
    };
    const learn = (index: number) => {
        stopLearning();
        setLearningIndex(index);
        listenHandle.current = model.listenForMidiEvent((message) => {
            let bindingType: number;
            if (message.isNote()) {
                bindingType = MidiBinding.BINDING_TYPE_NOTE;
            } else if (message.isControl()) {
                bindingType = MidiBinding.BINDING_TYPE_CONTROL;
            } else if (message.isProgram()) {
                bindingType = MidiBinding.BINDING_TYPE_PROGRAM;
            } else {
                return;
            }
            update(index, {
                bindingType,
                channel: message.cc0 & 0x0F,
                number: message.cc1 & 0x7F,
                gesture: MidiActionGesture.Press,
            });
            stopLearning();
        });
    };
    useEffect(() => () => {
        if (listenHandle.current) {
            model.cancelListenForMidiEvent(listenHandle.current);
            listenHandle.current = null;
        }
    }, [model]);

    return (
        <div style={{ minWidth: 1180 }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: GRID_COLUMNS,
                gap: 8,
                alignItems: 'center',
                padding: '8px 16px',
                borderBottom: '1px solid',
                borderColor: 'divider',
            }}>
                {GRID_HEADERS.map((label, columnIndex) => (
                    <Typography key={columnIndex} variant="caption" color="textSecondary">
                        {label}
                    </Typography>
                ))}
            </div>
            {actions.map((action, index) => {
                const pluginAction =
                    action.actionType === MidiActionType.SetPluginControl ||
                    action.actionType === MidiActionType.TogglePluginControl ||
                    action.actionType === MidiActionType.TogglePluginBypass;
                const pathAction =
                    action.actionType === MidiActionType.SetPathMute ||
                    action.actionType === MidiActionType.TogglePathMute;
                const midiOutputAction =
                    action.actionType === MidiActionType.SendMidiControl ||
                    action.actionType === MidiActionType.SendMidiProgram;
                const controls = pluginControls.get(action.targetId) ?? [];
                const selectedControl = controls.find(
                    (control) => control.symbol === action.symbol);
                const usesValue =
                    action.actionType === MidiActionType.SetPluginControl ||
                    action.actionType === MidiActionType.TogglePluginControl ||
                    action.actionType === MidiActionType.TogglePluginBypass ||
                    action.actionType === MidiActionType.SetPathMute ||
                    action.actionType === MidiActionType.SendMidiControl;
                const usesAlternateValue =
                    action.actionType === MidiActionType.TogglePluginControl ||
                    action.actionType === MidiActionType.TogglePluginBypass;
                return (
                    <div key={index} style={{
                        display: 'grid',
                        gridTemplateColumns: GRID_COLUMNS,
                        gap: 8,
                        alignItems: 'center',
                        padding: '8px 16px',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Tooltip title="Move up">
                                <span><IconButton size="small" disabled={index === 0}
                                    onClick={() => move(index, -1)}><ArrowUpwardIcon fontSize="inherit" /></IconButton></span>
                            </Tooltip>
                            <Tooltip title="Move down">
                                <span><IconButton size="small" disabled={index === actions.length - 1}
                                    onClick={() => move(index, 1)}><ArrowDownwardIcon fontSize="inherit" /></IconButton></span>
                            </Tooltip>
                        </div>
                        <Switch checked={action.enabled}
                            onChange={(event) => update(index, { enabled: event.target.checked })} />
                        <div style={{ display: 'flex', gap: 4 }}>
                            <Select size="small" value={action.bindingType}
                                onChange={(event) => {
                                    const bindingType = Number(event.target.value);
                                    const values: Partial<MidiAction> = { bindingType };
                                    if (bindingType === MidiBinding.BINDING_TYPE_PROGRAM &&
                                        (action.gesture === MidiActionGesture.Release ||
                                            action.gesture === MidiActionGesture.LongPress)) {
                                        values.gesture = MidiActionGesture.Press;
                                    }
                                    update(index, values);
                                }}>
                                <MenuItem value={MidiBinding.BINDING_TYPE_NOTE}>Note</MenuItem>
                                <MenuItem value={MidiBinding.BINDING_TYPE_CONTROL}>CC</MenuItem>
                                <MenuItem value={MidiBinding.BINDING_TYPE_PROGRAM}>PC</MenuItem>
                            </Select>
                            <TextField size="small" type="number" value={action.number}
                                inputProps={{ min: 0, max: 127 }}
                                onChange={(event) => update(index, { number: Number(event.target.value) })} />
                            <Tooltip title={
                                learningIndex === index ? 'Cancel MIDI learn' : 'Learn MIDI trigger'}>
                                <IconButton size="small"
                                    color={learningIndex === index ? 'secondary' : 'default'}
                                    onClick={() => learningIndex === index
                                        ? stopLearning()
                                        : learn(index)}>
                                    <SensorsIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </div>
                        <Select size="small" value={action.channel}
                            onChange={(event) => update(index, { channel: Number(event.target.value) })}>
                            <MenuItem value={-1}>Omni</MenuItem>
                            {Array.from({ length: 16 }, (_, channel) => (
                                <MenuItem key={channel} value={channel}>Ch {channel + 1}</MenuItem>
                            ))}
                        </Select>
                        <Select size="small" value={action.gesture}
                            onChange={(event) => update(index, { gesture: Number(event.target.value) })}>
                            <MenuItem value={MidiActionGesture.Press}>Press</MenuItem>
                            <MenuItem value={MidiActionGesture.Release}
                                disabled={action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM}>
                                Release
                            </MenuItem>
                            <MenuItem value={MidiActionGesture.AnyValue}>Any</MenuItem>
                            <MenuItem value={MidiActionGesture.LongPress}
                                disabled={action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM}>
                                Long
                            </MenuItem>
                            <MenuItem value={MidiActionGesture.DoublePress}>Double</MenuItem>
                        </Select>
                        <Select size="small" value={action.actionType}
                            onChange={(event) => {
                                const actionType = Number(event.target.value) as MidiActionType;
                                const values: Partial<MidiAction> = { actionType };
                                if (actionType === MidiActionType.SetPluginControl ||
                                    actionType === MidiActionType.TogglePluginControl) {
                                    const control = controls[0];
                                    if (control) {
                                        Object.assign(values, controlValues(
                                            control,
                                            actionType === MidiActionType.TogglePluginControl));
                                    }
                                } else if (actionType === MidiActionType.TogglePluginBypass) {
                                    Object.assign(values, {
                                        symbol: '',
                                        value: 1,
                                        alternateValue: 0,
                                    });
                                }
                                update(index, values);
                            }}>
                            {Array.from(midiActionNames).map(([value, label]) => (
                                <MenuItem key={value} value={value}>{label}</MenuItem>
                            ))}
                        </Select>
                        {midiOutputAction ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                                <Select size="small" value={action.outputChannel}
                                    onChange={(event) => update(index, {
                                        outputChannel: Number(event.target.value)
                                    })}>
                                    {Array.from({ length: 16 }, (_, channel) => (
                                        <MenuItem key={channel} value={channel}>
                                            Ch {channel + 1}
                                        </MenuItem>
                                    ))}
                                </Select>
                                <TextField size="small" type="number" label={
                                    action.actionType === MidiActionType.SendMidiControl ? 'CC' : 'PC'}
                                    value={action.actionNumber}
                                    inputProps={{ min: 0, max: 127 }}
                                    onChange={(event) => update(index, {
                                        actionNumber: Number(event.target.value)
                                    })} />
                            </div>
                        ) : pluginAction ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                                <Select size="small" value={action.targetId} sx={{ minWidth: 120 }}
                                    onChange={(event) => changeTarget(
                                        index, action, Number(event.target.value))}>
                                    {pluginItems.map((item) => (
                                        <MenuItem key={item.instanceId} value={item.instanceId}>
                                            {item.title || item.pluginName}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {action.actionType !== MidiActionType.TogglePluginBypass && (
                                    <Select size="small" value={
                                        selectedControl?.symbol ?? ''}
                                        displayEmpty
                                        sx={{ minWidth: 150 }}
                                        onChange={(event) => {
                                            const control = controls.find(
                                                (candidate) =>
                                                    candidate.symbol === event.target.value);
                                            if (control) {
                                                update(index, controlValues(
                                                    control,
                                                    action.actionType ===
                                                    MidiActionType.TogglePluginControl));
                                            }
                                        }}>
                                        {controls.length === 0 && (
                                            <MenuItem value="" disabled>No controls</MenuItem>
                                        )}
                                        {controls.map((control) => (
                                            <MenuItem key={control.symbol}
                                                value={control.symbol}>
                                                {control.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                )}
                            </div>
                        ) : pathAction ? (
                            <Select size="small" value={action.symbol || 'A'}
                                onChange={(event) => update(index, { symbol: String(event.target.value) })}>
                                {['A', 'B', 'C', 'D'].map((path) => (
                                    <MenuItem key={path} value={path}>Path {path}</MenuItem>
                                ))}
                            </Select>
                        ) : action.actionType === MidiActionType.SelectSnapshot ? (
                            <Select size="small" value={action.targetId < 0 ? 0 : action.targetId}
                                onChange={(event) => update(index, { targetId: Number(event.target.value) })}>
                                {Array.from({ length: 6 }, (_, snapshot) => (
                                    <MenuItem key={snapshot} value={snapshot}>Snapshot {snapshot + 1}</MenuItem>
                                ))}
                            </Select>
                        ) : <span />}
                        <TextField size="small" type="number" value={action.value}
                            disabled={!usesValue}
                            inputProps={selectedControl ? {
                                min: selectedControl.min_value,
                                max: selectedControl.max_value,
                                step: selectedControl.integer_property ? 1 : 'any',
                            } : undefined}
                            onChange={(event) => update(index, { value: Number(event.target.value) })} />
                        <TextField size="small" type="number" value={action.alternateValue}
                            disabled={!usesAlternateValue}
                            inputProps={selectedControl ? {
                                min: selectedControl.min_value,
                                max: selectedControl.max_value,
                                step: selectedControl.integer_property ? 1 : 'any',
                            } : undefined}
                            onChange={(event) => update(index, { alternateValue: Number(event.target.value) })} />
                        <Select size="small" value={action.togglePosition}
                            onChange={(event) => update(index, { togglePosition: Number(event.target.value) })}>
                            <MenuItem value={0}>Both</MenuItem>
                            <MenuItem value={1}>A</MenuItem>
                            <MenuItem value={2}>B</MenuItem>
                        </Select>
                        <TextField size="small" type="number" value={action.toggleGroup}
                            inputProps={{ min: 0, max: 64 }}
                            onChange={(event) => update(index, { toggleGroup: Number(event.target.value) })} />
                        <TextField size="small" type="number" value={action.resetGroup}
                            inputProps={{ min: 0, max: 64 }}
                            onChange={(event) => update(index, { resetGroup: Number(event.target.value) })} />
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <TextField size="small" type="number" value={action.delayMs}
                                inputProps={{ min: 0, max: 10000 }}
                                onChange={(event) => update(index, { delayMs: Number(event.target.value) })} />
                            <Tooltip title="Delete action">
                                <IconButton size="small" onClick={() => remove(index)}>
                                    <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Duplicate action">
                                <IconButton size="small" onClick={() => duplicate(index)}>
                                    <ContentCopyIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </div>
                    </div>
                );
            })}
            {actions.length === 0 && (
                <Typography variant="body2" color="textSecondary" sx={{ px: 2, py: 3 }}>
                    No MIDI actions yet.
                </Typography>
            )}
            <div style={{ padding: '8px 16px' }}>
                <Button startIcon={<AddIcon />} onClick={add}>Add action</Button>
            </div>
        </div>
    );
}
