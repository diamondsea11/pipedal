// Copyright (c) 2026 Thomas Rapolani
// SPDX-License-Identifier: MIT

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Typography from '@mui/material/Typography';
import DialogEx from './DialogEx';
import IconButtonEx from './IconButtonEx';
import InlinePluginBrowser from './InlinePluginBrowser';

export interface LoadPluginBrowserDialogProps {
    open: boolean;
    onOk: (selectedUri: string) => void;
    onCancel: () => void;
}

// Full-screen "Select Plugin" replacement that hosts the Category -> Manufacturer
// -> Plugin drill-down browser (with right-click / long-press re-categorise).
export default function LoadPluginBrowserDialog(props: LoadPluginBrowserDialogProps) {
    return (
        <DialogEx
            tag="plugins"
            fullScreen={true}
            TransitionComponent={undefined}
            maxWidth={false}
            open={props.open}
            scroll="body"
            onClose={props.onCancel}
            style={{ overflowX: 'hidden', overflowY: 'hidden', display: 'flex', flexDirection: 'column', flexWrap: 'nowrap' }}
            aria-labelledby="select-plugin-dialog-title"
        >
            <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', height: '100%' }}>
                <div style={{
                    flex: '0 0 auto', display: 'flex', flexDirection: 'row', alignItems: 'center',
                    height: 56, paddingLeft: 8, paddingRight: 16,
                }}>
                    <IconButtonEx tooltip="Back" onClick={props.onCancel} style={{ flex: '0 0 auto', marginRight: 12 }}>
                        <ArrowBackIcon />
                    </IconButtonEx>
                    <Typography id="select-plugin-dialog-title" display="inline" noWrap variant="h6">
                        Select Plugin
                    </Typography>
                </div>
                <div style={{ flex: '1 1 auto', minHeight: 0 }}>
                    <InlinePluginBrowser onSelect={props.onOk} />
                </div>
            </div>
        </DialogEx>
    );
}
