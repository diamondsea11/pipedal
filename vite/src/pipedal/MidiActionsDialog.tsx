import { useMemo, useState } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
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
import MidiBinding from './MidiBinding';
import {
    MidiAction,
    MidiActionGesture,
    MidiActionType,
} from './Pedalboard';
import { PiPedalModelFactory } from './PiPedalModel';

interface MidiActionsDialogProps {
    open: boolean;
    onClose: () => void;
}

const actionNames = new Map<number, string>([
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

export default function MidiActionsDialog(props: MidiActionsDialogProps) {
    const model = PiPedalModelFactory.getInstance();
    const pedalboard = model.pedalboard.get();
    const [actions, setActions] = useState<MidiAction[]>(
        pedalboard.midiActions.map((action) => action.clone()));
    const pluginItems = useMemo(
        () => Array.from(pedalboard.itemsGenerator())
            .filter((item) => !item.isEmpty() && !item.isSplit()),
        [pedalboard]);

    const update = (index: number, values: Partial<MidiAction>) => {
        setActions((current) => current.map((action, actionIndex) => {
            if (actionIndex !== index) return action;
            return Object.assign(action.clone(), values);
        }));
    };
    const move = (index: number, direction: number) => {
        const target = index + direction;
        if (target < 0 || target >= actions.length) return;
        const result = actions.slice();
        [result[index], result[target]] = [result[target], result[index]];
        setActions(result);
    };
    const add = () => {
        const action = new MidiAction();
        action.actionType = MidiActionType.TogglePluginBypass;
        action.targetId = pluginItems[0]?.instanceId ?? -1;
        setActions((current) => [...current, action]);
    };

    return (
        <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="xl">
            <DialogTitle>MIDI action chains</DialogTitle>
            <DialogContent sx={{ p: 0, overflowX: 'auto' }}>
                <div style={{ minWidth: 1180 }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '42px 70px 100px 82px 86px 150px minmax(180px, 1fr) 90px 94px 76px 76px 74px 92px',
                        gap: 8,
                        alignItems: 'center',
                        padding: '8px 16px',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                    }}>
                        {['', 'On', 'Trigger', 'Channel', 'Gesture', 'Action', 'Target', 'Value', 'Alt value', 'Position', 'Group', 'Reset', 'Delay ms']
                            .map((label) => (
                                <Typography key={label} variant="caption" color="textSecondary">
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
                        return (
                            <div key={index} style={{
                                display: 'grid',
                                gridTemplateColumns: '42px 70px 100px 82px 86px 150px minmax(180px, 1fr) 90px 94px 76px 76px 74px 92px',
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
                                        onChange={(event) => update(index, { bindingType: Number(event.target.value) })}>
                                        <MenuItem value={MidiBinding.BINDING_TYPE_NOTE}>Note</MenuItem>
                                        <MenuItem value={MidiBinding.BINDING_TYPE_CONTROL}>CC</MenuItem>
                                        <MenuItem value={MidiBinding.BINDING_TYPE_PROGRAM}>PC</MenuItem>
                                    </Select>
                                    <TextField size="small" type="number" value={action.number}
                                        inputProps={{ min: 0, max: 127 }}
                                        onChange={(event) => update(index, { number: Number(event.target.value) })} />
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
                                    <MenuItem value={MidiActionGesture.Release}>Release</MenuItem>
                                    <MenuItem value={MidiActionGesture.AnyValue}>Any</MenuItem>
                                    <MenuItem value={MidiActionGesture.LongPress}>Long</MenuItem>
                                    <MenuItem value={MidiActionGesture.DoublePress}>Double</MenuItem>
                                </Select>
                                <Select size="small" value={action.actionType}
                                    onChange={(event) => update(index, { actionType: Number(event.target.value) })}>
                                    {Array.from(actionNames).map(([value, label]) => (
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
                                            onChange={(event) => update(index, { targetId: Number(event.target.value) })}>
                                            {pluginItems.map((item) => (
                                                <MenuItem key={item.instanceId} value={item.instanceId}>
                                                    {item.title || item.pluginName}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                        {action.actionType !== MidiActionType.TogglePluginBypass && (
                                            <TextField size="small" label="Symbol" value={action.symbol}
                                                onChange={(event) => update(index, { symbol: event.target.value })} />
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
                                    onChange={(event) => update(index, { value: Number(event.target.value) })} />
                                <TextField size="small" type="number" value={action.alternateValue}
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
                                        <IconButton size="small" onClick={() =>
                                            setActions((current) => current.filter((_, row) => row !== index))}>
                                            <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
            <DialogActions>
                <Button startIcon={<AddIcon />} onClick={add} sx={{ mr: 'auto' }}>Add action</Button>
                <Button onClick={props.onClose}>Cancel</Button>
                <Button variant="contained" onClick={() => {
                    model.setMidiActions(actions);
                    props.onClose();
                }}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
