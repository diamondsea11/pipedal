// Copyright (c) 2025 Robin Davies
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
import { Theme } from '@mui/material/styles';
import { css } from '@emotion/react';

import WithStyles from './WithStyles';
import { createStyles } from './WithStyles';

import { withStyles } from "tss-react/mui";

import IControlViewFactory from './IControlViewFactory';
import { PiPedalModelFactory, PiPedalModel, ListenHandle, State } from "./PiPedalModel";
import { PedalboardItem, ControlValue } from './Pedalboard';
import PluginControlView, { ICustomizationHost, ControlGroup, ControlViewCustomization } from './PluginControlView';
import { UiPlugin, UiControl, ControlType } from './Lv2Plugin';


const TOOB_NAM__MODEL_METADATA_URI = "http://two-play.com/plugins/toob-nam#model_metadata";


enum NamModelType {
    None = 0,
    A1 = 1,
    A2 = 2
};

function floatToModelType(value: number): NamModelType {
    switch (value) {
        case 0: return NamModelType.None;
        case 1: return NamModelType.A1;
        case 2: return NamModelType.A2;
        default: return NamModelType.None;
    }
}
// offset 0: an integer with the following bits set.
// Must match ToobAmp/src/NeuralAmpModeler_Lv2Extensions.hpp enum TOOB_NAM_METADATA_OFFSETS
const MAX_SLIMMABLE_SIZES = 20;

class TOOB_NAM_METADATA_OFFSETS {
    static readonly flags = 0;
    static readonly preset_version = 1;
    static readonly loudness = 2;
    static readonly gain = 3;
    static readonly input_level_dbu = 4;
    static readonly output_level_dbu = 5;
    static readonly has_slimmable_weights = 6;
    static readonly model_weight = 7;
    static readonly model_type = 8;
    static readonly slimmable_sizes_length = 9;
    static readonly max_metadata = 10+MAX_SLIMMABLE_SIZES;
};


class TOOB_NAM_METADATA_FLAGS {
    static readonly has_model = 1;
    static readonly has_loudness = 2;
    static readonly has_gain = 4;
    static readonly has_input_level_dbu = 8;
    static readonly has_output_level_dbu = 16;
};

class ModelMetadata {
    constructor(metadataValues?: number[]) {


        if (metadataValues) {
            let flags = metadataValues[TOOB_NAM_METADATA_OFFSETS.flags];
            this.hasModel = (flags & TOOB_NAM_METADATA_FLAGS.has_model) !== 0;
            this.hasLoudness = (flags & TOOB_NAM_METADATA_FLAGS.has_loudness) !== 0;
            this.hasGain = (flags & TOOB_NAM_METADATA_FLAGS.has_gain) !== 0;
            this.hasInputLevelDBU = (flags & TOOB_NAM_METADATA_FLAGS.has_input_level_dbu) !== 0;
            this.hasOutputLevelDBU = (flags & TOOB_NAM_METADATA_FLAGS.has_output_level_dbu) !== 0;

            this.loudness = metadataValues[TOOB_NAM_METADATA_OFFSETS.loudness];
            this.gain = metadataValues[TOOB_NAM_METADATA_OFFSETS.gain];
            this.inputLevelDBU = metadataValues[TOOB_NAM_METADATA_OFFSETS.input_level_dbu];
            this.outputLevelDBU = metadataValues[TOOB_NAM_METADATA_OFFSETS.output_level_dbu];
            this.preset_version = metadataValues[TOOB_NAM_METADATA_OFFSETS.preset_version];
            this.hasSlimmableWeights = metadataValues[TOOB_NAM_METADATA_OFFSETS.has_slimmable_weights] !== 0;
            this.modelWeight = metadataValues[TOOB_NAM_METADATA_OFFSETS.model_weight];
            this.modelType = floatToModelType(metadataValues[TOOB_NAM_METADATA_OFFSETS.model_type]);
            this.slimmableWeights = [];
            if (metadataValues.length > TOOB_NAM_METADATA_OFFSETS.slimmable_sizes_length) {
                let slimmableSizesLength = metadataValues[TOOB_NAM_METADATA_OFFSETS.slimmable_sizes_length];
                for (let i = 0; i < slimmableSizesLength; ++i) {
                    this.slimmableWeights.push(metadataValues[TOOB_NAM_METADATA_OFFSETS.slimmable_sizes_length+1 + i]);
                }
            }
        } else {
            this.hasModel = false;
            this.hasLoudness = false;
            this.hasGain = false;
            this.hasInputLevelDBU = false;
            this.hasOutputLevelDBU = false;

            this.loudness = 0;
            this.gain = 0;
            this.hasSlimmableWeights = false;
            this.inputLevelDBU = 0;
            this.outputLevelDBU = 0;
            this.preset_version = 1;
            this.modelWeight = -1;
            this.slimmableWeights = [];
        }
    }

    preset_version: number;
    hasSlimmableWeights: boolean = false;
    modelWeight: number = 1.0;
    modelType: NamModelType = NamModelType.None;
    hasModel: boolean = false;
    hasLoudness: boolean = false;
    hasGain: boolean = false;
    hasInputLevelDBU: boolean = false;
    hasOutputLevelDBU: boolean = false;
    slimmableWeights: number[] = [];

    loudness: number;
    gain: number;
    inputLevelDBU: number;
    outputLevelDBU: number;

}


const styles = (theme: Theme) => createStyles({
    skin: css({
        width: "100%",
        height: "100%",
        color: "#e8ebe8",
        background: "#151819",
        "& [data-pipedal-role='plugin-control-frame']": {
            background: "#151819",
        },
        "& [data-pipedal-role='control-grid']": {
            gap: 0,
            rowGap: 0,
            paddingTop: 0,
            paddingLeft: 30,
            paddingRight: 45,
            alignContent: "flex-start",
        },
        "& [data-pipedal-role='custom-control']": {
            width: "100%",
            flex: "1 0 100%",
        },
        "& [data-pipedal-role='control-group']": {
            minHeight: 162,
            margin: 0,
            padding: "13px 12px 8px",
            color: "#e8ebe8",
            background: "#191d1e",
            border: "0 solid #424849",
            borderRightWidth: 1,
            borderBottomWidth: 1,
            borderRadius: 0,
            boxShadow: "none",
        },
        "& [data-pipedal-role='control-group-title']": {
            minWidth: 0,
            position: "absolute",
            top: 9,
            left: 14,
            margin: 0,
            padding: 0,
            color: "#cfd4d0",
            background: "transparent",
            textTransform: "uppercase",
        },
        "& [data-pipedal-role='control-group-title'] p": {
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0,
        },
        "& [data-pipedal-role='control-group-controls']": {
            minWidth: 220,
            paddingTop: 25,
            paddingBottom: 0,
        },
        "& [data-group-name='Model'], & [data-group-name='Calibration']": {
            borderTop: "3px solid #c84d42",
        },
        "& [data-group-name='Signal'], & [data-group-name='Tone']": {
            borderTop: "3px solid #55b7a5",
        },
        "& [data-group-name='Engine']": {
            borderTop: "3px solid #d5b85a",
        },
    }),
    namHeader: css({
        width: "calc(100% - 16px)",
        maxWidth: "calc(100% - 16px)",
        minWidth: "calc(100% - 16px)",
        height: 112,
        flex: "1 0 calc(100% - 16px)",
        display: "flex",
        alignItems: "center",
        gap: 22,
        margin: "0 8px",
        padding: "17px 26px",
        color: "#171b1b",
        background: "#d8dbd6",
        borderBottom: "5px solid #c84d42",
    }),
    namMark: css({
        width: 74,
        height: 58,
        position: "relative",
        flex: "0 0 auto",
        "& span": {
            width: 15,
            height: 15,
            position: "absolute",
            display: "block",
            background: "#202525",
            border: "4px solid #55b7a5",
            borderRadius: "50%",
            zIndex: 2,
        },
        "& span:nth-of-type(1)": { left: 0, top: 22 },
        "& span:nth-of-type(2)": { left: 29, top: 0 },
        "& span:nth-of-type(3)": { left: 29, bottom: 0 },
        "& span:nth-of-type(4)": { right: 0, top: 22 },
        "&::before, &::after": {
            content: '""',
            width: 54,
            height: 3,
            position: "absolute",
            top: 27,
            left: 10,
            background: "#202525",
            transformOrigin: "50% 50%",
        },
        "&::before": { transform: "rotate(28deg)" },
        "&::after": { transform: "rotate(-28deg)" },
    }),
    namTitle: css({
        minWidth: 265,
        display: "flex",
        flexDirection: "column",
        "& strong": {
            fontSize: 26,
            lineHeight: "29px",
            fontWeight: 700,
        },
        "& span": {
            marginTop: 5,
            color: "#5b6260",
            fontSize: 13,
            fontWeight: 600,
            textTransform: "uppercase",
        },
    }),
    statusStrip: css({
        minWidth: 0,
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        flexWrap: "wrap",
        gap: 8,
    }),
    statusPill: css({
        minHeight: 30,
        display: "flex",
        alignItems: "center",
        padding: "5px 10px",
        color: "#252a29",
        background: "#eef0ec",
        border: "1px solid #9ca29f",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
    }),
    calibrationPill: css({
        color: "#153d36",
        background: "#cde7e0",
        borderColor: "#55b7a5",
    }),
});

interface ToobNamViewProps extends WithStyles<typeof styles> {
    instanceId: number;
    item: PedalboardItem;

}
interface ToobNamViewState {
    showEqSection: boolean;
    enableInputCalibration: boolean;
    showCalibration: boolean;
    enableOutputNormalization: boolean;
    modelMetadata: ModelMetadata;
    modelWeight: number,
}

const ToobNamView =
    withStyles(
        class extends React.Component<ToobNamViewProps, ToobNamViewState>
            implements ControlViewCustomization {
            model: PiPedalModel;

            customizationId: number = 1;

            constructor(props: ToobNamViewProps) {
                super(props);
                this.handleConnectionStateChanged = this.handleConnectionStateChanged.bind(this);

                this.model = PiPedalModelFactory.getInstance();
                this.state = {
                    showEqSection: false,
                    showCalibration: false,
                    enableInputCalibration: false,
                    enableOutputNormalization: false,
                    modelMetadata: new ModelMetadata(),
                    modelWeight: -1
                }
                let pluginInfo: UiPlugin | null = this.model.getUiPlugin(this.props.item.uri);
                if (pluginInfo === null) {
                    throw new Error("Plugin not found.");
                }
                let inputCalibrationControl = pluginInfo.getControl("inputCalibrationMode");
                if (!inputCalibrationControl) {
                    throw new Error("Control not found.");
                }
                let patchedInputControl = new UiControl().deserialize(inputCalibrationControl);
                patchedInputControl.controlType = ControlType.Select;
                this.patchedInputControl = patchedInputControl

                let outputCalibrationControl = pluginInfo.getControl("outputCalibration");
                if (!outputCalibrationControl) {
                    throw new Error("Control not found.");
                }
                let patchedOutputControl = new UiControl().deserialize(outputCalibrationControl);
                patchedOutputControl.controlType = ControlType.Select;
                this.noCalibrationOutputControl = patchedOutputControl
                this.noCalibrationOutputControl.scale_points.splice(1, 1);

                let calibrationLevelControl = pluginInfo.getControl("calibration");
                if (!calibrationLevelControl) {
                    throw new Error("Control not found.");
                }
                this.calibrationLevelControl = new UiControl().deserialize(calibrationLevelControl);
                this.calibrationLevelControl.name = "Input Level";

                let modelSizeControl = pluginInfo.getControl("modelSize");
                if (!modelSizeControl) {
                    throw new Error("Control not found.");
                }
                this.modelSizeControl = modelSizeControl;
            }

            private patchedInputControl: UiControl;
            private noCalibrationOutputControl: UiControl;
            private calibrationLevelControl: UiControl;
            private modelSizeControl: UiControl;
            fullScreen() {
                return false;
            }

            disableControl(control: React.ReactNode, key: string) {
                return (
                    <div style={{ opacity: 0.3, pointerEvents: "none" }}
                        key={key}

                        onPointerDownCapture={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    >
                        {control}
                    </div>
                );
            }

            modifyControls(host: ICustomizationHost, controls: (React.ReactNode | ControlGroup)[]): (React.ReactNode | ControlGroup)[] {
                const ModelWeightControlPos = 3;
                const EqPos = 8;
                const CalibrationGroupPos = 9;


                let calibrationGroup = controls[CalibrationGroupPos] as ControlGroup;


                if (this.state.showCalibration) {
                    calibrationGroup.controls[0] = host.makeStandardControl(this.patchedInputControl, this.props.item.controlValues);
                    calibrationGroup.controls[1] = host.makeStandardControl(this.calibrationLevelControl, this.props.item.controlValues);

                    if (this.state.enableInputCalibration) {
                        calibrationGroup.controls[0] = host.makeStandardControl(this.patchedInputControl, this.props.item.controlValues);

                    } else {
                        calibrationGroup.controls[0] = host.makeStandardControl(this.patchedInputControl,
                            [new ControlValue("inputCalibrationMode", 0.0)]
                        );
                        calibrationGroup.controls[0] = this.disableControl(calibrationGroup.controls[0], "cg_01d");
                        calibrationGroup.controls[1] = this.disableControl(calibrationGroup.controls[1], "cg_02d");

                        if (this.state.enableOutputNormalization) {
                            calibrationGroup.controls[2] = host.makeStandardControl(this.noCalibrationOutputControl, this.props.item.controlValues);
                        } else {
                            let tControl: UiControl = this.noCalibrationOutputControl.clone();
                            tControl.symbol = "_disabled_output";
                            calibrationGroup.controls[2] = host.makeStandardControl(
                                tControl,
                                [new ControlValue("_disabled_output", 2.0)]);
                            calibrationGroup.controls[2] = this.disableControl(calibrationGroup.controls[2], "cg_03d");

                        }
                    }
                } else {
                    controls[CalibrationGroupPos] = null;
                }
                if (!this.state.showEqSection) {
                    controls[EqPos] = null;
                }
                if (this.state.modelMetadata.hasSlimmableWeights) {
                    let slimmableWeights = [ 0.5, 1.0];

                    controls[ModelWeightControlPos] = (
                        host.makeStandardControl(this.modelSizeControl, this.props.item.controlValues, { slimmableWeights: slimmableWeights })
                    );  

                }
                const classes = withStyles.getClasses(this.props);
                const metadata = this.state.modelMetadata;
                let modelType = "No model";
                if (metadata.hasModel) {
                    switch (metadata.modelType) {
                        case NamModelType.A1: modelType = "NAM A1"; break;
                        case NamModelType.A2: modelType = "NAM A2"; break;
                        default: modelType = "NAM model"; break;
                    }
                }
                const header = (
                    <div className={classes.namHeader} key="nam-skin-header">
                        <div className={classes.namMark} aria-hidden="true">
                            <span /><span /><span /><span />
                        </div>
                        <div className={classes.namTitle}>
                            <strong>Neural Amp Modeler</strong>
                            <span>TooB / NAM Core</span>
                        </div>
                        <div className={classes.statusStrip}>
                            <div className={classes.statusPill}>{modelType}</div>
                            {metadata.hasInputLevelDBU && (
                                <div className={`${classes.statusPill} ${classes.calibrationPill}`}>
                                    Input {metadata.inputLevelDBU.toFixed(1)} dBu
                                </div>
                            )}
                            {metadata.hasOutputLevelDBU && (
                                <div className={`${classes.statusPill} ${classes.calibrationPill}`}>
                                    Output {metadata.outputLevelDBU.toFixed(1)} dBu
                                </div>
                            )}
                            {metadata.hasSlimmableWeights && (
                                <div className={classes.statusPill}>
                                    Weight {this.state.modelWeight > 0 ? this.state.modelWeight.toFixed(2) : "1.00"}
                                </div>
                            )}
                        </div>
                    </div>
                );

                const modelControls: React.ReactNode[] = [controls[2] as React.ReactNode];
                if (metadata.hasSlimmableWeights) {
                    modelControls.push(controls[ModelWeightControlPos] as React.ReactNode);
                }
                const result: (React.ReactNode | ControlGroup)[] = [
                    header,
                    new ControlGroup("Model", [2, 3], modelControls),
                    new ControlGroup(
                        "Signal",
                        [0, 4, 5],
                        [controls[0], controls[4], controls[5]] as React.ReactNode[]
                    ),
                ];
                if (controls[EqPos]) {
                    result.push(controls[EqPos]);
                }
                if (controls[CalibrationGroupPos]) {
                    result.push(controls[CalibrationGroupPos]);
                }
                result.push(
                    new ControlGroup("Engine", [7], [controls[7] as React.ReactNode])
                );
                return result;
            }


            private handleConnectionStateChanged(state: State) {
                if (state === State.Ready) {
                    this.unsubscribeFromMetadata();
                    this.subscribeToMetadata();
                }
            }

            handleModelMetadata(atomData: any) {
                if (atomData && atomData.otype_ === "Vector" && atomData.value) {
                    let metadata = new ModelMetadata(atomData.value as number[]);
                    metadata.hasInputLevelDBU || metadata.hasOutputLevelDBU
                    this.setState({
                        modelMetadata: metadata,
                        showEqSection: metadata.preset_version === 0,
                        showCalibration: (
                            metadata.hasInputLevelDBU || metadata.hasOutputLevelDBU ||
                            metadata.hasLoudness) && metadata.hasModel,
                        enableInputCalibration: metadata.hasInputLevelDBU && metadata.hasModel,
                        enableOutputNormalization: metadata.hasLoudness && metadata.hasModel,
                        modelWeight: metadata.modelWeight
                    });
                }
            }

            subscribeToMetadata() {
                this.subscribedId = this.props.instanceId;
                this.listenHandle = this.model.monitorPatchProperty(
                    this.props.instanceId,
                    TOOB_NAM__MODEL_METADATA_URI,
                    (instanceId, propertyUri, atomData) => {
                        this.handleModelMetadata(atomData);
                    });
                this.model.getPatchProperty(
                    this.props.instanceId,
                    TOOB_NAM__MODEL_METADATA_URI
                ).then((atomData) => {
                    this.handleModelMetadata(atomData);
                }).catch((e) => {

                });

            }
            unsubscribeFromMetadata() {
                this.subscribedId = null;
                if (this.listenHandle) {
                    this.model.cancelMonitorPatchProperty(this.listenHandle);
                    this.listenHandle = null;
                }
            }

            private listenHandle: ListenHandle | null = null;
            componentDidMount() {
                if (super.componentDidMount) {
                    super.componentDidMount();
                }
                this.subscribeToMetadata();
                this.model.state.addOnChangedHandler(this.handleConnectionStateChanged);
            }
            componentWillUnmount() {
                this.unsubscribeFromMetadata();
                if (super.componentWillUnmount) {
                    super.componentWillUnmount();
                }
                this.model.state.removeOnChangedHandler(this.handleConnectionStateChanged);

            }

            private subscribedId: number | null = null;
            componentDidUpdate() {
                if (this.props.instanceId !== this.subscribedId) {
                    this.unsubscribeFromMetadata();
                    this.subscribeToMetadata();
                }
            }


            render() {
                const classes = withStyles.getClasses(this.props);
                return (
                    <div className={classes.skin}>
                        <PluginControlView
                            instanceId={this.props.instanceId}
                            item={this.props.item}
                            customization={this}
                            customizationId={this.customizationId}
                            showModGui={false}
                            onSetShowModGui={(instanceId: number, showModGui: boolean) => { }}
                        />
                    </div>
                );
            }
        },
        styles
    );



class ToobNamViewFactory implements IControlViewFactory {
    uri: string = "http://two-play.com/plugins/toob-nam";

    Create(model: PiPedalModel, pedalboardItem: PedalboardItem): React.ReactNode {
        return (<ToobNamView instanceId={pedalboardItem.instanceId} item={pedalboardItem} />);
    }


}
export default ToobNamViewFactory;
