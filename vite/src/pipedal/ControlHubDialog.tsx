// Copyright (c) 2026 Thomas Rapolani
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AppBar,
    Badge,
    Box,
    Button,
    Dialog,
    Divider,
    FormControlLabel,
    IconButton,
    MenuItem,
    Select,
    Slider,
    Switch,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Toolbar,
    Tooltip,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import SensorsIcon from '@mui/icons-material/Sensors';
import TuneIcon from '@mui/icons-material/Tune';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import MidiBinding from './MidiBinding';
import {
    MidiAction,
    MidiActionGesture,
    MidiActionType,
    PedalboardItem,
    Snapshot,
} from './Pedalboard';
import { ListenHandle, PiPedalModelFactory } from './PiPedalModel';
import { ControlType, PluginType, UiControl, UiPlugin } from './Lv2Plugin';
import MidiActionTable from './MidiActionTable';
import PluginIcon from './PluginIcon';
import { getUiPluginCategory } from './PluginCategories';

interface ControlHubDialogProps {
    open: boolean;
    onClose: () => void;
}

interface SnapshotEdit {
    name: string;
    color: string;
    hasMidiActions: boolean;
    actions: MidiAction[];
}

type HubView = 'blocks' | 'actions';

interface BlockInfo {
    item: PedalboardItem;
    plugin: UiPlugin | null;
    color: string;
    controls: UiControl[];
}

function isToggleControl(control: UiControl): boolean {
    return control.controlType === ControlType.OnOffSwitch ||
        control.controlType === ControlType.ABSwitch ||
        control.toggled_property ||
        (control.integer_property && control.min_value === 0 && control.max_value === 1);
}

function isEnumeration(control: UiControl): boolean {
    return control.scale_points.length > 0 &&
        (control.enumeration_property || control.controlType === ControlType.Select);
}

function actionMatchesParameter(
    action: MidiAction,
    instanceId: number,
    symbol: string): boolean {
    if (action.targetId !== instanceId) return false;
    if (symbol === '__bypass') {
        return action.actionType === MidiActionType.TogglePluginBypass;
    }
    return (action.actionType === MidiActionType.SetPluginControl ||
        action.actionType === MidiActionType.TogglePluginControl) &&
        action.symbol === symbol;
}

function nextMidiNumber(actions: MidiAction[]): number {
    const used = new Set(actions.map((action) => action.number));
    for (let number = 20; number < 128; ++number) {
        if (!used.has(number)) return number;
    }
    return 0;
}

function sourceName(action: MidiAction): string {
    if (action.bindingType === MidiBinding.BINDING_TYPE_NOTE) return `Note ${action.number}`;
    if (action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM) return `Program ${action.number}`;
    return `CC ${action.number}`;
}

function gestureName(gesture: MidiActionGesture): string {
    switch (gesture) {
        case MidiActionGesture.Release: return 'Release';
        case MidiActionGesture.AnyValue: return 'Any value';
        case MidiActionGesture.LongPress: return 'Hold';
        case MidiActionGesture.DoublePress: return 'Double press';
        default: return 'Press';
    }
}

function ValueEditor(props: {
    control: UiControl;
    value: number;
    label: string;
    color: string;
    onChange: (value: number) => void;
}) {
    const { control, value, label, color, onChange } = props;
    const safeValue = Math.max(control.min_value, Math.min(control.max_value, value));
    if (isEnumeration(control)) {
        return (
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Select fullWidth size="small" value={safeValue}
                    onChange={(event) => onChange(Number(event.target.value))}>
                    {control.scale_points.map((point) => (
                        <MenuItem key={point.value} value={point.value}>{point.label}</MenuItem>
                    ))}
                </Select>
            </Box>
        );
    }
    if (isToggleControl(control)) {
        return (
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <ToggleButtonGroup exclusive fullWidth size="small"
                    value={safeValue > (control.min_value + control.max_value) / 2 ? control.max_value : control.min_value}
                    onChange={(_event, next) => next !== null && onChange(Number(next))}>
                    <ToggleButton value={control.min_value}>Off</ToggleButton>
                    <ToggleButton value={control.max_value}>On</ToggleButton>
                </ToggleButtonGroup>
            </Box>
        );
    }
    return (
        <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="caption" sx={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                    {control.formatDisplayValue(safeValue)}
                </Typography>
            </Box>
            <Slider size="small" value={safeValue} min={control.min_value} max={control.max_value}
                step={control.integer_property ? 1 : Math.max((control.max_value - control.min_value) / 200, 0.001)}
                onChange={(_event, next) => onChange(Number(next))}
                sx={{ color, mt: 0.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.disabled">
                    {control.formatDisplayValue(control.min_value)}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                    {control.formatDisplayValue(control.max_value)}
                </Typography>
            </Box>
        </Box>
    );
}

function TriggerEditor(props: {
    action: MidiAction;
    learning: boolean;
    onLearn: () => void;
    onChange: (values: Partial<MidiAction>) => void;
}) {
    const { action, learning, onLearn, onChange } = props;
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.1fr 1fr 1fr auto' }, gap: 1 }}>
            <Select size="small" value={action.bindingType}
                onChange={(event) => onChange({ bindingType: Number(event.target.value) })}>
                <MenuItem value={MidiBinding.BINDING_TYPE_CONTROL}>Control change</MenuItem>
                <MenuItem value={MidiBinding.BINDING_TYPE_NOTE}>Note</MenuItem>
                <MenuItem value={MidiBinding.BINDING_TYPE_PROGRAM}>Program change</MenuItem>
            </Select>
            <TextField size="small" type="number"
                label={action.bindingType === MidiBinding.BINDING_TYPE_CONTROL ? 'CC number' :
                    action.bindingType === MidiBinding.BINDING_TYPE_NOTE ? 'Note number' : 'Program'}
                value={action.number} inputProps={{ min: 0, max: 127 }}
                onChange={(event) => onChange({ number: Math.max(0, Math.min(127, Number(event.target.value))) })} />
            <Select size="small" value={action.channel}
                onChange={(event) => onChange({ channel: Number(event.target.value) })}>
                <MenuItem value={-1}>All channels</MenuItem>
                {Array.from({ length: 16 }, (_, channel) => (
                    <MenuItem key={channel} value={channel}>Channel {channel + 1}</MenuItem>
                ))}
            </Select>
            <Tooltip title={learning ? 'Cancel MIDI learn' : 'MIDI learn'}>
                <IconButton color={learning ? 'secondary' : 'default'} onClick={onLearn}
                    sx={{ border: '1px solid', borderColor: learning ? 'secondary.main' : 'divider', borderRadius: '6px' }}>
                    <SensorsIcon />
                </IconButton>
            </Tooltip>
        </Box>
    );
}

function AssignmentEditor(props: {
    action: MidiAction;
    control: UiControl | null;
    color: string;
    learning: boolean;
    onLearn: () => void;
    onChange: (values: Partial<MidiAction>) => void;
    onDelete: () => void;
}) {
    const { action, control, color, learning, onLearn, onChange, onDelete } = props;
    const bypass = action.actionType === MidiActionType.TogglePluginBypass;
    const toggles = action.actionType === MidiActionType.TogglePluginControl || bypass;
    return (
        <Box sx={{ px: { xs: 2, md: 3 }, py: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CheckCircleIcon sx={{ color, fontSize: 20 }} />
                <Typography sx={{ fontWeight: 700, flex: 1 }}>MIDI assignment</Typography>
                <FormControlLabel sx={{ mr: 0 }} label="Enabled" labelPlacement="start"
                    control={<Switch size="small" checked={action.enabled}
                        onChange={(event) => onChange({ enabled: event.target.checked })} />} />
                <Tooltip title="Delete assignment">
                    <IconButton size="small" onClick={onDelete}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Tooltip>
            </Box>

            <Typography variant="overline" color="text.secondary">Trigger</Typography>
            <TriggerEditor action={action} learning={learning} onLearn={onLearn} onChange={onChange} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mt: 1 }}>
                <Select size="small" value={action.gesture}
                    onChange={(event) => onChange({ gesture: Number(event.target.value) })}>
                    <MenuItem value={MidiActionGesture.Press}>Press</MenuItem>
                    <MenuItem value={MidiActionGesture.Release}
                        disabled={action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM}>Release</MenuItem>
                    <MenuItem value={MidiActionGesture.AnyValue}>Any value</MenuItem>
                    <MenuItem value={MidiActionGesture.LongPress}
                        disabled={action.bindingType === MidiBinding.BINDING_TYPE_PROGRAM}>Hold</MenuItem>
                    <MenuItem value={MidiActionGesture.DoublePress}>Double press</MenuItem>
                </Select>
                <TextField size="small" type="number" label="Delay"
                    value={action.delayMs} inputProps={{ min: 0, max: 10000 }}
                    InputProps={{ endAdornment: <Typography variant="caption">ms</Typography> }}
                    onChange={(event) => onChange({ delayMs: Math.max(0, Number(event.target.value)) })} />
            </Box>

            {!bypass && control && (
                <>
                    <Divider sx={{ my: 2.5 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>Parameter</Typography>
                        {!isToggleControl(control) && (
                            <ToggleButtonGroup exclusive size="small"
                                value={toggles ? 'toggle' : 'set'}
                                onChange={(_event, value) => {
                                    if (value === 'toggle') {
                                        onChange({
                                            actionType: MidiActionType.TogglePluginControl,
                                            value: control.max_value,
                                            alternateValue: control.min_value,
                                        });
                                    } else if (value === 'set') {
                                        onChange({ actionType: MidiActionType.SetPluginControl });
                                    }
                                }}>
                                <ToggleButton value="set">Set</ToggleButton>
                                <ToggleButton value="toggle">A / B</ToggleButton>
                            </ToggleButtonGroup>
                        )}
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: toggles ? { xs: '1fr', sm: '1fr 1fr' } : '1fr', gap: 2 }}>
                        <ValueEditor control={control} value={action.value}
                            label={toggles ? 'Value A' : control.name} color={color}
                            onChange={(value) => onChange({ value })} />
                        {toggles && (
                            <ValueEditor control={control} value={action.alternateValue}
                                label="Value B" color={color}
                                onChange={(alternateValue) => onChange({ alternateValue })} />
                        )}
                    </Box>
                </>
            )}
        </Box>
    );
}

export default function ControlHubDialog(props: ControlHubDialogProps) {
    const model = PiPedalModelFactory.getInstance();
    const pedalboard = useMemo(() => model.pedalboard.get(), [model]);
    const initial = useMemo(() => ({
        base: pedalboard.midiActions.map((action) => action.clone()),
        snapshots: pedalboard.snapshots.map((snapshot): SnapshotEdit | null => snapshot ? {
            name: snapshot.name,
            color: snapshot.color,
            hasMidiActions: snapshot.hasMidiActions,
            actions: snapshot.midiActions.map((action) => action.clone()),
        } : null),
    }), [pedalboard]);
    const blocks = useMemo((): BlockInfo[] => Array.from(pedalboard.itemsGenerator())
        .filter((item) => !item.isEmpty() && !item.isSplit())
        .map((item) => {
            const plugin = model.getUiPlugin(item.uri);
            const color = item.iconColor || (plugin ? getUiPluginCategory(plugin).color : '#8d9aa7');
            const controls = (plugin?.controls ?? [])
                .filter((control) => control.is_input && !control.is_bypass && !control.not_on_gui)
                .sort((left, right) => left.display_priority - right.display_priority ||
                    left.name.localeCompare(right.name));
            return { item, plugin, color, controls };
        }), [model, pedalboard]);

    const [base, setBase] = useState(initial.base);
    const [snapshots, setSnapshots] = useState(initial.snapshots);
    const [tab, setTab] = useState(-1);
    const [view, setView] = useState<HubView>('blocks');
    const [selectedBlockId, setSelectedBlockId] = useState(blocks[0]?.item.instanceId ?? -1);
    const [selectedSymbol, setSelectedSymbol] = useState('__bypass');
    const [selectedActionIndex, setSelectedActionIndex] = useState<number | null>(null);
    const [learningIndex, setLearningIndex] = useState<number | null>(null);
    const listenHandle = useRef<ListenHandle | null>(null);

    const snapshot = tab >= 0 ? snapshots[tab] : null;
    const editable = tab === -1 || !!snapshot?.hasMidiActions;
    const activeActions = tab === -1 ? base :
        snapshot?.hasMidiActions ? snapshot.actions : base;
    const selectedBlock = blocks.find((block) => block.item.instanceId === selectedBlockId) ?? blocks[0];
    const selectedControl = selectedSymbol === '__bypass' ? null :
        selectedBlock?.controls.find((control) => control.symbol === selectedSymbol) ?? null;
    const parameterActionIndexes = selectedBlock ? activeActions
        .map((action, index) => actionMatchesParameter(action, selectedBlock.item.instanceId, selectedSymbol) ? index : -1)
        .filter((index) => index >= 0) : [];
    const activeActionIndex = selectedActionIndex !== null && parameterActionIndexes.includes(selectedActionIndex)
        ? selectedActionIndex : parameterActionIndexes[0] ?? null;
    const activeAction = activeActionIndex === null ? null : activeActions[activeActionIndex];

    const setActiveActions = (actions: MidiAction[]) => {
        if (tab === -1) {
            setBase(actions);
        } else {
            setSnapshots((current) => current.map((entry, index) =>
                index === tab && entry ? { ...entry, actions } : entry));
        }
    };
    const updateAction = (index: number, values: Partial<MidiAction>) => {
        setActiveActions(activeActions.map((action, actionIndex) =>
            actionIndex === index ? Object.assign(action.clone(), values) : action));
    };
    const stopLearning = () => {
        if (listenHandle.current) model.cancelListenForMidiEvent(listenHandle.current);
        listenHandle.current = null;
        setLearningIndex(null);
    };
    const learn = (index: number) => {
        if (learningIndex === index) { stopLearning(); return; }
        stopLearning();
        setLearningIndex(index);
        listenHandle.current = model.listenForMidiEvent((message) => {
            const bindingType = message.isNote() ? MidiBinding.BINDING_TYPE_NOTE :
                message.isProgram() ? MidiBinding.BINDING_TYPE_PROGRAM : MidiBinding.BINDING_TYPE_CONTROL;
            updateAction(index, {
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

    const addAssignment = () => {
        if (!selectedBlock || !editable) return;
        const action = new MidiAction();
        action.number = nextMidiNumber(activeActions);
        action.targetId = selectedBlock.item.instanceId;
        if (selectedSymbol === '__bypass') {
            action.actionType = MidiActionType.TogglePluginBypass;
            action.value = 1;
            action.alternateValue = 0;
        } else if (selectedControl) {
            action.symbol = selectedControl.symbol;
            action.actionType = isToggleControl(selectedControl)
                ? MidiActionType.TogglePluginControl : MidiActionType.SetPluginControl;
            action.value = isToggleControl(selectedControl)
                ? selectedControl.max_value : selectedControl.default_value;
            action.alternateValue = selectedControl.min_value;
        }
        const next = [...activeActions, action];
        setActiveActions(next);
        setSelectedActionIndex(next.length - 1);
    };
    const removeAssignment = (index: number) => {
        setActiveActions(activeActions.filter((_action, actionIndex) => actionIndex !== index));
        setSelectedActionIndex(null);
        stopLearning();
    };
    const toggleOverride = (enabled: boolean) => {
        if (tab < 0) return;
        setSnapshots((current) => current.map((entry, index) => index === tab && entry ? {
            ...entry,
            hasMidiActions: enabled,
            actions: enabled && entry.actions.length === 0
                ? base.map((action) => action.clone()) : entry.actions,
        } : entry));
        setSelectedActionIndex(null);
    };
    const selectParameter = (symbol: string) => {
        setSelectedSymbol(symbol);
        setSelectedActionIndex(null);
        stopLearning();
    };
    const save = () => {
        const newSnapshots = pedalboard.snapshots.map((entry, index) => {
            if (!entry) return null;
            const edit = snapshots[index];
            const copy = Object.assign(new Snapshot(), entry);
            copy.hasMidiActions = edit?.hasMidiActions ?? false;
            copy.midiActions = edit?.hasMidiActions
                ? edit.actions.map((action) => action.clone()) : [];
            return copy;
        });
        model.setMidiActionConfiguration(base, newSnapshots);
        props.onClose();
    };

    const snapshotTabs = snapshots.map((entry, index) => entry ? { entry, index } : null)
        .filter((entry): entry is { entry: SnapshotEdit; index: number } => entry !== null);

    return (
        <Dialog open={props.open} onClose={props.onClose} fullScreen PaperProps={{ sx: { bgcolor: 'background.default' } }}>
            <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Toolbar variant="dense" sx={{ minHeight: 54 }}>
                    <IconButton edge="start" aria-label="Back" onClick={props.onClose} sx={{ mr: 1 }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <TuneIcon sx={{ color: 'primary.main', mr: 1.25 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 750, lineHeight: 1.15 }}>Control Hub</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{pedalboard.name}</Typography>
                    </Box>
                    <ToggleButtonGroup exclusive size="small" value={view}
                        onChange={(_event, value) => value && setView(value)} sx={{ mr: 1.5 }}>
                        <ToggleButton value="blocks" aria-label="Block assignments"><ViewModuleIcon fontSize="small" /></ToggleButton>
                        <ToggleButton value="actions" aria-label="All actions"><ListAltIcon fontSize="small" /></ToggleButton>
                    </ToggleButtonGroup>
                    <Button onClick={props.onClose}>Cancel</Button>
                    <Button variant="contained" onClick={save} sx={{ ml: 1 }}>Save</Button>
                </Toolbar>
            </AppBar>

            <Tabs value={tab} onChange={(_event, value) => { setTab(value); setSelectedActionIndex(null); stopLearning(); }}
                variant="scrollable" scrollButtons="auto"
                sx={{ minHeight: 48, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Tab label="Base" value={-1} />
                {snapshotTabs.map(({ entry, index }) => (
                    <Tab key={index} value={index} label={entry.name || `Snapshot ${index + 1}`}
                        sx={{ borderBottom: `3px solid ${entry.color || 'transparent'}` }} />
                ))}
            </Tabs>

            {view === 'actions' ? (
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                    {tab >= 0 && snapshot && (
                        <Toolbar variant="dense" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                            <FormControlLabel control={<Switch checked={snapshot.hasMidiActions}
                                onChange={(event) => toggleOverride(event.target.checked)} />}
                                label="Snapshot override" />
                        </Toolbar>
                    )}
                    {editable ? <MidiActionTable actions={activeActions} onChange={setActiveActions} /> : (
                        <Box sx={{ p: 3 }}><Button variant="contained" onClick={() => toggleOverride(true)}>Customize Snapshot</Button></Box>
                    )}
                </Box>
            ) : (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    {tab >= 0 && snapshot && (
                        <Box sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                            <FormControlLabel control={<Switch size="small" checked={snapshot.hasMidiActions}
                                onChange={(event) => toggleOverride(event.target.checked)} />}
                                label="Snapshot override" sx={{ mr: 1 }} />
                            {!snapshot.hasMidiActions && (
                                <Typography variant="caption" color="text.secondary">Base</Typography>
                            )}
                        </Box>
                    )}

                    <Box sx={{ px: { xs: 1.5, md: 3 }, py: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
                            {blocks.map((block) => {
                                const selected = block.item.instanceId === selectedBlock?.item.instanceId;
                                const count = activeActions.filter((action) => action.targetId === block.item.instanceId &&
                                    (action.actionType === MidiActionType.SetPluginControl ||
                                        action.actionType === MidiActionType.TogglePluginControl ||
                                        action.actionType === MidiActionType.TogglePluginBypass)).length;
                                return (
                                    <Button key={block.item.instanceId} onClick={() => {
                                        setSelectedBlockId(block.item.instanceId);
                                        selectParameter('__bypass');
                                    }} sx={{
                                        flex: '0 0 112px', height: 82, px: 1, py: 1,
                                        display: 'flex', flexDirection: 'column', gap: 0.5,
                                        color: 'text.primary', border: '1px solid',
                                        borderColor: selected ? block.color : 'divider', borderRadius: '6px',
                                        borderBottomWidth: selected ? 4 : 1,
                                        bgcolor: selected ? `${block.color}18` : 'transparent',
                                    }}>
                                        <Badge badgeContent={count} color="primary" invisible={count === 0}>
                                            <PluginIcon pluginType={block.plugin?.plugin_type ?? PluginType.Plugin}
                                                size={30} opacity={1} color={block.color} />
                                        </Badge>
                                        <Typography variant="caption" noWrap sx={{ width: '100%', fontWeight: selected ? 750 : 600 }}>
                                            {block.item.title || block.item.pluginName || block.plugin?.name}
                                        </Typography>
                                    </Button>
                                );
                            })}
                        </Box>
                    </Box>

                    {selectedBlock ? (
                        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, 42%) 1fr' }, overflow: 'hidden' }}>
                            <Box sx={{ overflowY: 'auto', borderRight: { md: '1px solid' }, borderColor: { md: 'divider' } }}>
                                <Box sx={{ px: 2.5, py: 1.75, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PluginIcon pluginType={selectedBlock.plugin?.plugin_type ?? PluginType.Plugin}
                                        size={24} opacity={1} color={selectedBlock.color} />
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 750 }} noWrap>
                                            {selectedBlock.item.title || selectedBlock.item.pluginName || selectedBlock.plugin?.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                                            {selectedBlock.plugin?.author_name}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Divider />
                                {[{ symbol: '__bypass', name: 'Bypass', control: null as UiControl | null },
                                    ...selectedBlock.controls.map((control) => ({ symbol: control.symbol, name: control.name, control }))]
                                    .map((parameter) => {
                                        const matches = activeActions.map((action, index) =>
                                            actionMatchesParameter(action, selectedBlock.item.instanceId, parameter.symbol) ? index : -1)
                                            .filter((index) => index >= 0);
                                        const selected = selectedSymbol === parameter.symbol;
                                        return (
                                            <Button key={parameter.symbol} fullWidth onClick={() => selectParameter(parameter.symbol)}
                                                sx={{
                                                    minHeight: 58, px: 2.5, py: 1, borderRadius: 0,
                                                    justifyContent: 'flex-start', textAlign: 'left', color: 'text.primary',
                                                    borderLeft: `4px solid ${selected ? selectedBlock.color : 'transparent'}`,
                                                    bgcolor: selected ? `${selectedBlock.color}14` : 'transparent',
                                                }}>
                                                {parameter.symbol === '__bypass' ?
                                                    <PowerSettingsNewIcon sx={{ mr: 1.5, color: selectedBlock.color }} /> :
                                                    <TuneIcon sx={{ mr: 1.5, color: matches.length ? selectedBlock.color : 'text.disabled', fontSize: 20 }} />}
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{parameter.name}</Typography>
                                                    {parameter.control && (
                                                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                                                            {parameter.control.formatDisplayValue(parameter.control.min_value)} - {parameter.control.formatDisplayValue(parameter.control.max_value)}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                {matches.length > 0 ? (
                                                    <Badge badgeContent={matches.length} color="primary">
                                                        <CheckCircleIcon sx={{ color: selectedBlock.color, fontSize: 20 }} />
                                                    </Badge>
                                                ) : <AddIcon color="disabled" />}
                                            </Button>
                                        );
                                    })}
                            </Box>

                            <Box sx={{ overflowY: 'auto', bgcolor: 'background.paper' }}>
                                {!editable ? (
                                    <Box sx={{ p: 3 }}>
                                        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Using Base assignments</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            {parameterActionIndexes.length} assignment{parameterActionIndexes.length === 1 ? '' : 's'} for this parameter
                                        </Typography>
                                        <Button variant="contained" onClick={() => toggleOverride(true)}>Customize Snapshot</Button>
                                    </Box>
                                ) : activeAction && activeActionIndex !== null ? (
                                    <>
                                        {parameterActionIndexes.length > 1 && (
                                            <Tabs value={activeActionIndex}
                                                onChange={(_event, value) => setSelectedActionIndex(value)}
                                                variant="scrollable" scrollButtons="auto"
                                                sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                                {parameterActionIndexes.map((index) => (
                                                    <Tab key={index} value={index}
                                                        label={`${sourceName(activeActions[index])} / ${gestureName(activeActions[index].gesture)}`} />
                                                ))}
                                            </Tabs>
                                        )}
                                        <AssignmentEditor action={activeAction} control={selectedControl}
                                            color={selectedBlock.color} learning={learningIndex === activeActionIndex}
                                            onLearn={() => learn(activeActionIndex)}
                                            onChange={(values) => updateAction(activeActionIndex, values)}
                                            onDelete={() => removeAssignment(activeActionIndex)} />
                                        <Box sx={{ px: 3, pb: 3 }}>
                                            <Button startIcon={<AddIcon />} onClick={addAssignment}>Add assignment</Button>
                                        </Box>
                                    </>
                                ) : (
                                    <Box sx={{ p: 3 }}>
                                        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>
                                            {selectedSymbol === '__bypass' ? 'Bypass' : selectedControl?.name}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Unassigned</Typography>
                                        <Button variant="contained" startIcon={<AddIcon />} onClick={addAssignment}
                                            sx={{ bgcolor: selectedBlock.color, '&:hover': { bgcolor: selectedBlock.color } }}>
                                            Assign MIDI
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    ) : (
                        <Box sx={{ p: 3 }}><Typography color="text.secondary">No effect blocks in this preset.</Typography></Box>
                    )}
                </Box>
            )}
        </Dialog>
    );
}
