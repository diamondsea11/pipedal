import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    MenuItem,
    Select,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import SensorsIcon from '@mui/icons-material/Sensors';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import StopIcon from '@mui/icons-material/Stop';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import MidiBinding from './MidiBinding';
import { MidiAction } from './Pedalboard';
import { ListenHandle, PiPedalModelFactory } from './PiPedalModel';
import MidiActionTable, { midiActionNames } from './MidiActionTable';

interface MidiActionsDialogProps {
    open: boolean;
    onClose: () => void;
}

const MIDI_PROFILE_STORAGE_KEY = 'pipedal.midi-action-profiles.v1';

interface MidiActionProfile {
    format: 'pipedal-midi-actions';
    version: 1;
    name: string;
    actions: MidiAction[];
}

function readProfiles(): MidiActionProfile[] {
    try {
        const value = JSON.parse(localStorage.getItem(MIDI_PROFILE_STORAGE_KEY) ?? '[]');
        if (!Array.isArray(value)) return [];
        return value
            .filter((profile) =>
                profile?.format === 'pipedal-midi-actions' &&
                profile?.version === 1 &&
                Array.isArray(profile?.actions))
            .map((profile) => ({
                ...profile,
                actions: profile.actions.map((action: unknown) =>
                    new MidiAction().deserialize(action)),
            }));
    } catch {
        return [];
    }
}

export default function MidiActionsDialog(props: MidiActionsDialogProps) {
    const model = PiPedalModelFactory.getInstance();
    const pedalboard = model.pedalboard.get();
    const [actions, setActions] = useState<MidiAction[]>(
        pedalboard.midiActions.map((action) => action.clone()));
    const [profiles, setProfiles] = useState<MidiActionProfile[]>(readProfiles);
    const [selectedProfile, setSelectedProfile] = useState('');
    const [profileName, setProfileName] = useState('My controller');
    const [monitoring, setMonitoring] = useState(false);
    const [monitorEvents, setMonitorEvents] = useState<string[]>([]);
    const monitorHandle = useRef<ListenHandle | null>(null);
    const importRef = useRef<HTMLInputElement | null>(null);

    const stopMonitor = () => {
        if (monitorHandle.current) {
            model.cancelListenForMidiEvent(monitorHandle.current);
            monitorHandle.current = null;
        }
        setMonitoring(false);
    };
    const startMonitor = () => {
        stopMonitor();
        setMonitorEvents([]);
        setMonitoring(true);
        monitorHandle.current = model.listenForMidiEvent((message) => {
            const channel = (message.cc0 & 0x0F) + 1;
            const type = message.isControl()
                ? `CC ${message.cc1 & 0x7F}`
                : message.isProgram()
                    ? `PC ${message.cc1 & 0x7F}`
                    : `Note ${message.cc1 & 0x7F}`;
            const value = message.isProgram() ? '' : ` = ${message.cc2 & 0x7F}`;
            const timestamp = new Date().toLocaleTimeString();
            const bindingType = message.isControl()
                ? MidiBinding.BINDING_TYPE_CONTROL
                : message.isProgram()
                    ? MidiBinding.BINDING_TYPE_PROGRAM
                    : MidiBinding.BINDING_TYPE_NOTE;
            const matchingActions = actions.filter((action) =>
                action.enabled &&
                action.bindingType === bindingType &&
                (action.channel < 0 || action.channel === channel - 1) &&
                action.number === (message.cc1 & 0x7F));
            const matched = matchingActions.length === 0
                ? ''
                : `  -> ${matchingActions.map((action) =>
                    midiActionNames.get(action.actionType) ?? 'Action').join(', ')}`;
            setMonitorEvents((current) =>
                [`${timestamp}  Ch ${channel}  ${type}${value}${matched}`, ...current].slice(0, 12));
        });
    };
    useEffect(() => () => {
        if (monitorHandle.current) {
            model.cancelListenForMidiEvent(monitorHandle.current);
            monitorHandle.current = null;
        }
    }, [model]);

    const persistProfiles = (nextProfiles: MidiActionProfile[]) => {
        setProfiles(nextProfiles);
        localStorage.setItem(MIDI_PROFILE_STORAGE_KEY, JSON.stringify(nextProfiles));
    };
    const saveProfile = () => {
        const name = profileName.trim() || 'Controller';
        const profile: MidiActionProfile = {
            format: 'pipedal-midi-actions',
            version: 1,
            name,
            actions: actions.map((action) => action.clone()),
        };
        persistProfiles([
            ...profiles.filter((candidate) => candidate.name !== name),
            profile,
        ].sort((left, right) => left.name.localeCompare(right.name)));
        setSelectedProfile(name);
    };
    const loadProfile = (name: string) => {
        setSelectedProfile(name);
        const profile = profiles.find((candidate) => candidate.name === name);
        if (profile) {
            setProfileName(profile.name);
            setActions(profile.actions.map((action) => action.clone()));
        }
    };
    const exportProfile = () => {
        const profile: MidiActionProfile = {
            format: 'pipedal-midi-actions',
            version: 1,
            name: profileName.trim() || 'Controller',
            actions: actions.map((action) => action.clone()),
        };
        const blob = new Blob([JSON.stringify(profile, null, 2)], {
            type: 'application/json',
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${profile.name.replace(/[^a-z0-9_-]+/gi, '-')}.pipedal-midi.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    };
    const importProfile = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        void file.text().then((text) => {
            const input = JSON.parse(text);
            if (input?.format !== 'pipedal-midi-actions' ||
                input?.version !== 1 ||
                !Array.isArray(input?.actions)) {
                throw new Error('Unsupported MIDI profile format.');
            }
            const profile: MidiActionProfile = {
                format: 'pipedal-midi-actions',
                version: 1,
                name: String(input.name || file.name),
                actions: input.actions.map((action: unknown) =>
                    new MidiAction().deserialize(action)),
            };
            persistProfiles([
                ...profiles.filter((candidate) => candidate.name !== profile.name),
                profile,
            ].sort((left, right) => left.name.localeCompare(right.name)));
            setProfileName(profile.name);
            setSelectedProfile(profile.name);
            setActions(profile.actions.map((action) => action.clone()));
        }).catch((error) => model.showAlert(String(error)));
    };

    return (
        <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="xl">
            <DialogTitle>MIDI action chains</DialogTitle>
            <DialogContent sx={{ p: 0, overflowX: 'auto' }}>
                <Box sx={{
                    px: 2,
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    flexWrap: 'wrap',
                }}>
                    <Select
                        size="small"
                        value={selectedProfile}
                        displayEmpty
                        onChange={(event) => loadProfile(String(event.target.value))}
                        sx={{ minWidth: 170 }}
                    >
                        <MenuItem value="">Profiles</MenuItem>
                        {profiles.map((profile) => (
                            <MenuItem key={profile.name} value={profile.name}>
                                {profile.name}
                            </MenuItem>
                        ))}
                    </Select>
                    <TextField
                        size="small"
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                        label="Profile name"
                    />
                    <Tooltip title="Save profile">
                        <IconButton onClick={saveProfile}><SaveIcon /></IconButton>
                    </Tooltip>
                    <Tooltip title="Import profile">
                        <IconButton onClick={() => importRef.current?.click()}>
                            <UploadFileIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Export profile">
                        <IconButton onClick={exportProfile}><DownloadIcon /></IconButton>
                    </Tooltip>
                    <input
                        ref={importRef}
                        type="file"
                        accept=".json,.pipedal-midi.json,application/json"
                        hidden
                        onChange={importProfile}
                    />
                    <Button
                        size="small"
                        color={monitoring ? 'secondary' : 'primary'}
                        startIcon={monitoring ? <StopIcon /> : <SensorsIcon />}
                        onClick={monitoring ? stopMonitor : startMonitor}
                        sx={{ ml: 'auto' }}
                    >
                        {monitoring ? 'Stop monitor' : 'MIDI monitor'}
                    </Button>
                </Box>
                {(monitoring || monitorEvents.length > 0) && (
                    <Box sx={{
                        px: 2,
                        py: 1,
                        minHeight: 38,
                        display: 'flex',
                        gap: 1,
                        alignItems: 'center',
                        overflowX: 'auto',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        fontFamily: 'monospace',
                    }}>
                        {monitorEvents.length === 0
                            ? <Typography variant="caption">Waiting for MIDI</Typography>
                            : monitorEvents.map((event, index) => (
                                <Typography
                                    key={`${event}-${index}`}
                                    variant="caption"
                                    sx={{ whiteSpace: 'nowrap' }}
                                >
                                    {event}
                                </Typography>
                            ))}
                    </Box>
                )}
                <MidiActionTable actions={actions} onChange={setActions} />
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose}>Cancel</Button>
                <Button variant="contained" onClick={() => {
                    model.setMidiActions(actions);
                    props.onClose();
                }}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
