// Copyright (c) Robin E.R. Davies
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

import React, { ReactNode, Component, SyntheticEvent } from 'react';
import { css } from '@emotion/react';
import { createStyles } from './WithStyles';

import WithStyles, { withTheme } from './WithStyles';
import { withStyles } from "tss-react/mui";


import { Theme } from '@mui/material/styles';
import { PiPedalModel, PiPedalModelFactory } from './PiPedalModel';
import { PluginType } from './Lv2Plugin';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import Fade from '@mui/material/Fade';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import EqualizerIcon from '@mui/icons-material/Equalizer';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ControlPointDuplicateIcon from '@mui/icons-material/ControlPointDuplicate';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PluginIcon, { getIconColor, SelectIconUri } from './PluginIcon';
import { SelectHoverBackground } from './SelectHoverBackground';
import SvgPathBuilder from './SvgPathBuilder';
import Draggable from './Draggable'
import Rect from './Rect';
import { PiPedalStateError } from './PiPedalError';
import { isDarkMode } from './DarkMode';
import {
    Pedalboard, PedalboardItem, PedalboardSplitItem, SplitType
} from './Pedalboard';
import {
    copyPedalboardItem,
    getPedalboardClipboardItem,
    hasPedalboardClipboard
} from './PedalboardClipboard';

// import MidiIcon from './svg/ic_midi.svg?react';
// import { midiChannelBindingControlFeatureEnabled } from './MidiChannelBinding';
// import CloseIcon from '@mui/icons-material/Close';

const START_CONTROL = Pedalboard.START_CONTROL_ID;
const END_CONTROL = Pedalboard.END_CONTROL_ID;


const START_PEDALBOARD_ITEM_URI = Pedalboard.START_PEDALBOARD_ITEM_URI;
const END_PEDALBOARD_ITEM_URI = Pedalboard.END_PEDALBOARD_ITEM_URI;

const ENABLED_CONNECTOR_COLOR = isDarkMode() ? "#CCC" : "#666";
const DISABLED_CONNECTOR_COLOR = isDarkMode() ? "#666" : "#CCC";



const CELL_WIDTH: number = 96;
const CELL_HEIGHT: number = 64;
const FRAME_SIZE: number = 36;
const PATH_HEADER_HEIGHT: number = 36;
const PATH_GAP: number = 8;

const STROKE_WIDTH = 3;
const STEREO_STROKE_WIDTH = 6;


const I_SVG_STROKE_WIDTH = 3;
const I_SVG_STEREO_STROKE_WIDTH = 6;

const SVG_STROKE_WIDTH = I_SVG_STROKE_WIDTH.toString();
const SVG_STEREO_STROKE_WIDTH = I_SVG_STEREO_STROKE_WIDTH.toString();



const EMPTY_ICON_URL = "img/fx_empty.svg";
const ERROR_ICON_URL = "img/fx_error.svg";
const TERMINAL_ICON_URL = "img/fx_terminal.svg";

function CalculateConnection(numberOfInputs: number, numberOfOutputs: number) {
    if (numberOfInputs === 0) {
        return numberOfOutputs;
    }
    if (numberOfOutputs === 0) {
        return numberOfInputs;
    }
    let result = Math.min(numberOfInputs, numberOfOutputs);
    if (result > 2) result = 2;
    return result;
}

const pedalboardStyles = (theme: Theme) => createStyles({
    scrollContainer: {
    },

    container: css({
        position: "relative",
        overflow: "visible",

    }),
    pathHeader: css({
        position: "absolute",
        left: 8,
        right: 8,
        height: PATH_HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: `1px solid ${theme.palette.divider}`,
        zIndex: 2,
    }),
    splitItem: css({
        position: "absolute",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",


        width: CELL_WIDTH,
        height: CELL_HEIGHT

    }),
    splitStart: css({
        position: "absolute",
        display: "flex",
        width: CELL_WIDTH,
        height: CELL_HEIGHT,
        left: 0,
        top: 0
    }),
    splitEnd: css({
        position: "absolute",
        display: "flex",
        width: CELL_WIDTH,
        height: CELL_HEIGHT,
        right: 0,
        top: 0
    }),
    buttonDraggable: css({
        display: "flex",
        alignItem: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%"
    }),
    pedalItem: css({
        position: "absolute",
        width: CELL_WIDTH,
        height: CELL_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    }),
    midiConnectorDecoration: css({
        position: "absolute",
        left: -20,
        top: -6,
        fill: theme.palette.text.secondary
    }),

    pedalButton: css({

        position: "relative",

        marginLeft: (CELL_WIDTH - FRAME_SIZE) / 2,
        marginRight: (CELL_WIDTH - FRAME_SIZE) / 2,
        marginTop: (CELL_HEIGHT - FRAME_SIZE) / 2,
        marginBottom: (CELL_HEIGHT - FRAME_SIZE) / 2,
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        padding: 0,
        borderRadius: 8
    }),

    iconFrame: css({

        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: theme.palette.background.paper,

        width: FRAME_SIZE,
        height: FRAME_SIZE,
        borderColor: "#777",
        borderWidth: 2,
        borderStyle: "solid",
        overflow: "hidden",
        padding: 0,
        borderRadius: 8
    }),
    selectedIconFrame: css({

        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: theme.palette.background.paper,
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        borderColor: theme.palette.primary.main,
        borderWidth: "2.0px",
        borderStyle: "solid",
        overflow: "hidden",
        borderRadius: 8,
        boxShadow: "0 0 6px 0px " + theme.palette.primary.main + "C0"
    }),
    borderlessIconFrame: css({

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        background: "transparent",
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        border: "0px #666 solid",
        borderRadius: 8,
        overflow: "hidden",
    }),

    pedalIcon: css({
        width: 24,
        height: 24,
        opacity: 0.8
    }),
    connector: css({
        position: "absolute",
        width: CELL_WIDTH,
        height: CELL_HEIGHT
    }),
    stroke: css({
        position: "absolute",
        background: "#888"
    }),
    stereoStrokeOuter: css({
        position: "absolute",
        background: "#888"
    }),
    stereoStrokeInner: css({
        position: "absolute",
        background: "#888"
    }),

});

export type OnSelectHandler = (selectedPedal: number) => void;

interface PedalboardProps extends WithStyles<typeof pedalboardStyles> {
    theme: Theme;
    selectedId?: number;
    onSelectionChanged?: OnSelectHandler;
    onDoubleClick?: OnSelectHandler;
    hasTinyToolBar: boolean;
    enableStructureEditing: boolean;

}
interface LayoutSize {
    width: number;
    height: number;
}

type PedalboardState = {
    pedalboard?: Pedalboard;
    globalEqDialogOpen: boolean;
    contextMenu: {
        mouseX: number;
        mouseY: number;
        instanceId: number;
    } | null;
};

const EMPTY_PEDALS: PedalLayout[] = [];


function makeChain(model: PiPedalModel, uiItems?: PedalboardItem[]): PedalLayout[] {
    let result: PedalLayout[] = [];
    if (uiItems) {
        for (let i = 0; i < uiItems.length; ++i) {
            let item = uiItems[i];
            result.push(new PedalLayout(model, item));
        }
    }
    return result;
}

class PedalLayout {
    uri: string = "";
    name: string = "";
    pluginType: PluginType = PluginType.Plugin;
    iconUrl: string = "";
    iconColor: string = "";

    bounds: Rect = new Rect();

    numberOfInputs: number = 2;
    numberOfOutputs: number = 2;
    originalInputs: number = 2;
    originalOutputs: number = 2;

    pedalItem?: PedalboardItem;
    terminalInstanceId: number = 0;

    // Split Layout only.
    topChildren: PedalLayout[] = EMPTY_PEDALS;
    bottomChildren: PedalLayout[] = EMPTY_PEDALS;
    topConnectorY: number = 0;
    bottomConnectorY: number = 0;


    static Start(instanceId: number = START_CONTROL, numberOfOutputs: number = 2): PedalLayout {
        let t: PedalLayout = new PedalLayout();
        t.uri = START_PEDALBOARD_ITEM_URI;
        t.pluginType = PluginType.Terminal;
        t.iconUrl = TERMINAL_ICON_URL;
        t.numberOfInputs = 0;
        t.numberOfOutputs = numberOfOutputs;
        t.originalInputs = 0;
        t.originalOutputs = numberOfOutputs;
        t.terminalInstanceId = instanceId;
        return t;
    }
    static End(instanceId: number = END_CONTROL, numberOfInputs: number = 2): PedalLayout {
        let t: PedalLayout = new PedalLayout();
        t.pluginType = PluginType.Terminal;
        t.uri = END_PEDALBOARD_ITEM_URI;
        t.iconUrl = TERMINAL_ICON_URL;
        t.numberOfInputs = numberOfInputs;
        t.numberOfOutputs = 0;
        t.originalInputs = numberOfInputs;
        t.originalOutputs = 0;
        t.terminalInstanceId = instanceId;
        return t;
    }
    constructor(model?: PiPedalModel, pedalItem?: PedalboardItem) {
        if (model === undefined && pedalItem === undefined) {
            return;
        }
        if (model === undefined || pedalItem === undefined) {
            throw new Error("Invalid arguments.");
        }
        this.pedalItem = pedalItem;
        this.uri = pedalItem.uri;
        if (pedalItem.isSplit()) {
            let splitter = pedalItem as PedalboardSplitItem;

            this.pluginType = PluginType.UtilityPlugin;
            this.topChildren = makeChain(model, splitter.topChain);
            this.bottomChildren = makeChain(model, splitter.bottomChain);

            this.numberOfInputs = 2;
            this.numberOfOutputs = 2;

        } else if (pedalItem.isEmpty()) {

            this.pluginType = PluginType.None;
            this.iconUrl = EMPTY_ICON_URL;
            this.numberOfInputs = 2;
            this.numberOfOutputs = 2;

        } else if (pedalItem.uri === START_PEDALBOARD_ITEM_URI) {
            this.pluginType = PluginType.UtilityPlugin;
            this.iconUrl = TERMINAL_ICON_URL;
            this.numberOfInputs = 0;
            this.numberOfOutputs = PiPedalModelFactory.getInstance().jackSettings.get().inputAudioPorts.length;
            if (this.numberOfOutputs === 0) {
                this.numberOfOutputs = 1;
            }

        } else if (pedalItem.uri === END_PEDALBOARD_ITEM_URI) {
            this.pluginType = PluginType.UtilityPlugin;
            this.iconUrl = TERMINAL_ICON_URL;
            this.numberOfInputs = PiPedalModelFactory.getInstance().jackSettings.get().outputAudioPorts.length;
            if (this.numberOfInputs === 0) {
                this.numberOfInputs = 1;
            }
            this.numberOfOutputs = 0;
        }
        else {
            let uiPlugin = model.getUiPlugin(pedalItem.uri);
            if (uiPlugin != null) {
                let pluginType = uiPlugin.plugin_type;
                this.pluginType = pluginType;
                if (this.uri === "http://two-play.com/plugins/toob-nam") {
                    pluginType = PluginType.NamPlugin;
                }
                this.iconUrl = SelectIconUri(pluginType);
                this.iconColor = pedalItem.iconColor;
                this.name = uiPlugin.label;
                if (pedalItem.title !== "") {
                    this.name = pedalItem.title;
                }
                this.numberOfInputs = Math.min(uiPlugin.audio_inputs, 2);
                this.numberOfOutputs = Math.min(uiPlugin.audio_outputs, 2);
            } else {
                // default to empty plugin.
                this.pluginType = PluginType.ErrorPlugin;
                this.name = pedalItem.pluginName ?? "#error";
                this.iconUrl = ERROR_ICON_URL;
                this.numberOfInputs = 2;
                this.numberOfOutputs = 2;
            }
        }
        this.originalInputs = this.numberOfInputs;
        this.originalOutputs = this.numberOfOutputs;
    }
    isEmpty(): boolean {
        return (!this.pedalItem) || this.pedalItem.isEmpty();
    }
    isSplitter(): boolean {
        return this.pedalItem !== undefined && this.pedalItem.isSplit();
    }
    isStart() {
        return this.uri === START_PEDALBOARD_ITEM_URI;
    }
    isEnd() {
        return this.uri === END_PEDALBOARD_ITEM_URI;
    }
}

function* chainIterator(layoutChain: PedalLayout[]): Generator<PedalLayout, void, undefined> {
    for (let i = 0; i < layoutChain.length; ++i) {
        let item = layoutChain[i];
        yield item;
        if (item.isSplitter()) {
            let g = chainIterator(item.topChildren);
            while (true) {
                let v = g.next();
                if (v.done) {
                    break;
                }
                yield v.value;
            }
            g = chainIterator(item.bottomChildren);
            while (true) {
                let v = g.next();
                if (v.done) {
                    break;
                }
                yield v.value;
            }
        }
    }
    return;
}



class LayoutParams {
    nextId: number = 1;
    cx: number = 0;
    cy: number = 0;
}


const PedalboardView =
    withTheme(
        withStyles(
            class extends Component<PedalboardProps, PedalboardState> {
                model: PiPedalModel;

                frameRef: React.RefObject<HTMLDivElement | null>;
                scrollRef: React.RefObject<HTMLDivElement | null>;
                private bgColor: string;

                constructor(props: PedalboardProps) {
                    super(props);
                    this.model = PiPedalModelFactory.getInstance();

                    this.bgColor = props.theme.palette.background.default

                    if (!props.selectedId) props.selectedId = -1;
                    this.state = {
                        pedalboard: this.model.pedalboard.get(),
                        globalEqDialogOpen: false,
                        contextMenu: null,
                    };
                    this.onPedalboardChanged = this.onPedalboardChanged.bind(this);
                    this.frameRef = React.createRef();
                    this.scrollRef = React.createRef();
                    this.handleTouchStart = this.handleTouchStart.bind(this);
                }

                handleTouchStart(e: any) {
                    // just has to exist to allow Draggable to receive 
                    // touchyMove. :-/
                }

                isSplitterChild(item: PedalboardItem, splitterInstanceId: number) {
                    if (item.instanceId === splitterInstanceId) {
                        return true;
                    }
                    let pedalboard: Pedalboard | undefined = this.state.pedalboard;
                    if (!pedalboard) return false;

                    let splitter = pedalboard.maybeGetItem(splitterInstanceId);
                    if (splitter === null) {
                        return false;
                    }
                    return splitter.isChild(item.instanceId);
                }

                onDragEnd(instanceId: number, clientX: number, clientY: number) {
                    if (!this.props.enableStructureEditing) {
                        return;
                    }
                    if (!this.currentLayout) return;

                    if (!this.frameRef.current) return;

                    let currentLayout: PedalLayout[] = this.currentLayout;
                    let frameElement = this.frameRef.current;

                    let rc = frameElement.getBoundingClientRect();
                    clientX -= rc.left;
                    clientY -= rc.top;

                    let it = chainIterator(currentLayout);

                    while (true) {
                        let v = it.next();
                        if (v.done) break;
                        let item = v.value;

                        if (item.isSplitter() && item.pedalItem) {
                            if (item.bounds.contains(clientX, clientY)) {
                                if (clientX < item.bounds.x + CELL_WIDTH / 2) {
                                    if (this.isSplitterChild(item.pedalItem, instanceId)) 
                                    {
                                        return;
                                    }
                                    this.model.movePedalboardItemBefore(instanceId, item.pedalItem.instanceId);
                                    this.setSelection(instanceId);
                                    return;
                                } else if (clientX > item.bounds.right - CELL_WIDTH / 2) {
                                    if (this.isSplitterChild(item.pedalItem, instanceId)) 
                                    {
                                        return;
                                    }
                                    this.model.movePedalboardItemAfter(instanceId, item.pedalItem.instanceId);
                                    this.setSelection(instanceId);
                                    return;

                                }
                            }
                            let yMid = (item.bounds.y + item.bounds.bottom) / 2;
                            if (clientX >= item.bounds.x
                                && clientY < yMid && clientY >= item.topChildren[0].bounds.y

                            ) {
                                if (clientX < item.topChildren[0].bounds.x) {
                                    let topPedalItem = item.topChildren[0].pedalItem;
                                    if (topPedalItem) {
                                        if (this.isSplitterChild(topPedalItem, instanceId)) 
                                        {
                                            return;
                                        }

                                        this.model.movePedalboardItemBefore(instanceId, topPedalItem.instanceId);
                                        this.setSelection(instanceId);
                                        return;
                                    }
                                }
                                let lastTop = item.topChildren[item.topChildren.length - 1];
                                if (clientX >= lastTop.bounds.right && clientX < item.bounds.right - CELL_WIDTH / 2) {
                                    if (lastTop.pedalItem) {
                                        if (this.isSplitterChild(lastTop.pedalItem, instanceId)) {
                                            return;
                                        }
                                        this.model.movePedalboardItemAfter(instanceId, lastTop.pedalItem.instanceId);
                                        this.setSelection(instanceId);
                                        return;
                                    }
                                }

                            }
                            if (clientX >= item.bounds.x
                                && clientY > yMid && clientY < item.bottomChildren[0].bounds.bottom
                            ) {
                                if (clientX < item.bottomChildren[0].bounds.x) {
                                    let bottomPedalItem = item.bottomChildren[0].pedalItem;
                                    if (bottomPedalItem) {
                                        if (this.isSplitterChild(bottomPedalItem, instanceId)) {
                                            return;
                                        }
                                        this.model.movePedalboardItemBefore(instanceId, bottomPedalItem.instanceId);
                                        this.setSelection(instanceId);
                                        return;
                                    }
                                }
                                let lastBottom = item.bottomChildren[item.bottomChildren.length - 1];
                                if (clientX >= lastBottom.bounds.right && clientX < item.bounds.right - CELL_WIDTH / 2) {
                                    if (lastBottom.pedalItem) {
                                        if (this.isSplitterChild(lastBottom.pedalItem, instanceId)) {
                                            return;
                                        }
                                        this.model.movePedalboardItemAfter(instanceId, lastBottom.pedalItem.instanceId);
                                        this.setSelection(instanceId);
                                        return;
                                    }

                                }

                            }

                        } else if (item.bounds.contains(clientX, clientY)) {
                            if (item.isStart()) {
                                this.model.movePedalboardItemToPathStart(instanceId, item.terminalInstanceId);
                                this.setSelection(instanceId);
                                return;
                            } else if (item.isEnd()) {
                                this.model.movePedalboardItemToPathEnd(instanceId, item.terminalInstanceId);
                                this.setSelection(instanceId);
                                return;
                            } else {
                                if (item.pedalItem) {
                                    let margin = (CELL_WIDTH - FRAME_SIZE) / 2;
                                    if (clientX < item.bounds.x + margin) {
                                        if (this.isSplitterChild(item.pedalItem,instanceId))
                                        {
                                            return;
                                        }
                                        this.model.movePedalboardItemBefore(instanceId, item.pedalItem.instanceId);
                                    } else if (clientX > item.bounds.right - margin) {
                                        if (this.isSplitterChild(item.pedalItem,instanceId))
                                        {
                                            return;
                                        }
                                        this.model.movePedalboardItemAfter(instanceId, item.pedalItem.instanceId);
                                    } else {
                                        if (this.isSplitterChild(item.pedalItem,instanceId))
                                        {
                                            return;
                                        }
                                        this.model.movePedalboardItem(instanceId, item.pedalItem.instanceId);
                                    }
                                    this.setSelection(instanceId);
                                    return;
                                }
                            }

                        }
                    }
                    // delete the plugin.
                    let newId = this.model.setPedalboardItemEmpty(instanceId);
                    this.setSelection(newId);

                }

                onPedalboardChanged(value?: Pedalboard) {
                    this.setState({
                        pedalboard: value,
                    });
                }

                componentDidMount() {
                    this.scrollRef.current!.addEventListener("touchstart", this.handleTouchStart, { passive: false });
                    this.model.pedalboard.addOnChangedHandler(this.onPedalboardChanged);

                }
                componentWillUnmount() {
                    this.scrollRef.current!.removeEventListener("touchstart", this.handleTouchStart);
                    this.model.pedalboard.removeOnChangedHandler(this.onPedalboardChanged);
                }

                offsetLayout_(layoutItems: PedalLayout[], offset: number): void {
                    for (let i = 0; i < layoutItems.length; ++i) {
                        let layoutItem = layoutItems[i];
                        layoutItem.bounds.y += offset;
                        if (layoutItem.isSplitter()) {
                            layoutItem.topConnectorY += offset;
                            layoutItem.bottomConnectorY += offset;
                            this.offsetLayout_(layoutItem.topChildren, offset);
                            this.offsetLayout_(layoutItem.bottomChildren, offset);
                        }
                    }
                }

                getSplitterIcon(layoutItem: PedalLayout): PluginType {
                    if (layoutItem.pedalItem === undefined) {
                        throw new Error("Invalid splitter");
                    }
                    let split = layoutItem.pedalItem as PedalboardSplitItem;
                    if (split.getSplitType() === SplitType.Ab) {
                        if (split.isASelected()) {
                            return PluginType.SplitA;
                        } else {
                            return PluginType.SplitB;

                        }
                    } else if (split.getSplitType() === SplitType.Mix) {
                        return PluginType.SplitMix; //"img/fx_dial.svg";
                    } else {
                        return PluginType.SplitLR; //"img/fx_lr.svg";
                    }
                }

                doLayout2_(lp: LayoutParams, layoutItems: PedalLayout[]): Rect {
                    let bounds = new Rect();
                    for (let i = 0; i < layoutItems.length; ++i) {
                        let layoutItem = layoutItems[i];
                        if (layoutItem.isSplitter()) {
                            let x0 = lp.cx;
                            let y0 = lp.cy;

                            layoutItem.bounds.x = x0;
                            layoutItem.bounds.y = y0;
                            layoutItem.bounds.height = CELL_HEIGHT;
                            layoutItem.bounds.width = CELL_WIDTH;

                            lp.cx += CELL_WIDTH;


                            let topBounds = this.doLayout2_(lp, layoutItem.topChildren);
                            if (topBounds.isEmpty()) {
                                topBounds.x = lp.cx;
                                topBounds.width = 0;
                                topBounds.y = y0 - CELL_HEIGHT / 2;
                                topBounds.height = CELL_HEIGHT;

                            }


                            let dyTop = (lp.cy + CELL_HEIGHT / 2) - (topBounds.y + topBounds.height);



                            this.offsetLayout_(layoutItem.topChildren, dyTop);
                            topBounds.offset(0, dyTop);
                            bounds.accumulate(topBounds);

                            let topCx = lp.cx;
                            lp.cx = x0;
                            lp.cx += CELL_WIDTH;

                            let bottomBounds = this.doLayout2_(lp, layoutItem.bottomChildren);
                            if (bottomBounds.isEmpty()) {
                                bottomBounds.x = lp.cx; bottomBounds.width = 0;
                                bottomBounds.y = lp.cy; bottomBounds.height = CELL_HEIGHT;
                            }

                            let dyBottom = (lp.cy + CELL_HEIGHT / 2) - bottomBounds.y;
                            this.offsetLayout_(layoutItem.bottomChildren, dyBottom)
                            bottomBounds.offset(0, dyBottom);
                            bounds.accumulate(bottomBounds);

                            lp.cx = Math.max(lp.cx, topCx) + CELL_WIDTH;
                            lp.cy = y0;

                            layoutItem.bounds.width = lp.cx - layoutItem.bounds.x;
                            bounds.accumulate(layoutItem.bounds);

                            if (layoutItem.topChildren.length === 0) {
                                layoutItem.topConnectorY = bounds.y + CELL_HEIGHT / 2;
                            } else {
                                layoutItem.topConnectorY = layoutItem.topChildren[0].bounds.y + CELL_HEIGHT / 2;
                            }
                            if (layoutItem.bottomChildren.length === 0) {
                                layoutItem.bottomConnectorY = bounds.y + bounds.height - CELL_HEIGHT / 2;
                            } else {
                                layoutItem.bottomConnectorY = layoutItem.bottomChildren[0].bounds.y + CELL_HEIGHT / 2;
                            }
                        } else {
                            layoutItem.bounds.x = lp.cx;
                            layoutItem.bounds.y = lp.cy;
                            lp.cx += CELL_WIDTH;
                            layoutItem.bounds.width = CELL_WIDTH;
                            layoutItem.bounds.height = CELL_HEIGHT;
                            bounds.accumulate(layoutItem.bounds);

                        }
                    }
                    return bounds;
                }
                doLayout(layoutItems: PedalLayout[]): LayoutSize {
                    const TWO_ROW_HEIGHT = 142 - 14;

                    if (layoutItems.length === 0) {
                        // if the current pedalboard is empty, reserve display space anyway.
                        return { width: 1, height: TWO_ROW_HEIGHT };
                    }

                    let lp = new LayoutParams();

                    let bounds = this.doLayout2_(lp, layoutItems);
                    // shift everything down so there are no negative y coordinates.

                    if (bounds.height < TWO_ROW_HEIGHT) {

                        let extra = Math.floor((TWO_ROW_HEIGHT - Math.ceil(bounds.height)) / 2);
                        this.offsetLayout_(layoutItems, Math.floor(-bounds.y + extra / 2));
                        bounds.height += extra;

                    } else {
                        this.offsetLayout_(layoutItems, -bounds.y);
                    }

                    bounds.height += 14; // for labels that aren't accounted for.
                    return { width: bounds.width, height: bounds.height };

                }

                onItemClick(e: SyntheticEvent, instanceId?: number): void {
                    if (instanceId) {
                        this.setSelection(instanceId);
                    }
                }
                setSelection(instanceId: number) {
                    if (this.props.onSelectionChanged) {
                        this.props.onSelectionChanged(instanceId);
                    }
                }

                onItemDoubleClick(event: SyntheticEvent, instanceId?: number): void {
                    event.preventDefault();
                    event.stopPropagation();

                    if (this.props.onDoubleClick && instanceId && this.props.enableStructureEditing) {
                        this.props.onDoubleClick(instanceId);
                    }

                }

                openItemContextMenu(instanceId: number, clientX: number, clientY: number): void {
                    if (!this.props.enableStructureEditing || instanceId < 0) {
                        this.setSelection(instanceId);
                        return;
                    }
                    this.setSelection(instanceId);
                    this.setState({
                        contextMenu: {
                            mouseX: clientX + 2,
                            mouseY: clientY - 6,
                            instanceId: instanceId,
                        }
                    });
                }

                onItemLongClick(event: React.MouseEvent, instanceId?: number): void {
                    if (!instanceId) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();

                    this.openItemContextMenu(instanceId, event.clientX, event.clientY);
                }

                closeItemContextMenu(): void {
                    this.setState({ contextMenu: null });
                }

                copyContextMenuItem(): void {
                    let contextMenu = this.state.contextMenu;
                    this.closeItemContextMenu();
                    if (!contextMenu) return;

                    let item = this.model.pedalboard.get().maybeGetItem(contextMenu.instanceId);
                    if (item && !item.isEmpty()) {
                        copyPedalboardItem(item);
                    }
                }

                pasteContextMenuItem(): void {
                    let contextMenu = this.state.contextMenu;
                    let clipboardItem = getPedalboardClipboardItem();
                    this.closeItemContextMenu();
                    if (!contextMenu || !clipboardItem) return;

                    let newId = this.model.insertPedalboardItemCopy(
                        contextMenu.instanceId,
                        clipboardItem,
                        true
                    );
                    this.setSelection(newId);
                }

                duplicateContextMenuItem(): void {
                    let contextMenu = this.state.contextMenu;
                    this.closeItemContextMenu();
                    if (!contextMenu) return;

                    let newId = this.model.duplicatePedalboardItem(contextMenu.instanceId);
                    this.setSelection(newId);
                }

                deleteContextMenuItem(): void {
                    let contextMenu = this.state.contextMenu;
                    this.closeItemContextMenu();
                    if (!contextMenu) return;

                    let newId = this.model.deletePedalboardPedal(contextMenu.instanceId);
                    if (newId !== null) {
                        this.setSelection(newId);
                    }
                }

                strokeConnector(output: ReactNode[], channels: number, enabled: boolean, svgPath: string) {
                    let color = enabled ? ENABLED_CONNECTOR_COLOR : DISABLED_CONNECTOR_COLOR;

                    if (channels === 2) {
                        output.push((
                            <path key={this.renderKey++} d={svgPath} stroke={color} strokeWidth={SVG_STEREO_STROKE_WIDTH} />
                        ));
                        output.push((
                            <path key={this.renderKey++} d={svgPath} stroke={this.bgColor} strokeWidth={SVG_STROKE_WIDTH} />
                        ));
                    } else if (channels === 1) {
                        output.push((
                            <path key={this.renderKey++} d={svgPath} stroke={color} strokeWidth={SVG_STROKE_WIDTH} />
                        ));
                    }
                }

                renderConnector(output: ReactNode[], item: PedalLayout, enabled: boolean): void {
                    // const classes = withStyles.getClasses(this.props);
                    let x_ = item.bounds.x + CELL_WIDTH / 2;
                    let y_ = item.bounds.y + CELL_HEIGHT / 2;
                    let numberOfOutputs = item.numberOfOutputs;
                    let color = enabled ? ENABLED_CONNECTOR_COLOR : DISABLED_CONNECTOR_COLOR;
                    let stereoCenterColor = this.bgColor;

                    if (item.originalInputs === 0) {
                        // break the input paths.
                        let rx = item.bounds.x + CELL_WIDTH / 2 - FRAME_SIZE / 2 - 4;
                        let ry = y_ - 4;

                        output.push((
                            <rect key={this.renderKey++} x={rx} y={ry} width={4} height={8} fill={this.props.theme.palette.background.paper} />
                        ));
                    }
                    let svgPath = new SvgPathBuilder().moveTo(x_, y_).lineTo(x_ + CELL_WIDTH, y_).toString();


                    if (numberOfOutputs === 2) {
                        output.push((
                            <path key={this.renderKey++} d={svgPath} stroke={color} strokeWidth={SVG_STEREO_STROKE_WIDTH} />
                        ));
                        output.push((
                            <path key={this.renderKey++} d={svgPath} stroke={stereoCenterColor} strokeWidth={SVG_STROKE_WIDTH} />
                        ));
                    } else if (numberOfOutputs === 1) {
                        output.push((
                            <path key={this.renderKey++} d={svgPath} stroke={color} strokeWidth={SVG_STROKE_WIDTH} />
                        ));
                    } else {
                        output.push((
                            <path key={this.renderKey++} d={svgPath} stroke={DISABLED_CONNECTOR_COLOR} strokeWidth={SVG_STROKE_WIDTH} />
                        ));

                    }
                }
                renderSplitConnectors(output: ReactNode[], item: PedalLayout, enabled: boolean, shortSplitOutput: boolean,): void {
                    //const classes = withStyles.getClasses(this.props);
                    let x_ = item.bounds.x + CELL_WIDTH / 2;
                    let y_ = item.bounds.y + CELL_HEIGHT / 2;
                    let yTop = item.topConnectorY;
                    let yBottom = item.bottomConnectorY;
                    //let isStereo = item.stereoOutput;
                    let split = item.pedalItem as PedalboardSplitItem;

                    let topEnabled = enabled && split.isASelected();
                    let bottomEnabled = enabled && split.isBSelected();
                    let topColor = topEnabled ? ENABLED_CONNECTOR_COLOR : DISABLED_CONNECTOR_COLOR;
                    let bottomColor = bottomEnabled ? ENABLED_CONNECTOR_COLOR : DISABLED_CONNECTOR_COLOR;


                    let topStartPath = new SvgPathBuilder().moveTo(x_, y_).lineTo(x_, yTop).lineTo(x_ + CELL_WIDTH, yTop).toString();
                    let bottomStartPath = new SvgPathBuilder().moveTo(x_, y_).lineTo(x_, yBottom).lineTo(x_ + CELL_WIDTH, yBottom).toString();

                    if (item.numberOfInputs === 2 && item.topChildren[0].numberOfInputs === 2) {
                        output.push((<path key={this.renderKey++} d={topStartPath} stroke={topColor} strokeWidth={SVG_STEREO_STROKE_WIDTH} />));
                        output.push((<path key={this.renderKey++} d={topStartPath} stroke={this.bgColor} strokeWidth={SVG_STROKE_WIDTH} />));
                    } else if (item.numberOfInputs !== 0 && item.topChildren[0].numberOfInputs !== 0) {
                        output.push((<path key={this.renderKey++} d={topStartPath} stroke={topColor} strokeWidth={SVG_STROKE_WIDTH} />));
                    }

                    if (item.numberOfInputs === 2 && item.bottomChildren[0].numberOfInputs === 2) {
                        output.push((<path key={this.renderKey++} d={bottomStartPath} stroke={bottomColor} strokeWidth={SVG_STEREO_STROKE_WIDTH} />));
                        output.push((<path key={this.renderKey++} d={bottomStartPath} stroke={this.bgColor} strokeWidth={SVG_STROKE_WIDTH} />));

                    } else if (item.numberOfInputs !== 0 && item.bottomChildren[0].numberOfInputs !== 0) {
                        output.push((<path key={this.renderKey++} d={bottomStartPath} stroke={bottomColor} strokeWidth={SVG_STROKE_WIDTH} />));
                    }

                    let lastTop = item.topChildren[item.topChildren.length - 1];
                    let lastBottom = item.bottomChildren[item.bottomChildren.length - 1];

                    let xTop = lastTop.bounds.right - CELL_WIDTH / 2;
                    let xBottom = lastBottom.bounds.right - CELL_WIDTH / 2;

                    let xEnd = shortSplitOutput ? item.bounds.right : item.bounds.right + CELL_WIDTH / 2;
                    let xTee0 = item.bounds.right - CELL_WIDTH / 2;

                    let firstPath: string;  // top or bottom depending on draw order.
                    let secondPath: string;  // top or bottom depending on draw order.

                    let firstPathStereo: boolean;
                    let secondPathStereo: boolean;
                    let firstPathAbsent: boolean;
                    let secondPathAbsent: boolean;
                    let firstPathEnabled: boolean;
                    let secondPathEnabled: boolean;
                    let xTee: number;

                    let monoAdjustment = (STEREO_STROKE_WIDTH - STROKE_WIDTH) / 2;

                    let bottomPathFirst = topEnabled && !bottomEnabled;
                    let topPathFirst = bottomEnabled && !topEnabled;


                    // Third case: L/R stereo output, when both outputs are mono, requires a third stroke.
                    let thirdPath: string | null = null; // for L/R stereo output (which can be stereo even if both outputs are mono)
                    let hasThirdPath = item.numberOfOutputs === 2 && (lastTop.numberOfOutputs !== 2) && (lastBottom.numberOfOutputs !== 2);

                    if (hasThirdPath) {
                        firstPathStereo = false;
                        secondPathStereo = false;
                        firstPathAbsent = lastTop.numberOfOutputs === 0 || item.numberOfOutputs === 0;
                        secondPathAbsent = lastBottom.numberOfOutputs === 0 || item.numberOfOutputs === 0;
                        xTee = xTee0 - monoAdjustment;
                        firstPath = new SvgPathBuilder().moveTo(xBottom, yBottom).lineTo(xTee, yBottom).lineTo(xTee, y_).toString();

                        secondPath = new SvgPathBuilder().moveTo(xTop, yTop).lineTo(xTee, yTop).lineTo(xTee, y_).toString();

                        hasThirdPath = true;
                        thirdPath = new SvgPathBuilder().moveTo(xTee0, y_).lineTo(xEnd, y_).toString();
                        firstPathEnabled = bottomEnabled;
                        secondPathEnabled = topEnabled;
                    } else if (bottomPathFirst || (topEnabled && lastTop.numberOfOutputs === 2)) {
                        // draw the bottom path first.
                        firstPathStereo = item.numberOfOutputs === 2 && lastBottom.numberOfOutputs === 2;
                        secondPathStereo = item.numberOfOutputs === 2 && lastTop.numberOfOutputs === 2;
                        firstPathAbsent = item.numberOfOutputs === 0 || lastBottom.numberOfOutputs === 0;
                        secondPathAbsent = item.numberOfOutputs === 0 || lastTop.numberOfOutputs === 0;

                        xTee = firstPathStereo ? xTee0 : xTee0 - monoAdjustment;
                        firstPath = new SvgPathBuilder().moveTo(xBottom, yBottom).lineTo(xTee, yBottom).lineTo(xTee, y_).toString();
                        xTee = secondPathStereo ? xTee0 : xTee0 - monoAdjustment;

                        secondPath = new SvgPathBuilder().moveTo(xTop, yTop).lineTo(xTee, yTop).lineTo(xTee, y_).lineTo(xEnd, y_).toString();
                        firstPathEnabled = bottomEnabled;
                        secondPathEnabled = topEnabled;
                    } else {
                        // draw the top path first.
                        firstPathStereo = item.numberOfOutputs === 2 && lastTop.numberOfOutputs === 2;
                        secondPathStereo = item.numberOfOutputs === 2 && lastBottom.numberOfOutputs === 2;
                        firstPathAbsent = item.numberOfOutputs === 0 || lastTop.numberOfOutputs === 0;
                        secondPathAbsent = item.numberOfOutputs === 0 || lastBottom.numberOfOutputs === 0;

                        xTee = firstPathStereo ? xTee0 : xTee0 - monoAdjustment;
                        firstPath = new SvgPathBuilder().moveTo(xTop, yTop).lineTo(xTee, yTop).lineTo(xTee, y_).toString();

                        xTee = secondPathStereo ? xTee0 : xTee0 - monoAdjustment;
                        secondPath = new SvgPathBuilder().moveTo(xBottom, yBottom).lineTo(xTee, yBottom).lineTo(xTee, y_).lineTo(xEnd, y_).toString();

                        firstPathEnabled = topEnabled;
                        secondPathEnabled = bottomEnabled;
                    }
                    let firstPathColor = firstPathEnabled ? ENABLED_CONNECTOR_COLOR : DISABLED_CONNECTOR_COLOR;
                    let secondPathColor = secondPathEnabled ? ENABLED_CONNECTOR_COLOR : DISABLED_CONNECTOR_COLOR;

                    if (bottomPathFirst || topPathFirst) {
                        // display stereo strokes with cutoff line.
                        if (firstPathStereo) {
                            output.push((
                                <path key={this.renderKey++} d={firstPath} stroke={firstPathColor} strokeWidth={SVG_STEREO_STROKE_WIDTH} />
                            ));
                            output.push((
                                <path key={this.renderKey++} d={firstPath} stroke={this.bgColor} strokeWidth={SVG_STROKE_WIDTH} />
                            ));
                        } else if (!firstPathAbsent) {
                            output.push((
                                <path key={this.renderKey++} d={firstPath} stroke={firstPathColor} strokeWidth={SVG_STROKE_WIDTH} />
                            ));
                        }
                        if (secondPathStereo) {
                            output.push((
                                <path key={this.renderKey++} d={secondPath} stroke={secondPathColor} strokeWidth={SVG_STEREO_STROKE_WIDTH} />
                            ));
                            output.push((
                                <path key={this.renderKey++} d={secondPath} stroke={this.bgColor} strokeWidth={SVG_STROKE_WIDTH} />
                            ));
                        } else if (!secondPathAbsent) {
                            output.push((
                                <path key={this.renderKey++} d={secondPath} stroke={secondPathColor} strokeWidth={SVG_STROKE_WIDTH} />
                            ));
                        }

                    } else {
                        // stereo strokes merge.
                        if (firstPathStereo) {
                            output.push((
                                <path key={this.renderKey++} d={firstPath} stroke={firstPathColor} strokeWidth={SVG_STEREO_STROKE_WIDTH} />
                            ));
                        } else if (!firstPathAbsent) {
                            output.push((
                                <path key={this.renderKey++} d={firstPath} stroke={firstPathColor} strokeWidth={SVG_STROKE_WIDTH} />
                            ));
                        }
                        if (secondPathStereo) {
                            output.push((
                                <path key={this.renderKey++} d={secondPath} stroke={secondPathColor} strokeWidth={SVG_STEREO_STROKE_WIDTH} />
                            ));
                        } else if (!secondPathAbsent) {
                            output.push((
                                <path key={this.renderKey++} d={secondPath} stroke={secondPathColor} strokeWidth={SVG_STROKE_WIDTH} />
                            ));
                        }

                        // draw stereo inner lines.
                        if (firstPathStereo) {
                            output.push((
                                <path key={this.renderKey++} d={firstPath} stroke={this.bgColor} strokeWidth={SVG_STROKE_WIDTH} />
                            ));
                        }
                        if (secondPathStereo) {
                            output.push((
                                <path key={this.renderKey++} d={secondPath} stroke={this.bgColor} strokeWidth={SVG_STROKE_WIDTH} />
                            ));

                        }
                    }
                    if (thirdPath != null) {
                        // stereo output of L/R splitter
                        output.push((
                            <path key={this.renderKey++} d={thirdPath} stroke={secondPathColor} strokeWidth={SVG_STEREO_STROKE_WIDTH} />
                        ));
                        output.push((
                            <path key={this.renderKey++} d={thirdPath} stroke={this.bgColor} strokeWidth={SVG_STROKE_WIDTH} />
                        ));


                    }
                }
                getScrollContainer() {
                    let el: HTMLElement | undefined | null = this.scrollRef.current;
                    // actually not here anymore. :-/ It has a reactive definition in MainPage.tsx now.
                    while (el) {
                        if (el.id === "pedalboardScroll") {
                            return el as HTMLDivElement;
                        }
                        el = el.parentElement;
                    }
                    throw new PiPedalStateError("scroll container not found.");
                }

                pedalButton(
                    instanceId: number,
                    iconType: PluginType,
                    iconColor: string,
                    draggable: boolean,
                    enabled: boolean,
                    hasBorder: boolean = true,
                    pluginNotFound: boolean,
                    hasMidiConnector: boolean
                )
                    : ReactNode {
                    const classes = withStyles.getClasses(this.props);
                    let frameStyle = classes.iconFrame;
                    if (!hasBorder) {
                        frameStyle = classes.borderlessIconFrame;
                    } else {
                        if (instanceId === this.props.selectedId) {
                            frameStyle = classes.selectedIconFrame;
                        }
                    }

                    return (
                        <div style={{ width: "100%", height: "100%" }}>
                            <ButtonBase className={classes.pedalButton} 
                                onClick={(e) => { this.onItemClick(e, instanceId); }}
                                onDoubleClick={(e: SyntheticEvent) => { this.onItemDoubleClick(e, instanceId); }}
                                onContextMenu={(e: React.MouseEvent) => { this.onItemLongClick(e, instanceId); }}
                            >
                                <div className={frameStyle} style={{ position: "absolute" }} onContextMenu={(e) => { e.preventDefault(); }}
                                >
                                    <SelectHoverBackground selected={instanceId === this.props.selectedId} showHover={true}
                                        clipChildren={false}
                                    >
                                    </SelectHoverBackground>
                                </div>
                                <Draggable draggable={draggable && (this.props.enableStructureEditing)} getScrollContainer={() => this.getScrollContainer()}
                                    onDragEnd={(x, y) => { this.onDragEnd(instanceId, x, y) }}
                                    onLongPress={(x, y) => { this.openItemContextMenu(instanceId, x, y); }}
                                    style={{ opacity: enabled ? 0.99 : 0.3 }}

                                >
                                    <div id="childIcon" style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }} >
                                        <PluginIcon pluginType={iconType}
                                            size={24}
                                            color={getIconColor(iconColor)}
                                            pluginMissing={pluginNotFound}
                                        />
                                    </div>

                                </Draggable>
                            </ButtonBase>

                        </div>
                    );

                }
                renderConnectors(output: ReactNode[], layoutChain: PedalLayout[], enabled: boolean, shortSplitOutput: boolean): void {
                    let length = layoutChain.length - 1;
                    if (layoutChain.length > 0 && layoutChain[layoutChain.length - 1].isSplitter()) {
                        ++length;
                    }
                    for (let i = 0; i < length; ++i) {
                        let item = layoutChain[i];
                        if (item.isSplitter()) {
                            let splitter = item.pedalItem as PedalboardSplitItem;
                            this.renderSplitConnectors(output, item, enabled, i === length - 1 && shortSplitOutput,);
                            this.renderConnectors(output, item.topChildren, enabled && splitter.isASelected(), false);
                            this.renderConnectors(output, item.bottomChildren, enabled && splitter.isBSelected(), false);

                        } else if (item.uri !== END_PEDALBOARD_ITEM_URI) {
                            this.renderConnector(output, item, enabled);

                        }
                    }
                }
                renderConnectorFrame(layoutChain: PedalLayout[], layoutSize: LayoutSize): ReactNode {
                    let outputs: ReactNode[] = [];
                    this.renderConnectors(outputs, layoutChain, true, false);
                    return (
                        <div key="connectors" style={{ width: layoutSize.width, height: layoutSize.height, overflow: "hidden" }}>
                            <svg width={layoutSize.width} height={layoutSize.height}
                                xmlns="http://www.w3.org/2000/svg" viewBox={"0 0 " + layoutSize.width + " " + layoutSize.height}>
                                <g fill="none">
                                    {
                                        outputs
                                    }
                                </g>

                            </svg>
                        </div>
                    );

                }

                renderChain(layoutChain: PedalLayout[], layoutSize: LayoutSize): ReactNode {

                    const classes = withStyles.getClasses(this.props);

                    let result: ReactNode[] = [];

                    result.push(this.renderConnectorFrame(layoutChain, layoutSize));

                    let it = chainIterator(layoutChain);
                    while (true) {
                        let v = it.next();
                        if (v.done) break;
                        let item = v.value;
                        switch (item.uri) {
                            case START_PEDALBOARD_ITEM_URI:
                                result.push(<div key={this.renderKey++} className={classes.splitItem} style={{ left: item.bounds.x, top: item.bounds.y, width: item.bounds.width }} >
                                    <div className={classes.splitStart} >

                                        {this.pedalButton(item.terminalInstanceId, item.pluginType, item.iconColor, false, true, false, false, false)}
                                    </div>
                                </div>);
                                break;
                            case END_PEDALBOARD_ITEM_URI:
                                result.push(<div key={this.renderKey++} className={classes.splitItem} style={{ left: item.bounds.x, top: item.bounds.y, width: item.bounds.width }} >
                                    <div className={classes.splitStart} >

                                        {this.pedalButton(item.terminalInstanceId, item.pluginType, "", false, true, false, false, false)}
                                    </div>
                                </div>);
                                break;
                            default:
                                if (item.isSplitter()) {

                                    result.push(<div key={this.renderKey++} className={classes.splitItem} style={{ left: item.bounds.x, top: item.bounds.y, width: item.bounds.width }} >
                                        <div className={classes.splitStart} >
                                            {this.pedalButton(item.pedalItem?.instanceId ?? -1, this.getSplitterIcon(item), "", true, true, true, false, false)}
                                        </div>
                                    </div>);

                                } else {
                                    result.push(
                                        <div key={this.renderKey++} style={{
                                            display: "flex", justifyContent: "flex-start", alignItems: "flex-start",
                                            position: "absolute", left: item.bounds.x, width: CELL_WIDTH, top: item.bounds.bottom - 12, paddingLeft: 2, paddingRight: 2
                                        }}>
                                            <Typography variant="caption" display="block" noWrap={true}
                                                style={{
                                                    width: CELL_WIDTH - 4, textAlign: "center", flex: "0 1 auto",
                                                    opacity: item.pedalItem?.isEnabled ?? true ? 1.0 : 0.4
                                                }}
                                            >{item.name}</Typography>
                                        </div>
                                    )
                                    let uiPlugin = this.model.getUiPlugin(item.pedalItem?.uri ?? "");
                                    let pluginMissing = uiPlugin === null;
                                    let pluginType = item.pluginType;
                                    if (uiPlugin && uiPlugin.uri === "http://two-play.com/plugins/toob-nam") {
                                        pluginType = PluginType.NamPlugin;

                                    }

                                    result.push(<div key={this.renderKey++} className={classes.pedalItem} style={{ left: item.bounds.x, top: item.bounds.y }} >
                                        {this.pedalButton(
                                            item.pedalItem?.instanceId ?? -1,
                                            pluginType,
                                            item.pedalItem?.iconColor ?? "",
                                            !item.isEmpty(),
                                            item.pedalItem?.isEnabled ?? false,
                                            true,
                                            pluginMissing,
                                            uiPlugin ? ((uiPlugin.has_midi_input !== 0) || (uiPlugin.has_midi_output !== 0)) : false)}

                                    </div>);

                                }
                                break;
                        }

                    }
                    return result;
                }

                canInputStero(item: PedalLayout): boolean {
                    if (item.pedalItem) {
                        let plugin = this.model.getUiPlugin(item.pedalItem.uri);
                        if (plugin) {
                            return plugin.audio_inputs === 2;
                        }
                    }
                    return true;
                }
                getNumberOfInputs(item: PedalLayout): number {
                    if (item.pedalItem) {
                        let plugin = this.model.getUiPlugin(item.pedalItem.uri);
                        if (plugin) {
                            return plugin.audio_inputs;
                        }
                    }
                    return 1;
                }
                getNumberOfOutputs(item: PedalLayout): number {
                    if (item.pedalItem) {
                        let plugin = this.model.getUiPlugin(item.pedalItem.uri);
                        if (plugin) {
                            return plugin.audio_outputs;
                        }
                    }
                    return 1;
                }

                markStereoOutputs(layoutChain: PedalLayout[], numberOfInputs: number, numberOfOutputs: number) {
                    // analyze forward flow.
                    this.markStereoForward(layoutChain, numberOfInputs);
                    // mark items that feed a mono effect as mono.
                    this.markStereoBackward(layoutChain, numberOfOutputs);
                }

                markStereoBackward(layoutChain: PedalLayout[], numberOfOutputs: number): number {
                    for (let i = layoutChain.length - 1; i >= 0; --i) {
                        let item = layoutChain[i];
                        if (item.isSplitter()) {
                            item.numberOfOutputs = CalculateConnection(item.numberOfOutputs, numberOfOutputs)

                            this.markStereoBackward(item.topChildren, numberOfOutputs);
                            this.markStereoBackward(item.bottomChildren, numberOfOutputs);
                            let topInputs = item.topChildren[0].numberOfInputs;
                            let bottomInputs = item.bottomChildren[0].numberOfInputs;

                            let splitItem = item.pedalItem as PedalboardSplitItem;
                            if (splitItem.getSplitType() !== SplitType.Lr) {
                                item.numberOfInputs = CalculateConnection(item.numberOfInputs, Math.max(topInputs, bottomInputs));
                            }
                        } else if (item.isEnd()) {

                        } else if (item.isStart()) {
                            item.numberOfOutputs = CalculateConnection(item.numberOfOutputs, numberOfOutputs);
                            return item.numberOfOutputs;

                        } else if (item.isEmpty()) {
                            if (numberOfOutputs === 0) {
                                item.numberOfOutputs = 0;
                                item.numberOfInputs = CalculateConnection(item.numberOfInputs, 2);
                            } else {
                                item.numberOfOutputs = CalculateConnection(item.numberOfOutputs, numberOfOutputs);
                                item.numberOfInputs = CalculateConnection(item.numberOfInputs, numberOfOutputs);
                            }
                        } else {
                            item.numberOfOutputs = CalculateConnection(item.numberOfOutputs, numberOfOutputs);
                        }
                        numberOfOutputs = item.numberOfInputs;
                    }
                    return numberOfOutputs;
                }
                markStereoForward(layoutChain: PedalLayout[], numberOfInputs: number): number {
                    if (layoutChain.length === 0) {
                        return numberOfInputs;
                    }
                    for (let i = 0; i < layoutChain.length; ++i) {
                        let item = layoutChain[i];
                        if (item.isSplitter()) {
                            let splitter = item.pedalItem as PedalboardSplitItem;
                            item.numberOfInputs = numberOfInputs;

                            let chainInputs = numberOfInputs;
                            if (splitter.getSplitType() === SplitType.Lr) {
                                chainInputs = CalculateConnection(numberOfInputs, 1);
                            }
                            let topOutputs = this.markStereoForward(item.topChildren, chainInputs);
                            let bottomOutputs = this.markStereoForward(item.bottomChildren, chainInputs);


                            if (splitter.getSplitType() === SplitType.Ab) {
                                if (splitter.isASelected()) {
                                    item.numberOfOutputs = topOutputs;
                                } else {
                                    item.numberOfOutputs = bottomOutputs;
                                }
                            } else {
                                item.numberOfOutputs = (topOutputs >= 1 || bottomOutputs >= 1) ? 2 : 1;
                            }
                        } else if (item.isStart()) {
                            item.numberOfOutputs = Math.min(item.originalOutputs, 2);
                        } else if (item.isEnd()) {
                            item.numberOfInputs =
                                CalculateConnection(
                                    Math.min(PiPedalModelFactory.getInstance().jackSettings.get().outputAudioPorts.length, 2),
                                    numberOfInputs);
                            return item.numberOfInputs;
                        } else if (item.isEmpty()) {
                            item.numberOfInputs = numberOfInputs;
                            if (numberOfInputs === 0) {
                                item.numberOfOutputs = 2;
                            } else {
                                item.numberOfOutputs = item.numberOfInputs;
                            }
                        } else {
                            if (item.numberOfInputs === 0) // zero-input plugins merge their output with the input.
                            {
                                item.numberOfInputs = numberOfInputs;
                                item.numberOfOutputs = Math.max(item.numberOfOutputs, numberOfInputs);
                            } else {
                                item.numberOfInputs = CalculateConnection(numberOfInputs, this.getNumberOfInputs(item));
                                item.numberOfOutputs = this.getNumberOfOutputs(item);
                            }
                        }
                        numberOfInputs = item.numberOfOutputs;
                    }
                    return numberOfInputs;
                }

                currentLayout?: PedalLayout[];
                private renderKey: number = 0;
                render() {
                    const classes = withStyles.getClasses(this.props);
                    this.renderKey = 0;
                    let pedalboard = this.state.pedalboard;
                    let layoutChain = makeChain(this.model, pedalboard?.items);
                    if (layoutChain.length !== 0) {
                        layoutChain.splice(0, 0, PedalLayout.Start());
                        layoutChain.splice(layoutChain.length, 0, PedalLayout.End());
                        this.markStereoOutputs(layoutChain, 2, 2);
                    }

                    let layoutSize = this.doLayout(layoutChain);
                    this.offsetLayout_(layoutChain, PATH_HEADER_HEIGHT);
                    layoutSize.height += PATH_HEADER_HEIGHT;

                    let pathBLayout: PedalLayout[] = [];
                    let pathBSize: LayoutSize = { width: 0, height: 0 };
                    if (pedalboard?.pathBEnabled) {
                        pathBLayout = makeChain(this.model, pedalboard.pathBItems);
                        let pathBInputs = Math.max(1, Math.min(2, pedalboard.pathBInputChannels.length));
                        if (pathBLayout.length !== 0) {
                            pathBLayout.splice(
                                0,
                                0,
                                PedalLayout.Start(Pedalboard.AUX_START_CONTROL_ID, pathBInputs));
                            pathBLayout.splice(
                                pathBLayout.length,
                                0,
                                PedalLayout.End(Pedalboard.AUX_END_CONTROL_ID, 2));
                            this.markStereoOutputs(pathBLayout, pathBInputs, 2);
                        }
                        pathBSize = this.doLayout(pathBLayout);
                        this.offsetLayout_(
                            pathBLayout,
                            layoutSize.height + PATH_GAP + PATH_HEADER_HEIGHT);
                        pathBSize.height += PATH_HEADER_HEIGHT;
                    }

                    let additionalPathLayouts: {
                        id: "C" | "D";
                        name: string;
                        inputChannels: number[];
                        outputChannels: number[];
                        mute: boolean;
                        pan: number;
                        layout: PedalLayout[];
                        size: LayoutSize;
                        top: number;
                        startId: number;
                        endId: number;
                    }[] = [];
                    let nextPathTop = layoutSize.height +
                        (pathBLayout.length === 0 ? 0 : PATH_GAP + pathBSize.height);
                    for (const path of pedalboard?.additionalPaths ?? []) {
                        if (!path.enabled || (path.id !== "C" && path.id !== "D")) continue;
                        const id = path.id as "C" | "D";
                        const pathLayout = makeChain(this.model, path.items);
                        const inputCount = Math.max(1, Math.min(2, path.inputChannels.length));
                        const startId = id === "C"
                            ? Pedalboard.PATH_C_START_CONTROL_ID
                            : Pedalboard.PATH_D_START_CONTROL_ID;
                        const endId = id === "C"
                            ? Pedalboard.PATH_C_END_CONTROL_ID
                            : Pedalboard.PATH_D_END_CONTROL_ID;
                        if (pathLayout.length !== 0) {
                            pathLayout.splice(0, 0, PedalLayout.Start(startId, inputCount));
                            pathLayout.push(PedalLayout.End(endId, 2));
                            this.markStereoOutputs(pathLayout, inputCount, 2);
                        }
                        const pathSize = this.doLayout(pathLayout);
                        const top = nextPathTop + PATH_GAP;
                        this.offsetLayout_(pathLayout, top + PATH_HEADER_HEIGHT);
                        pathSize.height += PATH_HEADER_HEIGHT;
                        additionalPathLayouts.push({
                            id,
                            name: path.name,
                            inputChannels: path.inputChannels,
                            outputChannels: path.outputChannels,
                            mute: path.mute,
                            pan: path.pan,
                            layout: pathLayout,
                            size: pathSize,
                            top,
                            startId,
                            endId,
                        });
                        nextPathTop = top + pathSize.height;
                    }

                    this.currentLayout = layoutChain
                        .concat(pathBLayout)
                        .concat(...additionalPathLayouts.map((path) => path.layout));
                    let frameWidth = Math.max(
                        840,
                        layoutSize.width,
                        pathBSize.width,
                        ...additionalPathLayouts.map((path) => path.size.width));
                    let frameHeight = nextPathTop;
                    let inputPorts = this.model.jackConfiguration.get().inputAudioPorts;
                    let outputPorts = this.model.jackConfiguration.get().outputAudioPorts;
                    let pathAInput = pedalboard?.pathAInputChannels[0]
                        ?? this.model.channelRouterSettings.get().mainInputChannels[0]
                        ?? 0;
                    if (pathAInput < 0 || pathAInput >= inputPorts.length) {
                        pathAInput = 0;
                    }
                    let pathBInput = pedalboard?.pathBInputChannels[0] ?? 0;
                    const enabledAdditionalPathIds = new Set(
                        (pedalboard?.additionalPaths ?? [])
                            .filter((path) => path.enabled)
                            .map((path) => path.id));
                    const nextAdditionalPathId = !enabledAdditionalPathIds.has("C")
                        ? "C"
                        : (!enabledAdditionalPathIds.has("D") ? "D" : null);
                    const outputPortName = (index: number): string => {
                        const rawName = outputPorts[index] ?? "";
                        if (!rawName || /playback[_:-]?\d+$/i.test(rawName)) {
                            return `OUT ${index + 1}`;
                        }
                        const separator = Math.max(
                            rawName.lastIndexOf("::"),
                            rawName.lastIndexOf(":"));
                        return separator >= 0
                            ? rawName.substring(separator + (rawName[separator + 1] === ":" ? 2 : 1))
                            : rawName;
                    };
                    const outputSelectionValue = (channels: number[]): string => {
                        if (channels.length === 0) return "main";
                        if (channels.length === 1) return `mono:${channels[0]}`;
                        return `stereo:${channels[0]}:${channels[1]}`;
                    };
                    const setPathOutput = (
                        pathId: "A" | "B" | "C" | "D",
                        value: string
                    ) => {
                        if (value === "main") {
                            this.model.configurePathOutput(pathId, []);
                        } else {
                            const channels = value
                                .split(":")
                                .slice(1)
                                .map((part) => Number(part));
                            this.model.configurePathOutput(pathId, channels);
                        }
                    };
                    const pathOutputSelect = (
                        pathId: "A" | "B" | "C" | "D",
                        channels: number[]
                    ) => {
                        const selectedValue = outputSelectionValue(channels);
                        const knownValues = new Set<string>(["main"]);
                        outputPorts.forEach((_port, index) =>
                            knownValues.add(`mono:${index}`));
                        for (let index = 0; index + 1 < outputPorts.length; index += 2) {
                            knownValues.add(`stereo:${index}:${index + 1}`);
                        }
                        return (
                            <Select
                                size="small"
                                value={knownValues.has(selectedValue)
                                    ? selectedValue
                                    : "main"}
                                onChange={(event) =>
                                    setPathOutput(pathId, String(event.target.value))}
                                aria-label={`Path ${pathId} output`}
                                style={{ height: 28, minWidth: 132 }}
                            >
                                <MenuItem value="main">Main bus</MenuItem>
                                {Array.from(
                                    { length: Math.floor(outputPorts.length / 2) },
                                    (_, pairIndex) => pairIndex * 2
                                ).map((index) => (
                                    <MenuItem
                                        key={`stereo-${index}`}
                                        value={`stereo:${index}:${index + 1}`}
                                    >
                                        {outputPortName(index)} / {outputPortName(index + 1)}
                                    </MenuItem>
                                ))}
                                {outputPorts.map((_port, index) => (
                                    <MenuItem
                                        key={`mono-${index}`}
                                        value={`mono:${index}`}
                                    >
                                        {outputPortName(index)} mono
                                    </MenuItem>
                                ))}
                            </Select>
                        );
                    };
                    let contextMenuItem = this.state.contextMenu
                        ? this.state.pedalboard?.maybeGetItem(this.state.contextMenu.instanceId) ?? null
                        : null;
                    let canCopy = contextMenuItem !== null && !contextMenuItem.isEmpty();
                    let canDelete = contextMenuItem !== null
                        && (this.state.pedalboard?.canDeleteItem(contextMenuItem.instanceId) ?? false);

                    return (
                        <div className={classes.scrollContainer} ref={this.scrollRef}
                        >
                            <div className={classes.container} ref={this.frameRef}
                                style={{
                                    width: frameWidth, height: frameHeight,
                                }} >
                                <div className={classes.pathHeader} style={{ top: 0 }}>
                                    <Typography variant="subtitle2" style={{ minWidth: 54 }}>Path A</Typography>
                                    <Select
                                        size="small"
                                        value={pathAInput}
                                        onChange={(event) =>
                                            this.model.configurePathAInput(Number(event.target.value))}
                                        aria-label="Path A input"
                                        style={{ height: 28, minWidth: 82 }}
                                    >
                                        {inputPorts.map((_port, index) => (
                                            <MenuItem key={index} value={index}>IN {index + 1}</MenuItem>
                                        ))}
                                    </Select>
                                    {pathOutputSelect(
                                        "A",
                                        pedalboard?.pathAOutputChannels ?? [])}
                                    <Select
                                        size="small"
                                        value=""
                                        displayEmpty
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            if (value === "single" || value === "dual" || value === "guitar-vocal") {
                                                this.model.applyRoutingTemplate(value);
                                            }
                                        }}
                                        aria-label="Routing template"
                                        style={{ height: 28, minWidth: 116 }}
                                    >
                                        <MenuItem value="">Routing</MenuItem>
                                        <MenuItem value="single">Single input</MenuItem>
                                        <MenuItem value="dual">Dual inputs</MenuItem>
                                        <MenuItem value="guitar-vocal">Guitar + Vocal</MenuItem>
                                    </Select>
                                    <IconButton
                                        size="small"
                                        color={pedalboard?.pathAMute ? "primary" : "default"}
                                        title="Mute Path A"
                                        aria-label="Mute Path A"
                                        onClick={() => this.model.configurePathMix(
                                            "A", !pedalboard?.pathAMute, pedalboard?.pathAPan ?? 0)}
                                    >
                                        <VolumeOffIcon fontSize="small" />
                                    </IconButton>
                                    <Select
                                        size="small"
                                        value={pedalboard?.pathAPan ?? 0}
                                        onChange={(event) => this.model.configurePathMix(
                                            "A", pedalboard?.pathAMute ?? false, Number(event.target.value))}
                                        aria-label="Path A pan"
                                        style={{ height: 28, minWidth: 58 }}
                                    >
                                        <MenuItem value={-1}>L</MenuItem>
                                        <MenuItem value={0}>C</MenuItem>
                                        <MenuItem value={1}>R</MenuItem>
                                    </Select>
                                    <Button
                                        size="small"
                                        startIcon={<EqualizerIcon />}
                                        onClick={() => this.setState({ globalEqDialogOpen: true })}
                                    >
                                        Global EQ
                                    </Button>
                                    {(!pedalboard?.pathBEnabled || nextAdditionalPathId !== null) && (
                                        <Button
                                            size="small"
                                            startIcon={<AddIcon />}
                                            onClick={() => {
                                                if (!pedalboard?.pathBEnabled) {
                                                    this.model.configurePathB(true, 0, "Path B");
                                                } else if (nextAdditionalPathId !== null) {
                                                    this.model.configureAdditionalPath(
                                                        nextAdditionalPathId, true, 0);
                                                }
                                            }}
                                            style={{ marginLeft: "auto" }}
                                        >
                                            Add path
                                        </Button>
                                    )}
                                </div>
                                {this.renderChain(layoutChain, layoutSize)}
                                {pathBLayout.length !== 0 && (
                                    <>
                                        <div
                                            className={classes.pathHeader}
                                            style={{ top: layoutSize.height + PATH_GAP }}
                                        >
                                            <Typography variant="subtitle2" style={{ minWidth: 54 }}>Path B</Typography>
                                            <Select
                                                size="small"
                                                value={pathBInput}
                                                onChange={(event) =>
                                                    this.model.configurePathB(
                                                        true,
                                                        Number(event.target.value),
                                                        pedalboard?.pathBName)}
                                                aria-label="Path B input"
                                                style={{ height: 28, minWidth: 82 }}
                                            >
                                                {inputPorts.map((_port, index) => (
                                                    <MenuItem key={index} value={index}>IN {index + 1}</MenuItem>
                                                ))}
                                            </Select>
                                            {pathOutputSelect(
                                                "B",
                                                pedalboard?.pathBOutputChannels ?? [])}
                                            <Typography variant="caption" color="textSecondary">
                                                {pedalboard?.pathBName}
                                            </Typography>
                                            <IconButton
                                                size="small"
                                                color={pedalboard?.pathBMute ? "primary" : "default"}
                                                title="Mute Path B"
                                                aria-label="Mute Path B"
                                                onClick={() => this.model.configurePathMix(
                                                    "B", !pedalboard?.pathBMute, pedalboard?.pathBPan ?? 0)}
                                            >
                                                <VolumeOffIcon fontSize="small" />
                                            </IconButton>
                                            <Select
                                                size="small"
                                                value={pedalboard?.pathBPan ?? 0}
                                                onChange={(event) => this.model.configurePathMix(
                                                    "B", pedalboard?.pathBMute ?? false, Number(event.target.value))}
                                                aria-label="Path B pan"
                                                style={{ height: 28, minWidth: 58 }}
                                            >
                                                <MenuItem value={-1}>L</MenuItem>
                                                <MenuItem value={0}>C</MenuItem>
                                                <MenuItem value={1}>R</MenuItem>
                                            </Select>
                                            <IconButton
                                                size="small"
                                                title="Remove Path B"
                                                aria-label="Remove Path B"
                                                onClick={() => this.model.configurePathB(false)}
                                                style={{ marginLeft: "auto" }}
                                            >
                                                <CloseIcon fontSize="small" />
                                            </IconButton>
                                        </div>
                                        {this.renderChain(pathBLayout, {
                                            width: frameWidth,
                                            height: frameHeight,
                                        })}
                                    </>
                                )}
                                {additionalPathLayouts.map((path) => (
                                    <React.Fragment key={path.id}>
                                        <div
                                            className={classes.pathHeader}
                                            style={{ top: path.top }}
                                        >
                                            <Typography variant="subtitle2" style={{ minWidth: 54 }}>
                                                Path {path.id}
                                            </Typography>
                                            <Select
                                                size="small"
                                                value={path.inputChannels[0] ?? 0}
                                                onChange={(event) =>
                                                    this.model.configureAdditionalPath(
                                                        path.id,
                                                        true,
                                                        Number(event.target.value),
                                                        path.mute,
                                                        path.pan)}
                                                aria-label={`Path ${path.id} input`}
                                                style={{ height: 28, minWidth: 82 }}
                                            >
                                                {inputPorts.map((_port, index) => (
                                                    <MenuItem key={index} value={index}>
                                                        IN {index + 1}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                            {pathOutputSelect(
                                                path.id as "C" | "D",
                                                path.outputChannels)}
                                            <Typography variant="caption" color="textSecondary">
                                                {path.name}
                                            </Typography>
                                            <IconButton
                                                size="small"
                                                color={path.mute ? "primary" : "default"}
                                                title={`Mute Path ${path.id}`}
                                                aria-label={`Mute Path ${path.id}`}
                                                onClick={() => this.model.configureAdditionalPath(
                                                    path.id,
                                                    true,
                                                    path.inputChannels[0] ?? 0,
                                                    !path.mute,
                                                    path.pan)}
                                            >
                                                <VolumeOffIcon fontSize="small" />
                                            </IconButton>
                                            <Select
                                                size="small"
                                                value={path.pan}
                                                onChange={(event) => this.model.configureAdditionalPath(
                                                    path.id,
                                                    true,
                                                    path.inputChannels[0] ?? 0,
                                                    path.mute,
                                                    Number(event.target.value))}
                                                aria-label={`Path ${path.id} pan`}
                                                style={{ height: 28, minWidth: 58 }}
                                            >
                                                <MenuItem value={-1}>L</MenuItem>
                                                <MenuItem value={0}>C</MenuItem>
                                                <MenuItem value={1}>R</MenuItem>
                                            </Select>
                                            <IconButton
                                                size="small"
                                                title={`Remove Path ${path.id}`}
                                                aria-label={`Remove Path ${path.id}`}
                                                onClick={() => this.model.configureAdditionalPath(
                                                    path.id, false)}
                                                style={{ marginLeft: "auto" }}
                                            >
                                                <CloseIcon fontSize="small" />
                                            </IconButton>
                                        </div>
                                        {this.renderChain(path.layout, {
                                            width: frameWidth,
                                            height: frameHeight,
                                        })}
                                    </React.Fragment>
                                ))}
                            </div>
                            <Dialog
                                open={this.state.globalEqDialogOpen}
                                onClose={() => this.setState({ globalEqDialogOpen: false })}
                                maxWidth="sm"
                                fullWidth
                            >
                                <DialogTitle>Global EQ</DialogTitle>
                                <DialogContent
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        gap: 16,
                                        paddingTop: 8,
                                    }}
                                >
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={pedalboard?.globalEqEnabled ?? false}
                                                onChange={(event) => {
                                                    if (!pedalboard) return;
                                                    this.model.configureGlobalEq({
                                                        enabled: event.target.checked,
                                                        lowCutHz: pedalboard.globalEqLowCutHz,
                                                        lowGainDb: pedalboard.globalEqLowGainDb,
                                                        midGainDb: pedalboard.globalEqMidGainDb,
                                                        midFrequencyHz: pedalboard.globalEqMidFrequencyHz,
                                                        highGainDb: pedalboard.globalEqHighGainDb,
                                                        highCutHz: pedalboard.globalEqHighCutHz,
                                                    });
                                                }}
                                            />
                                        }
                                        label="Enabled"
                                        style={{ gridColumn: "1 / -1" }}
                                    />
                                    {[
                                        ["Low cut", "globalEqLowCutHz", "Hz"],
                                        ["Low shelf", "globalEqLowGainDb", "dB"],
                                        ["Mid gain", "globalEqMidGainDb", "dB"],
                                        ["Mid frequency", "globalEqMidFrequencyHz", "Hz"],
                                        ["High shelf", "globalEqHighGainDb", "dB"],
                                        ["High cut", "globalEqHighCutHz", "Hz"],
                                    ].map(([label, key, unit]) => (
                                        <TextField
                                            key={key}
                                            label={label}
                                            type="number"
                                            defaultValue={(pedalboard as any)?.[key] ?? 0}
                                            slotProps={{ input: { endAdornment: unit } }}
                                            onBlur={(event) => {
                                                if (!pedalboard) return;
                                                const value = Number(event.target.value);
                                                if (!Number.isFinite(value)) return;
                                                this.model.configureGlobalEq({
                                                    enabled: pedalboard.globalEqEnabled,
                                                    lowCutHz: key === "globalEqLowCutHz" ? value : pedalboard.globalEqLowCutHz,
                                                    lowGainDb: key === "globalEqLowGainDb" ? value : pedalboard.globalEqLowGainDb,
                                                    midGainDb: key === "globalEqMidGainDb" ? value : pedalboard.globalEqMidGainDb,
                                                    midFrequencyHz: key === "globalEqMidFrequencyHz" ? value : pedalboard.globalEqMidFrequencyHz,
                                                    highGainDb: key === "globalEqHighGainDb" ? value : pedalboard.globalEqHighGainDb,
                                                    highCutHz: key === "globalEqHighCutHz" ? value : pedalboard.globalEqHighCutHz,
                                                });
                                            }}
                                        />
                                    ))}
                                </DialogContent>
                                <DialogActions>
                                    <Button onClick={() => this.setState({ globalEqDialogOpen: false })}>
                                        Close
                                    </Button>
                                </DialogActions>
                            </Dialog>
                            <Menu
                                open={this.state.contextMenu !== null}
                                onClose={() => this.closeItemContextMenu()}
                                anchorReference="anchorPosition"
                                anchorPosition={this.state.contextMenu === null
                                    ? undefined
                                    : {
                                        top: this.state.contextMenu.mouseY,
                                        left: this.state.contextMenu.mouseX,
                                    }}
                                TransitionComponent={Fade}
                                MenuListProps={{
                                    "aria-label": "Pedal actions",
                                    style: { minWidth: 190 }
                                }}
                            >
                                <MenuItem
                                    disabled={!canCopy}
                                    onClick={() => this.duplicateContextMenuItem()}
                                >
                                    <ListItemIcon><ControlPointDuplicateIcon fontSize="small" /></ListItemIcon>
                                    Duplicate
                                </MenuItem>
                                <MenuItem
                                    disabled={!canCopy}
                                    onClick={() => this.copyContextMenuItem()}
                                >
                                    <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
                                    Copy
                                </MenuItem>
                                <MenuItem
                                    disabled={!hasPedalboardClipboard()}
                                    onClick={() => this.pasteContextMenuItem()}
                                >
                                    <ListItemIcon><ContentPasteIcon fontSize="small" /></ListItemIcon>
                                    Paste after
                                </MenuItem>
                                <Divider />
                                <MenuItem
                                    disabled={!canDelete}
                                    onClick={() => this.deleteContextMenuItem()}
                                >
                                    <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
                                    Delete
                                </MenuItem>
                            </Menu>
                        </div>
                    );
                }

            },
            pedalboardStyles
        ));

export default PedalboardView
