// Copyright (c) 2026 Thomas Rapolani
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Divider,
    IconButton,
    MenuItem,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SensorsIcon from '@mui/icons-material/Sensors';
import MidiBinding from './MidiBinding';
import { MidiAction, MidiActionGesture, MidiActionType } from './Pedalboard';
import { UiControl } from './Lv2Plugin';
import { ListenHandle, PiPedalModelFactory } from './PiPedalModel';

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
    [MidiActionType.SendMidiNote, 'Send MIDI note'],
]);

interface MidiActionCardsProps {
    actions: MidiAction[];
    onChange: (actions: MidiAction[]) => void;
}

function bindingLabel(action: MidiAction): string {
    if (action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM) return 'PC';
    if (action.bindingType === MidiBinding.BINDING_TYPE_NOTE) return 'Note';
    return 'CC';
}

export default function MidiActionCards({ actions, onChange }: MidiActionCardsProps) {
    const model = PiPedalModelFactory.getInstance();
    const pedalboard = model.pedalboard.get();
    const [learningIndex, setLearningIndex] = useState<number | null>(null);
    const listenHandle = useRef<ListenHandle | null>(null);
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
        onChange(actionsRef.current.map((action, actionIndex) =>
            actionIndex === index ? Object.assign(action.clone(), values) : action));
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
        onChange(actionsRef.current.filter((_action, row) => row !== index));
    };
    const add = () => {
        const action = new MidiAction();
        action.actionType = MidiActionType.SelectSnapshot;
        action.bindingType = MidiBinding.BINDING_TYPE_PROGRAM;
        const usedPrograms = new Set(actionsRef.current
            .filter((item) => item.bindingType === MidiBinding.BINDING_TYPE_PROGRAM)
            .map((item) => item.number));
        const usedSnapshots = new Set(actionsRef.current
            .filter((item) => item.actionType === MidiActionType.SelectSnapshot)
            .map((item) => item.targetId));
        action.number = Array.from({ length: 128 }, (_entry, number) => number)
            .find((number) => !usedPrograms.has(number)) ?? 0;
        action.targetId = Array.from({ length: 6 }, (_entry, snapshot) => snapshot)
            .find((snapshot) => !usedSnapshots.has(snapshot)) ?? 0;
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
            ...controlValues(controls[0], action.actionType === MidiActionType.TogglePluginControl),
        });
    };
    const stopLearning = () => {
        if (listenHandle.current) model.cancelListenForMidiEvent(listenHandle.current);
        listenHandle.current = null;
        setLearningIndex(null);
    };
    const learn = (index: number) => {
        if (learningIndex === index) {
            stopLearning();
            return;
        }
        stopLearning();
        setLearningIndex(index);
        listenHandle.current = model.listenForMidiEvent((message) => {
            const bindingType = message.isNote()
                ? MidiBinding.BINDING_TYPE_NOTE
                : message.isProgram()
                    ? MidiBinding.BINDING_TYPE_PROGRAM
                    : MidiBinding.BINDING_TYPE_CONTROL;
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
        if (listenHandle.current) model.cancelListenForMidiEvent(listenHandle.current);
    }, [model]);

    return (
        <Box sx={{ width: '100%', maxWidth: 1180, mx: 'auto', p: { xs: 1.5, sm: 2 } }}>
            {actions.map((action, index) => {
                const pluginAction = action.actionType === MidiActionType.SetPluginControl ||
                    action.actionType === MidiActionType.TogglePluginControl ||
                    action.actionType === MidiActionType.TogglePluginBypass;
                const pathAction = action.actionType === MidiActionType.SetPathMute ||
                    action.actionType === MidiActionType.TogglePathMute;
                const midiOutputAction = action.actionType === MidiActionType.SendMidiControl ||
                    action.actionType === MidiActionType.SendMidiProgram ||
                    action.actionType === MidiActionType.SendMidiNote;
                const controls = pluginControls.get(action.targetId) ?? [];
                const selectedControl = controls.find((control) => control.symbol === action.symbol);
                const usesValue = action.actionType === MidiActionType.SetPluginControl ||
                    action.actionType === MidiActionType.TogglePluginControl ||
                    action.actionType === MidiActionType.TogglePluginBypass ||
                    action.actionType === MidiActionType.SetPathMute ||
                    action.actionType === MidiActionType.SendMidiControl ||
                    action.actionType === MidiActionType.SendMidiNote;
                const usesAlternateValue = action.actionType === MidiActionType.TogglePluginControl ||
                    action.actionType === MidiActionType.TogglePluginBypass;
                const numberLabel = action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM
                    ? 'Incoming PC number (0-127)'
                    : action.bindingType === MidiBinding.BINDING_TYPE_NOTE
                        ? 'Note number (0-127)' : 'CC number (0-127)';

                return (
                    <Box key={index} sx={{
                        mb: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: '6px',
                        bgcolor: 'background.paper',
                        opacity: action.enabled ? 1 : 0.66,
                        overflow: 'hidden',
                    }}>
                        <Box sx={{ minHeight: 56, px: 1.25, display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'action.hover' }}>
                            <Switch checked={action.enabled}
                                onChange={(event) => update(index, { enabled: event.target.checked })}
                                inputProps={{ 'aria-label': `Enable action ${index + 1}` }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 750 }} noWrap>
                                    Action {index + 1}: {midiActionNames.get(action.actionType) ?? 'MIDI action'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap display="block">
                                    {bindingLabel(action)} {action.number} {' -> '}
                                    {midiActionNames.get(action.actionType) ?? 'Action'}
                                </Typography>
                            </Box>
                            <Tooltip title="Move up"><span><IconButton disabled={index === 0} onClick={() => move(index, -1)}><ArrowUpwardIcon /></IconButton></span></Tooltip>
                            <Tooltip title="Move down"><span><IconButton disabled={index === actions.length - 1} onClick={() => move(index, 1)}><ArrowDownwardIcon /></IconButton></span></Tooltip>
                            <Tooltip title="Duplicate action"><IconButton onClick={() => duplicate(index)}><ContentCopyIcon /></IconButton></Tooltip>
                            <Tooltip title="Delete action"><IconButton onClick={() => remove(index)}><DeleteOutlineIcon /></IconButton></Tooltip>
                        </Box>
                        <Divider />
                        <Box sx={{
                            p: { xs: 1.5, sm: 2 },
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
                            gap: { xs: 2, md: 3 },
                        }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, alignContent: 'start' }}>
                                <Typography variant="overline" color="text.secondary" sx={{ gridColumn: '1 / -1', lineHeight: 1 }}>MIDI input</Typography>
                                <TextField select fullWidth size="small" label="Message type" value={action.bindingType}
                                    onChange={(event) => {
                                        const bindingType = Number(event.target.value);
                                        const values: Partial<MidiAction> = { bindingType };
                                        if (bindingType === MidiBinding.BINDING_TYPE_PROGRAM &&
                                            (action.gesture === MidiActionGesture.Release || action.gesture === MidiActionGesture.LongPress)) {
                                            values.gesture = MidiActionGesture.Press;
                                        }
                                        update(index, values);
                                    }}>
                                    <MenuItem value={MidiBinding.BINDING_TYPE_NOTE}>MIDI Note</MenuItem>
                                    <MenuItem value={MidiBinding.BINDING_TYPE_CONTROL}>MIDI CC</MenuItem>
                                    <MenuItem value={MidiBinding.BINDING_TYPE_PROGRAM}>MIDI PC</MenuItem>
                                </TextField>
                                <TextField fullWidth size="small" type="number" label={numberLabel} value={action.number}
                                    inputProps={{ min: 0, max: 127 }}
                                    helperText={action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM
                                        ? action.actionType === MidiActionType.SelectSnapshot
                                            ? `PC ${action.number} selects Snapshot ${Math.max(0, action.targetId) + 1}`
                                            : `Listens for PC ${action.number}`
                                        : undefined}
                                    onChange={(event) => update(index, { number: Number(event.target.value) })} />
                                <TextField select fullWidth size="small" label="MIDI channel" value={action.channel}
                                    onChange={(event) => update(index, { channel: Number(event.target.value) })}>
                                    <MenuItem value={-1}>Omni</MenuItem>
                                    {Array.from({ length: 16 }, (_entry, channel) => (
                                        <MenuItem key={channel} value={channel}>Channel {channel + 1}</MenuItem>
                                    ))}
                                </TextField>
                                <TextField select fullWidth size="small" label="Gesture" value={action.gesture}
                                    onChange={(event) => update(index, { gesture: Number(event.target.value) })}>
                                    <MenuItem value={MidiActionGesture.Press}>Press</MenuItem>
                                    <MenuItem value={MidiActionGesture.Release} disabled={action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM}>Release</MenuItem>
                                    <MenuItem value={MidiActionGesture.AnyValue}>Any value</MenuItem>
                                    <MenuItem value={MidiActionGesture.LongPress} disabled={action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM}>Long press</MenuItem>
                                    <MenuItem value={MidiActionGesture.DoublePress}>Double press</MenuItem>
                                </TextField>
                                <Button variant={learningIndex === index ? 'contained' : 'outlined'}
                                    color={learningIndex === index ? 'secondary' : 'primary'} startIcon={<SensorsIcon />}
                                    onClick={() => learn(index)} sx={{ gridColumn: '1 / -1', minHeight: 42 }}>
                                    {learningIndex === index ? 'Listening - tap to cancel' : 'MIDI Learn'}
                                </Button>
                            </Box>

                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, alignContent: 'start' }}>
                                <Typography variant="overline" color="text.secondary" sx={{ gridColumn: '1 / -1', lineHeight: 1 }}>Action</Typography>
                                <TextField select fullWidth size="small" label="When triggered" value={action.actionType}
                                    onChange={(event) => {
                                        const actionType = Number(event.target.value) as MidiActionType;
                                        const values: Partial<MidiAction> = { actionType };
                                        if (actionType === MidiActionType.SetPluginControl || actionType === MidiActionType.TogglePluginControl) {
                                            const control = controls[0];
                                            if (control) Object.assign(values, controlValues(control, actionType === MidiActionType.TogglePluginControl));
                                        } else if (actionType === MidiActionType.TogglePluginBypass) {
                                            Object.assign(values, { symbol: '', value: 1, alternateValue: 0 });
                                        } else if (actionType === MidiActionType.SendMidiControl || actionType === MidiActionType.SendMidiNote) {
                                            values.value = 127;
                                        }
                                        update(index, values);
                                    }}>
                                    {Array.from(midiActionNames).map(([value, label]) => (
                                        <MenuItem key={value} value={value}>{label}</MenuItem>
                                    ))}
                                </TextField>
                                {midiOutputAction ? <>
                                    <TextField select fullWidth size="small" label="Output channel" value={action.outputChannel}
                                        onChange={(event) => update(index, { outputChannel: Number(event.target.value) })}>
                                        {Array.from({ length: 16 }, (_entry, channel) => (
                                            <MenuItem key={channel} value={channel}>Channel {channel + 1}</MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField fullWidth size="small" type="number"
                                        label={action.actionType === MidiActionType.SendMidiControl ? 'CC number' :
                                            action.actionType === MidiActionType.SendMidiProgram ? 'PC number' : 'Note number'}
                                        value={action.actionNumber} inputProps={{ min: 0, max: 127 }}
                                        onChange={(event) => update(index, { actionNumber: Number(event.target.value) })} />
                                </> : pluginAction ? <>
                                    <TextField select fullWidth size="small" label="Block" value={action.targetId}
                                        onChange={(event) => changeTarget(index, action, Number(event.target.value))}>
                                        {pluginItems.map((item) => (
                                            <MenuItem key={item.instanceId} value={item.instanceId}>{item.title || item.pluginName}</MenuItem>
                                        ))}
                                    </TextField>
                                    {action.actionType !== MidiActionType.TogglePluginBypass && (
                                        <TextField select fullWidth size="small" label="Parameter" value={selectedControl?.symbol ?? ''}
                                            onChange={(event) => {
                                                const control = controls.find((candidate) => candidate.symbol === event.target.value);
                                                if (control) update(index, controlValues(control, action.actionType === MidiActionType.TogglePluginControl));
                                            }}>
                                            {controls.length === 0 && <MenuItem value="" disabled>No controls</MenuItem>}
                                            {controls.map((control) => <MenuItem key={control.symbol} value={control.symbol}>{control.name}</MenuItem>)}
                                        </TextField>
                                    )}
                                </> : pathAction ? (
                                    <TextField select fullWidth size="small" label="Path" value={action.symbol || 'A'}
                                        onChange={(event) => update(index, { symbol: String(event.target.value) })}>
                                        {['A', 'B', 'C', 'D'].map((path) => <MenuItem key={path} value={path}>Path {path}</MenuItem>)}
                                    </TextField>
                                ) : action.actionType === MidiActionType.SelectSnapshot ? (
                                    <TextField select fullWidth size="small" label="Snapshot" value={action.targetId < 0 ? 0 : action.targetId}
                                        onChange={(event) => update(index, { targetId: Number(event.target.value) })}>
                                        {Array.from({ length: 6 }, (_entry, snapshot) => (
                                            <MenuItem key={snapshot} value={snapshot}>Snapshot {snapshot + 1}</MenuItem>
                                        ))}
                                    </TextField>
                                ) : <Box />}
                                {usesValue && (
                                    <TextField fullWidth size="small" type="number" label="Value" value={action.value}
                                        inputProps={selectedControl ? {
                                            min: selectedControl.min_value,
                                            max: selectedControl.max_value,
                                            step: selectedControl.integer_property ? 1 : 'any',
                                        } : undefined}
                                        onChange={(event) => update(index, { value: Number(event.target.value) })} />
                                )}
                                {usesAlternateValue && (
                                    <TextField fullWidth size="small" type="number" label="Alternate value" value={action.alternateValue}
                                        inputProps={selectedControl ? {
                                            min: selectedControl.min_value,
                                            max: selectedControl.max_value,
                                            step: selectedControl.integer_property ? 1 : 'any',
                                        } : undefined}
                                        onChange={(event) => update(index, { alternateValue: Number(event.target.value) })} />
                                )}
                            </Box>
                        </Box>
                        <Divider />
                        <Box sx={{
                            px: { xs: 1.5, sm: 2 }, py: 1.5,
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(110px, 1fr))' },
                            gap: 1.5,
                        }}>
                            <TextField select fullWidth size="small" label="Toggle position" value={action.togglePosition}
                                onChange={(event) => update(index, { togglePosition: Number(event.target.value) })}>
                                <MenuItem value={0}>Both</MenuItem>
                                <MenuItem value={1}>A</MenuItem>
                                <MenuItem value={2}>B</MenuItem>
                            </TextField>
                            <TextField fullWidth size="small" type="number" label="Toggle group" value={action.toggleGroup}
                                inputProps={{ min: 0, max: 64 }} onChange={(event) => update(index, { toggleGroup: Number(event.target.value) })} />
                            <TextField fullWidth size="small" type="number" label="Reset group" value={action.resetGroup}
                                inputProps={{ min: 0, max: 64 }} onChange={(event) => update(index, { resetGroup: Number(event.target.value) })} />
                            <TextField fullWidth size="small" type="number" label="Delay (ms)" value={action.delayMs}
                                inputProps={{ min: 0, max: 10000 }} onChange={(event) => update(index, { delayMs: Number(event.target.value) })} />
                        </Box>
                    </Box>
                );
            })}
            {actions.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No MIDI actions yet.</Typography>
            )}
            <Button variant="outlined" startIcon={<AddIcon />} onClick={add} sx={{ minHeight: 44 }}>
                Add action
            </Button>
        </Box>
    );
}
