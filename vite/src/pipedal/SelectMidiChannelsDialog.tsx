// Copyright (c) 2026 Robin Davies
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import React from 'react';
import { useState } from 'react';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import UsbIcon from '@mui/icons-material/Usb';
import InputIcon from '@mui/icons-material/Input';
import OutputIcon from '@mui/icons-material/Output';

import Checkbox from '@mui/material/Checkbox';
import { AlsaSequencerConfiguration, AlsaSequencerPortSelection } from './AlsaSequencer';
import DialogEx from './DialogEx';

import { PiPedalModel, PiPedalModelFactory } from './PiPedalModel';

export interface SelectMidiChannelsDialogProps {
    open: boolean;
    onClose: () => void;
}

interface DeviceListItem {
    id: string;
    name: string;
    sortOrder: number
    offline: boolean;
    bluetooth: boolean;
};

function SelectMidiChannelsDialog(props: SelectMidiChannelsDialogProps) {
    //const classes = useStyles();
    const { open, onClose } = props;
    const [availablePorts, setAvailablePorts] = useState<AlsaSequencerPortSelection[] | null>(null);
    const [configuration, setConfiguration] = useState<AlsaSequencerConfiguration | null>(null);
    const [inputPorts, setInputPorts] = useState<DeviceListItem[] | null>(null);
    const [outputPorts, setOutputPorts] = useState<DeviceListItem[] | null>(null);
    const [model] = useState<PiPedalModel>(PiPedalModelFactory.getInstance());
    const [changed, setChanged] = useState<boolean>(false);
    const [ readyToDisplay, setReadyToDisplay ] = useState<boolean>(false);


    React.useEffect(() => {
        if (open) {
            setReadyToDisplay(false);
            model.getAlsaSequencerPorts().then((ports) => {
                setAvailablePorts(ports);
            }).catch((error) => {
                model.showAlert(error);
                setReadyToDisplay(true);
                setAvailablePorts(null);
            });
            model.getAlsaSequencerConfiguration().then((config) => {
                setConfiguration(config);
            }).catch((error) => {
                model.showAlert(error);
                setReadyToDisplay(true);
                setConfiguration(null);
            });
            return () => {
            }
        } else {
            return () => { };
        }
    }, [open]);
    React.useEffect(() => {
        if (availablePorts !== null && configuration !== null) {
            const makeList = (direction: 'input' | 'output') => {
                const selected = direction === 'input'
                    ? configuration.connections : configuration.outputConnections;
                let result: DeviceListItem[] = [];
                for (let port of availablePorts) {
                    if (!port[direction]) continue;
                    result.push({
                        id: port.id,
                        name: port.name,
                        sortOrder: port.sortOrder,
                        offline: false,
                        bluetooth: port.bluetooth,
                    });
                }
                for (let port of selected) {
                    if (!availablePorts.some((p) => p.id === port.id && p[direction])) {
                        result.push({
                            id: port.id,
                            name: port.name,
                            sortOrder: port.sortOrder + 100,
                            offline: true,
                            bluetooth: port.bluetooth,
                        });
                    }
                }
                return result.sort((a, b) => a.sortOrder - b.sortOrder);
            };
            setReadyToDisplay(true);
            setInputPorts(makeList('input'));
            setOutputPorts(makeList('output'));
        } else {
            setInputPorts(null);
            setOutputPorts(null);
        }

    }, [availablePorts, configuration]);

    const isChecked = (value: DeviceListItem, direction: 'input' | 'output') => {
        if (availablePorts === null || configuration === null) {
            return false;
        }
        const selected = direction === 'input'
            ? configuration.connections : configuration.outputConnections;
        return selected.some((port) => port.id === value.id);
    };
    const setChecked = (value_: DeviceListItem, direction: 'input' | 'output', checked: boolean) => {
        if (availablePorts === null || configuration === null) {
            return;
        }
        let value = new AlsaSequencerPortSelection();
        value.id = value_.id;
        value.name = value_.name;
        value.sortOrder = value_.sortOrder;
        value.bluetooth = value_.bluetooth;
        value.input = direction === 'input';
        value.output = direction === 'output';
        let newConnections = (direction === 'input'
            ? configuration.connections : configuration.outputConnections).slice();
        if (checked) {
            newConnections.push(value);
        } else {
            newConnections = newConnections.filter((port) => port.id !== value.id);
        }
        let newConfiguration = new AlsaSequencerConfiguration();
        newConfiguration.midiChannel = configuration.midiChannel;
        newConfiguration.connections = direction === 'input'
            ? newConnections : configuration.connections.slice();
        newConfiguration.outputConnections = direction === 'output'
            ? newConnections : configuration.outputConnections.slice();
        setConfiguration(newConfiguration);
    };
    let toggleSelect = (value: DeviceListItem, direction: 'input' | 'output') => {
        if (availablePorts === null || configuration === null) {
            return;
        }
        if (!isChecked(value, direction)) {
            setChecked(value, direction, true);
        } else {
            setChecked(value, direction, false);
        }
        setChanged(true);
    };

    const handleClose = (): void => {
        onClose();
    };
    const handleOk = (): void => {
        if (changed && configuration !== null) {
            model.setAlsaSequencerConfiguration(configuration);
        }
        onClose();
    };
    const handleChannelChanged = (channel: number) => {
        if (configuration !== null) {
            let newConfiguration = new AlsaSequencerConfiguration();
            newConfiguration.midiChannel = channel;
            newConfiguration.connections = configuration.connections.slice();
            newConfiguration.outputConnections = configuration.outputConnections.slice();
            setConfiguration(newConfiguration);
            setChanged(true);
        }
    }


    return (
        <DialogEx tag="midiChannels" onClose={handleClose} aria-labelledby="select-midi-inputs"
            open={open && readyToDisplay}
            fullWidth maxWidth="sm"
            onEnterKey={handleClose}
        >
            <DialogTitle id="select-midi-inputs">MIDI Connections</DialogTitle>
            <DialogContent dividers>
                <div style={{ margin: '8px 16px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <InputIcon color="secondary" />
                    <div style={{ flex: 1 }}>
                    <Typography display="block" variant="caption">Input channel</Typography>
                    <Select variant='standard' value={configuration? configuration.midiChannel.toString(): ""} style={{ width: 100 }}
                        sx={{ '& .MuiSelect-select': { textAlign: 'right' } }} disabled={!readyToDisplay}
                        onChange={(event) => handleChannelChanged(parseInt(event.target.value))}>
                        <MenuItem key={-1} value={-1} sx={{ justifyContent: 'flex-end' }}>OMNI</MenuItem>
                        {Array.from({ length: 16 }, (_, channel) => (
                            <MenuItem key={channel} value={channel} sx={{ justifyContent: 'flex-end' }}>
                                {channel + 1}
                            </MenuItem>
                        ))}
                    </Select>
                    </div>
                </div>
                <PortList title="MIDI inputs" ports={inputPorts} direction="input"
                    isChecked={isChecked} toggleSelect={toggleSelect} />
                <Divider sx={{ my: 2 }} />
                <PortList title="MIDI outputs" ports={outputPorts} direction="output"
                    isChecked={isChecked} toggleSelect={toggleSelect} />
                {availablePorts !== null && !availablePorts.some((port) => port.bluetooth) && (
                    <div style={{ display: 'flex', gap: 10, margin: '18px 16px 4px', alignItems: 'center' }}>
                        <BluetoothIcon color="disabled" />
                        <Typography variant="caption" color="textSecondary">
                            A connected BLE MIDI device will appear here automatically.
                        </Typography>
                    </div>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} variant="dialogSecondary" >Cancel</Button>
                <Button onClick={handleOk} variant="dialogPrimary" >OK</Button>
            </DialogActions>
        </DialogEx>
    );
}

function PortList(props: {
    title: string;
    ports: DeviceListItem[] | null;
    direction: 'input' | 'output';
    isChecked: (port: DeviceListItem, direction: 'input' | 'output') => boolean;
    toggleSelect: (port: DeviceListItem, direction: 'input' | 'output') => void;
}) {
    return <div>
        <Typography variant="subtitle2" sx={{ px: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
            {props.direction === 'input' ? <InputIcon fontSize="small" /> : <OutputIcon fontSize="small" />}
            {props.title}
        </Typography>
        <List dense>
                    {props.ports !== null && props.ports.length === 0 && (
                        <Typography variant="body2" style={{ marginLeft: 32, marginRight: 24, marginTop: 8, marginBottom: 16 }}>
                            No {props.direction === 'input' ? 'input' : 'output'} devices found.
                        </Typography>)}
                    {props.ports != null && props.ports.map((port) => (
                        <ListItemButton key={port.id} onClick={() => props.toggleSelect(port, props.direction)}>
                            <FormControlLabel
                                sx={{ width: '100%', m: 0 }}
                                control={
                                    <Checkbox
                                        checked={props.isChecked(port, props.direction)}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={() => props.toggleSelect(port, props.direction)} />
                                }
                                label={
                                    (
                                    <div style={{ display: "flex", flexFlow: "row nowrap", alignItems: "center", gap: 10, width: '100%' }}>
                                        {port.bluetooth ? <BluetoothIcon fontSize="small" color="secondary" /> : <UsbIcon fontSize="small" color="disabled" />}
                                        <Typography
                                            color={ port.offline ? "textSecondary" : "textPrimary" }
                                            noWrap variant="body2"
                                            style={{ flex: "1 1 auto" }}
                                        >
                                            {port.name}
                                        </Typography>
                                        {port.offline && (
                                            <Typography color="textSecondary" variant="body2" >
                                                (offline)
                                            </Typography>
                                        )}
                                    </div>
                                    )}
                            />
                        </ListItemButton>
                    )
                    )}
                </List>
    </div>;
}

export default SelectMidiChannelsDialog;
