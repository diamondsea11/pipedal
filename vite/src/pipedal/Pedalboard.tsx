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

import { PiPedalArgumentError } from './PiPedalError';
import MidiBinding from './MidiBinding';
import MidiChannelBinding from './MidiChannelBinding';


const SPLIT_PEDALBOARD_ITEM_URI = "uri://two-play/pipedal/pedalboard#Split";
const EMPTY_PEDALBOARD_ITEM_URI = "uri://two-play/pipedal/pedalboard#Empty";

interface Deserializable<T> {
    deserialize(input: any): T;
}

export class ControlValue implements Deserializable<ControlValue> {
    constructor(key?: string, value?: number)
    {
        this.key = key??"";
        this.value = value?? 0;
    }
    deserialize(input: any): ControlValue {
        this.key = input.key;
        this.value = input.value;
        return this;
    }
    static EmptyArray: ControlValue[] = [];

    static deserializeArray(input: any[]): ControlValue[] {
        let result: ControlValue[] = [];
        for (let i = 0; i < input.length; ++i) {
            result[i] = new ControlValue().deserialize(input[i]);
        }
        return result;
    }
    setValue(value: number) {
        this.value = value;
    }

    key: string;
    value: number;

}

export class PedalboardItem implements Deserializable<PedalboardItem> {
    clone(): PedalboardItem {
        if (this.isSplit())
        {
            let result = new PedalboardSplitItem();
            result.deserialize(this);
            return result as PedalboardItem;;
        }
        return new PedalboardItem().deserialize(this);
    }
    deserializePedalboardItem(input: any): PedalboardItem {
        this.instanceId = input.instanceId ?? -1;
        this.title = input.title ?? "";
        this.uri = input.uri;
        this.pluginName = input.pluginName;
        this.isEnabled = input.isEnabled;
        this.midiBindings = MidiBinding.deserialize_array(input.midiBindings);
        if (input.midiChannelBinding)
        {
            this.midiChannelBinding = input.midiChannelBinding;
        } else {
            this.midiChannelBinding = null;
        }

        this.controlValues = ControlValue.deserializeArray(input.controlValues);
        this.vstState = input.vstState ?? "";
        this.stateUpdateCount = input.stateUpdateCount;
        this.lv2State = input.lv2State;
        this.lilvPresetUri = input.lilvPresetUri;
        this.pathProperties = input.pathProperties;
        this.useModUi = input.useModUi ?? false;
        this.iconColor = input.iconColor??"";
        this.sideChainInputId = input.sideChainInputId ?? -1;

        return this;
    }
    deserialize(input: any): PedalboardItem {
        return this.deserializePedalboardItem(input);
    }
    static deserializeArray(input: any): PedalboardItem[] {
        let result: PedalboardItem[] = [];
        for (let i = 0; i < input.length; ++i) {
            let inputItem: any = input[i];
            let uri: string = inputItem.uri as string;
            let outputItem: PedalboardItem;

            if (uri === SPLIT_PEDALBOARD_ITEM_URI) {
                outputItem = new PedalboardSplitItem().deserialize(inputItem);
            } else {
                outputItem = new PedalboardItem().deserialize(inputItem);
            }
            result[i] = outputItem;

        }
        return result;
    }

    isSyntheticItem(): boolean {
        return this.instanceId === Pedalboard.START_CONTROL_ID
        || this.instanceId === Pedalboard.END_CONTROL_ID;
    }
    getInstanceId() : number {
        if (this.instanceId === undefined)
        {
            throw new PiPedalArgumentError("Item does not have an id.");
        }
        return this.instanceId;
    }
    isEmpty(): boolean {
        return this.uri === EMPTY_PEDALBOARD_ITEM_URI;
    }
    isSplit(): boolean {
        return this.uri === SPLIT_PEDALBOARD_ITEM_URI;
    }
    isStart(): boolean {
        return this.uri === Pedalboard.START_PEDALBOARD_ITEM_URI;
    }
    isEnd(): boolean {
        return this.uri === Pedalboard.END_PEDALBOARD_ITEM_URI;
    }

    getControl(key: string): ControlValue {
        for (let i = 0; i < this.controlValues.length; ++i) {
            let v = this.controlValues[i];
            if (v.key === key) {
                return v;
            }
        }
        throw new PiPedalArgumentError("Invalid key.");

    }

    isChild(instanceId: number): boolean {
        if (this.instanceId === instanceId) return true;
        if (this.isSplit())
        {
            let splitItem = this as unknown as PedalboardSplitItem;
            for (let topItem of splitItem.topChain)
            {
                if (topItem.isChild(instanceId)) return true;
            }
            for (let bottomItem of splitItem.bottomChain)
            {
                if (bottomItem.isChild(instanceId)) return true;
            }
        }
        return false;
    }

    getControlValue(key: string): number {
        for (let i = 0; i < this.controlValues.length; ++i) {
            let v = this.controlValues[i];
            if (v.key === key) {
                return v.value;
            }
        }
        return 0;
    }
    setControlValue(key: string, value: number): boolean {
        for (let i = 0; i < this.controlValues.length; ++i) {
            let v = this.controlValues[i];
            if (v.key === key) {
                if (v.value === value) return false;
                v.setValue(value);
                return true;
            }
        }
        return false;
    }
    setMidiBinding(midiBinding: MidiBinding): boolean {
        if (this.midiBindings)
        {
            for (let i = 0; i < this.midiBindings.length; ++i)
            {
                let binding = this.midiBindings[i];
                if (midiBinding.symbol === binding.symbol)
                {
                    if (binding.equals(midiBinding))
                    {
                        return false;
                    }
                    this.midiBindings.splice(i,1,midiBinding);
                    return true;
                }
            }
            this.midiBindings.push(midiBinding);
            return true;
        }
        this.midiBindings = [ midiBinding];
        return true;
    }
    getMidiBinding(symbol: string): MidiBinding {
        if (this.midiBindings)
        {
            for (let i = 0; i < this.midiBindings.length; ++i)
            {
                let midiBinding = this.midiBindings[i];
                if (midiBinding.symbol === symbol)
                {
                    return midiBinding;
                }
            }
        }
        let result = new MidiBinding();
        result.symbol = symbol;
        return result;
    }


    static EmptyArray: PedalboardItem[] = [];

    instanceId: number = -1;
    title: string = "";
    isEnabled: boolean = false;
    uri: string = "";
    pluginName?: string;
    controlValues: ControlValue[] = ControlValue.EmptyArray;
    midiBindings: MidiBinding[] = [];
    midiChannelBinding: MidiChannelBinding | null = null;
    vstState: string = "";
    stateUpdateCount: number = 0;
    lv2State: [boolean,any] = [false,{}];
    lilvPresetUri: string = "";
    pathProperties: {[Name: string]: string} = {};
    useModUi: boolean = false; // true if this item should use the mod-ui.
    iconColor: string = "";
    sideChainInputId: number = -1; // -1 means no sidechain input.
};

export class SnapshotValue {
    deserialize(input: any): SnapshotValue {
        this.isEnabled = input.isEnabled;
        this.instanceId = input.instanceId;
        this.controlValues = ControlValue.deserializeArray(input.controlValues);
        this.lv2State = input.lv2State;
        this.pathProperties = input.pathProperties;
        return this;
    }
    static deserializeArray(input: any): SnapshotValue[] {
        let result: SnapshotValue[] = [];
        for (let i = 0; i < input.length; ++i) {
            let inputItem: any = input[i];
            let outputItem = new SnapshotValue().deserialize(inputItem);
            result[i] = outputItem;

        }
        return result;
    }
    static createFromPedalboardItem(item: PedalboardItem)
    {
        let result = new SnapshotValue();
        result.instanceId = item.instanceId;
        result.isEnabled = item.isEnabled;
        result.controlValues = ControlValue.deserializeArray(item.controlValues); 
        result.lv2State = item.lv2State; // we can do this, because lv2State is immutable.
        result.pathProperties = {...item.pathProperties}; // clone the dictionary.
        return result;
    }
    instanceId: number = -1;
    isEnabled: boolean = true;
    controlValues: ControlValue[] = ControlValue.EmptyArray;
    lv2State: [boolean,any] = [false,{}];
    pathProperties: {[Name: string]: string} = {};
}
export class Snapshot {
    deserialize(input: any): Snapshot {
        this.values = SnapshotValue.deserializeArray(input.values);
        this.isModified = input.isModified;
        this.name = input.name;
        this.color = input.color;
        this.hasMixSettings = input.hasMixSettings ?? false;
        this.inputVolumeDb = input.inputVolumeDb ?? 0;
        this.outputVolumeDb = input.outputVolumeDb ?? 0;
        this.pathBInputVolumeDb = input.pathBInputVolumeDb ?? 0;
        this.pathBOutputVolumeDb = input.pathBOutputVolumeDb ?? 0;
        this.pathAMute = input.pathAMute ?? false;
        this.pathAPan = input.pathAPan ?? 0;
        this.pathBMute = input.pathBMute ?? false;
        this.pathBPan = input.pathBPan ?? 0;
        this.globalEqEnabled = input.globalEqEnabled ?? false;
        this.globalEqLowCutHz = input.globalEqLowCutHz ?? 20;
        this.globalEqLowCutSlopeDb = input.globalEqLowCutSlopeDb ?? 12;
        this.globalEqLowGainDb = input.globalEqLowGainDb ?? 0;
        this.globalEqMidGainDb = input.globalEqMidGainDb ?? 0;
        this.globalEqMidFrequencyHz = input.globalEqMidFrequencyHz ?? 800;
        this.globalEqMidQ = input.globalEqMidQ ?? 1;
        this.globalEqHighGainDb = input.globalEqHighGainDb ?? 0;
        this.globalEqHighCutHz = input.globalEqHighCutHz ?? 20000;
        this.globalEqHighCutSlopeDb = input.globalEqHighCutSlopeDb ?? 12;
        this.additionalPathMixes = (input.additionalPathMixes ?? [])
            .map((value: any) => new SnapshotPathMix().deserialize(value));
        this.hasMidiActions = input.hasMidiActions ?? false;
        this.midiActions = (input.midiActions ?? [])
            .map((value: any) => new MidiAction().deserialize(value));
        return this;
    }
    static deserializeArray(input: any): (Snapshot| null)[] {
        let result: (Snapshot|null)[] = [];
        for (let i = 0; i < input.length; ++i) {
            let inputItem: any = input[i];
            let outputItem: (Snapshot|null) = null;
            if (inputItem !== null)
            {
                outputItem = new Snapshot().deserialize(inputItem);
            }
            result[i] = outputItem;
        }
        return result;
    }
    static readonly  MAX_SNAPSHOTS: number = 6;

    static cloneSnapshots(snapshots: (Snapshot|null)[]): (Snapshot|null)[]
    {
        let result: (Snapshot|null)[] = [];
        for (let i = 0; i < Snapshot.MAX_SNAPSHOTS; ++i)
        {
            if (i >= snapshots.length) 
            {
                result.push(null);
            } else {
                result.push(snapshots[i]);
            }
        }
        return result;
    }
    name: string = "";
    isModified: boolean = false;
    color: string = "";
    values: SnapshotValue[] = [];
    hasMixSettings: boolean = false;
    inputVolumeDb: number = 0;
    outputVolumeDb: number = 0;
    pathBInputVolumeDb: number = 0;
    pathBOutputVolumeDb: number = 0;
    pathAMute: boolean = false;
    pathAPan: number = 0;
    pathBMute: boolean = false;
    pathBPan: number = 0;
    globalEqEnabled: boolean = false;
    globalEqLowCutHz: number = 20;
    globalEqLowCutSlopeDb: number = 12;
    globalEqLowGainDb: number = 0;
    globalEqMidGainDb: number = 0;
    globalEqMidFrequencyHz: number = 800;
    globalEqMidQ: number = 1;
    globalEqHighGainDb: number = 0;
    globalEqHighCutHz: number = 20000;
    globalEqHighCutSlopeDb: number = 12;
    additionalPathMixes: SnapshotPathMix[] = [];
    // Per-snapshot MIDI actions (Helix Command Center style). When
    // hasMidiActions is set, this snapshot carries its own MIDI action set.
    hasMidiActions: boolean = false;
    midiActions: MidiAction[] = [];
};

export class SnapshotPathMix {
    deserialize(input: any): SnapshotPathMix {
        this.id = input.id ?? "";
        this.inputVolumeDb = input.inputVolumeDb ?? 0;
        this.outputVolumeDb = input.outputVolumeDb ?? 0;
        this.mute = input.mute ?? false;
        this.pan = input.pan ?? 0;
        return this;
    }
    id: string = "";
    inputVolumeDb: number = 0;
    outputVolumeDb: number = 0;
    mute: boolean = false;
    pan: number = 0;
}

export class PedalboardPath {
    deserialize(input: any): PedalboardPath {
        this.id = input.id ?? "";
        this.name = input.name ?? this.id;
        this.enabled = input.enabled ?? true;
        this.inputVolumeDb = input.inputVolumeDb ?? 0;
        this.outputVolumeDb = input.outputVolumeDb ?? 0;
        this.mute = input.mute ?? false;
        this.pan = input.pan ?? 0;
        this.inputChannels = input.inputChannels?.slice() ?? [0];
        this.outputChannels = input.outputChannels?.slice() ?? [];
        this.sourceSendsDb = { ...(input.sourceSendsDb ?? {}) };
        this.items = PedalboardItem.deserializeArray(input.items ?? []);
        return this;
    }
    id: string = "";
    name: string = "";
    enabled: boolean = true;
    inputVolumeDb: number = 0;
    outputVolumeDb: number = 0;
    mute: boolean = false;
    pan: number = 0;
    inputChannels: number[] = [0];
    outputChannels: number[] = [];
    sourceSendsDb: Record<string, number> = {};
    items: PedalboardItem[] = [];
}

export enum MidiActionType {
    None = 0,
    SetPluginControl = 1,
    TogglePluginControl = 2,
    TogglePluginBypass = 3,
    SelectSnapshot = 4,
    NextSnapshot = 5,
    PreviousSnapshot = 6,
    NextPreset = 7,
    PreviousPreset = 8,
    NextBank = 9,
    PreviousBank = 10,
    SetPathMute = 11,
    TogglePathMute = 12,
    ToggleGlobalEq = 13,
    SendMidiControl = 14,
    SendMidiProgram = 15,
}

export enum MidiActionGesture {
    Press = 0,
    Release = 1,
    AnyValue = 2,
    LongPress = 3,
    DoublePress = 4,
}

export class MidiAction {
    deserialize(input: any): MidiAction {
        this.enabled = input.enabled ?? true;
        this.bindingType = input.bindingType ?? MidiBinding.BINDING_TYPE_CONTROL;
        this.channel = input.channel ?? -1;
        this.number = input.number ?? 0;
        this.gesture = input.gesture ?? MidiActionGesture.Press;
        this.actionType = input.actionType ?? MidiActionType.None;
        this.outputChannel = input.outputChannel ?? 0;
        this.actionNumber = input.actionNumber ?? 0;
        this.targetId = input.targetId ?? -1;
        this.symbol = input.symbol ?? "";
        this.value = input.value ?? 1;
        this.alternateValue = input.alternateValue ?? 0;
        this.togglePosition = input.togglePosition ?? 0;
        this.toggleGroup = input.toggleGroup ?? 0;
        this.resetGroup = input.resetGroup ?? 0;
        this.delayMs = input.delayMs ?? 0;
        return this;
    }
    clone(): MidiAction {
        return new MidiAction().deserialize(this);
    }
    enabled: boolean = true;
    bindingType: number = MidiBinding.BINDING_TYPE_CONTROL;
    channel: number = -1;
    number: number = 0;
    gesture: MidiActionGesture = MidiActionGesture.Press;
    actionType: MidiActionType = MidiActionType.None;
    outputChannel: number = 0;
    actionNumber: number = 0;
    targetId: number = -1;
    symbol: string = "";
    value: number = 1;
    alternateValue: number = 0;
    togglePosition: number = 0;
    toggleGroup: number = 0;
    resetGroup: number = 0;
    delayMs: number = 0;
}

export enum SplitType {
    Ab = 0,
    Mix = 1,
    Lr = 2
}



export class PedalboardSplitItem extends PedalboardItem {
    static PANL_KEY: string = "panL";
    static PANR_KEY: string = "panR";
    static VOLL_KEY: string = "volL";
    static VOLR_KEY: string = "volR";
    
    static MIX_KEY: string = "mix";
    static TYPE_KEY: string = "splitType";
    static SELECT_KEY: string = "select";


    deserialize(input: any): PedalboardSplitItem {
        this.deserializePedalboardItem(input);
        this.topChain = PedalboardItem.deserializeArray(input.topChain);
        this.bottomChain = PedalboardItem.deserializeArray(input.bottomChain);

        return this;
    }
    getSplitType(): SplitType {
        let rawValue = this.getControlValue(PedalboardSplitItem.TYPE_KEY);

        if (rawValue <  1) return SplitType.Ab;
        if (rawValue < 2) return SplitType.Mix;
        return SplitType.Lr;
    }
    getToggleAbControlValue(): ControlValue {
        let cv = new ControlValue();
        cv.key = "select";
        cv.value = this.isASelected() ? 1 : 0;
        return cv;

    }
    getMixControl(): ControlValue {
        return this.getControl(PedalboardSplitItem.MIX_KEY);
    }
    getMix(): number {
        return this.getControlValue(PedalboardSplitItem.MIX_KEY);
    }
    isASelected(): boolean {
        return this.getSplitType() !== SplitType.Ab ||  this.getControlValue(PedalboardSplitItem.SELECT_KEY) === 0;
    }
    isBSelected(): boolean {
        return this.getSplitType() !== SplitType.Ab || this.getControlValue(PedalboardSplitItem.SELECT_KEY) !== 0;
    }

    topChain: PedalboardItem[] = PedalboardItem.EmptyArray;
    bottomChain: PedalboardItem[] = PedalboardItem.EmptyArray;
}




export enum InstanceType {
    MainPedalboard,
    MainInsert,
    AuxInsert
}


export class Pedalboard implements Deserializable<Pedalboard> {


    static readonly START_CONTROL_ID = -2; // synthetic PedalboardItem for input volume.
    static readonly END_CONTROL_ID = -3; // synthetic PedalboardItem for output volume.
    static readonly AUX_START_CONTROL_ID = -4;
    static readonly AUX_END_CONTROL_ID = -5;
    static readonly PATH_C_START_CONTROL_ID = -6;
    static readonly PATH_C_END_CONTROL_ID = -7;
    static readonly PATH_D_START_CONTROL_ID = -8;
    static readonly PATH_D_END_CONTROL_ID = -9;


    static readonly START_PEDALBOARD_ITEM_URI = "uri://two-play/pipedal/pedalboard#Start";
    static readonly END_PEDALBOARD_ITEM_URI = "uri://two-play/pipedal/pedalboard#End";

    deserialize(input: any): Pedalboard {
        this.name = input.name;
        this.input_volume_db  = input.input_volume_db;
        this.output_volume_db = input.output_volume_db;
        this.pathAInputChannels = input.pathAInputChannels
            ? input.pathAInputChannels.slice()
            : [];
        this.pathAOutputChannels = input.pathAOutputChannels
            ? input.pathAOutputChannels.slice()
            : [];
        this.pathAMute = input.pathAMute ?? false;
        this.pathAPan = input.pathAPan ?? 0;
        this.items = PedalboardItem.deserializeArray(input.items);
        this.nextInstanceId = input.nextInstanceId ?? 0;
        this.pathBEnabled = input.pathBEnabled ?? false;
        this.pathBName = input.pathBName ?? "Vocal";
        this.pathBInputVolumeDb = input.pathBInputVolumeDb ?? 0;
        this.pathBOutputVolumeDb = input.pathBOutputVolumeDb ?? 0;
        this.pathBMute = input.pathBMute ?? false;
        this.pathBPan = input.pathBPan ?? 0;
        this.pathBInputChannels = input.pathBInputChannels
            ? input.pathBInputChannels.slice()
            : [0];
        this.pathBOutputChannels = input.pathBOutputChannels
            ? input.pathBOutputChannels.slice()
            : [];
        this.pathBItems = input.pathBItems
            ? PedalboardItem.deserializeArray(input.pathBItems)
            : [];
        this.additionalPaths = (input.additionalPaths ?? [])
            .map((path: any) => new PedalboardPath().deserialize(path));
        this.midiActions = (input.midiActions ?? [])
            .map((action: any) => new MidiAction().deserialize(action));
        this.globalEqEnabled = input.globalEqEnabled ?? false;
        this.globalEqLowCutHz = input.globalEqLowCutHz ?? 20;
        this.globalEqLowCutSlopeDb = input.globalEqLowCutSlopeDb ?? 12;
        this.globalEqLowGainDb = input.globalEqLowGainDb ?? 0;
        this.globalEqMidGainDb = input.globalEqMidGainDb ?? 0;
        this.globalEqMidFrequencyHz = input.globalEqMidFrequencyHz ?? 800;
        this.globalEqMidQ = input.globalEqMidQ ?? 1;
        this.globalEqHighGainDb = input.globalEqHighGainDb ?? 0;
        this.globalEqHighCutHz = input.globalEqHighCutHz ?? 20000;
        this.globalEqHighCutSlopeDb = input.globalEqHighCutSlopeDb ?? 12;
        if (this.pathBEnabled && this.pathBItems.length === 0) {
            this.pathBItems = [this.createEmptyItem()];
        }
        this.snapshots = input.snapshots ? Snapshot.deserializeArray(input.snapshots): [];
        this.selectedSnapshot = input.selectedSnapshot;
        this.pathProperties = input.pathProperties;
        this.selectedPlugin = input.selectedPlugin??-1;
        return this;
    }

    clone(): Pedalboard {
        return new Pedalboard().deserialize(this);
    }
    name: string = "";
    input_volume_db: number = 0;
    output_volume_db: number = 0;
    pathAInputChannels: number[] = [];
    pathAOutputChannels: number[] = [];
    pathAMute: boolean = false;
    pathAPan: number = 0;
    items: PedalboardItem[] = [];
    pathBEnabled: boolean = false;
    pathBName: string = "Vocal";
    pathBInputVolumeDb: number = 0;
    pathBOutputVolumeDb: number = 0;
    pathBMute: boolean = false;
    pathBPan: number = 0;
    pathBInputChannels: number[] = [0];
    pathBOutputChannels: number[] = [];
    pathBItems: PedalboardItem[] = [];
    additionalPaths: PedalboardPath[] = [];
    midiActions: MidiAction[] = [];
    globalEqEnabled: boolean = false;
    globalEqLowCutHz: number = 20;
    globalEqLowCutSlopeDb: number = 12;
    globalEqLowGainDb: number = 0;
    globalEqMidGainDb: number = 0;
    globalEqMidFrequencyHz: number = 800;
    globalEqMidQ: number = 1;
    globalEqHighGainDb: number = 0;
    globalEqHighCutHz: number = 20000;
    globalEqHighCutSlopeDb: number = 12;
    nextInstanceId: number = -1;

    snapshots: (Snapshot | null)[] = [];
    selectedSnapshot: number = -1;
    pathProperties: {[Name: string]: string} = {};
    selectedPlugin: number = -1;

    // yields all items in the pedalboard, including split items. Splits are yielded before their children.
    *itemsGenerator(): Generator<PedalboardItem, void, undefined> {
        for (let rootItems of this.getRootItemCollections()) {
            let it = itemGenerator_(rootItems);
            while (true)
            {
                let v = it.next();
                if (v.done) break;
                yield v.value;
            }
        }
    }
    // same as itemsGenerator, but yields split items after their chains.
    *itemsGeneratorSplitAfter(): Generator<PedalboardItem, void, undefined> {
        for (let rootItems of this.getRootItemCollections()) {
            let it = itemGeneratorSplitAfter_(rootItems);
            while (true)
            {
                let v = it.next();
                if (v.done) break;
                yield v.value;
            }
        }
    }

    getRootItemCollections(): PedalboardItem[][] {
        const result = this.pathBEnabled ? [this.items, this.pathBItems] : [this.items];
        for (const path of this.additionalPaths) {
            if (path.enabled) result.push(path.items);
        }
        return result;
    }

    getPathRootItems(instanceId: number): PedalboardItem[] | null {
        if (instanceId === Pedalboard.START_CONTROL_ID ||
            instanceId === Pedalboard.END_CONTROL_ID) {
            return this.items;
        }
        if (instanceId === Pedalboard.AUX_START_CONTROL_ID ||
            instanceId === Pedalboard.AUX_END_CONTROL_ID) {
            return this.pathBItems;
        }
        if (instanceId === Pedalboard.PATH_C_START_CONTROL_ID ||
            instanceId === Pedalboard.PATH_C_END_CONTROL_ID) {
            return this.additionalPaths.find((path) => path.id === "C")?.items ?? null;
        }
        if (instanceId === Pedalboard.PATH_D_START_CONTROL_ID ||
            instanceId === Pedalboard.PATH_D_END_CONTROL_ID) {
            return this.additionalPaths.find((path) => path.id === "D")?.items ?? null;
        }
        if (Pedalboard.containsItem_(this.items, instanceId)) {
            return this.items;
        }
        if (Pedalboard.containsItem_(this.pathBItems, instanceId)) {
            return this.pathBItems;
        }
        for (const path of this.additionalPaths) {
            if (Pedalboard.containsItem_(path.items, instanceId)) {
                return path.items;
            }
        }
        return null;
    }

    private static containsItem_(items: PedalboardItem[], instanceId: number): boolean {
        for (let item of items) {
            if (item.instanceId === instanceId) return true;
            if (item.isSplit()) {
                let split = item as PedalboardSplitItem;
                if (Pedalboard.containsItem_(split.topChain, instanceId) ||
                    Pedalboard.containsItem_(split.bottomChain, instanceId)) {
                    return true;
                }
            }
        }
        return false;
    }

    makeSnapshot(): Snapshot {
        let result = new Snapshot();
        result.hasMixSettings = true;
        result.inputVolumeDb = this.input_volume_db;
        result.outputVolumeDb = this.output_volume_db;
        result.pathBInputVolumeDb = this.pathBInputVolumeDb;
        result.pathBOutputVolumeDb = this.pathBOutputVolumeDb;
        result.pathAMute = this.pathAMute;
        result.pathAPan = this.pathAPan;
        result.pathBMute = this.pathBMute;
        result.pathBPan = this.pathBPan;
        result.globalEqEnabled = this.globalEqEnabled;
        result.globalEqLowCutHz = this.globalEqLowCutHz;
        result.globalEqLowCutSlopeDb = this.globalEqLowCutSlopeDb;
        result.globalEqLowGainDb = this.globalEqLowGainDb;
        result.globalEqMidGainDb = this.globalEqMidGainDb;
        result.globalEqMidFrequencyHz = this.globalEqMidFrequencyHz;
        result.globalEqMidQ = this.globalEqMidQ;
        result.globalEqHighGainDb = this.globalEqHighGainDb;
        result.globalEqHighCutHz = this.globalEqHighCutHz;
        result.globalEqHighCutSlopeDb = this.globalEqHighCutSlopeDb;
        result.additionalPathMixes = this.additionalPaths.map((path) => {
            const mix = new SnapshotPathMix();
            mix.id = path.id;
            mix.inputVolumeDb = path.inputVolumeDb;
            mix.outputVolumeDb = path.outputVolumeDb;
            mix.mute = path.mute;
            mix.pan = path.pan;
            return mix;
        });
        // New snapshots inherit the preset's Base MIDI actions until the user
        // explicitly enables a snapshot override in Control Hub.
        result.hasMidiActions = false;
        result.midiActions = [];
        let it = this.itemsGenerator();
        while (true)
        {
            let v = it.next();
            if (v.done) break;
            let pedalboardItem = v.value;
            let snapshotValue =  SnapshotValue.createFromPedalboardItem(pedalboardItem);
            result.values.push(snapshotValue);
        }
        return result;
    }
    hasItem(instanceId: number): boolean
    {
        let it = this.itemsGenerator();
        while (true)
        {
            let v = it.next();
            if (v.done) break;
            if (v.value.instanceId === instanceId)
            {
                return true;
            }
        }
        return false;

    }

    getFirstSelectableItem(): number
    {
        if (this.items.length !== 0)
        {
            return this.items[0].instanceId;
        }
        return -1;

    }

    maybeGetItem(instanceId: number): PedalboardItem | null{
        let it = this.itemsGenerator();
        while (true)
        {
            let v = it.next();
            if (v.done) break;
            if (v.value.instanceId === instanceId)
            {
                return v.value;
            }
        }
        return null;
    }
    makeStartItem(): PedalboardItem {
        let result = new PedalboardItem();
        result.pluginName = "Input";
        result.instanceId = Pedalboard.START_CONTROL_ID;
        result.uri = Pedalboard.START_PEDALBOARD_ITEM_URI;
        result.isEnabled = true;
        result.controlValues = [new ControlValue("volume_db",this.input_volume_db)];
        return result;

    }
    makeEndItem(): PedalboardItem {
        let result = new PedalboardItem();
        result.pluginName = "Output";
        result.instanceId = Pedalboard.END_CONTROL_ID;
        result.uri = Pedalboard.END_PEDALBOARD_ITEM_URI;
        result.isEnabled = true;
        result.controlValues = [new ControlValue("volume_db",this.output_volume_db)];
        return result;

    }
    makePathBStartItem(): PedalboardItem {
        let result = new PedalboardItem();
        result.pluginName = this.pathBName + " Input";
        result.instanceId = Pedalboard.AUX_START_CONTROL_ID;
        result.uri = Pedalboard.START_PEDALBOARD_ITEM_URI;
        result.isEnabled = true;
        result.controlValues = [new ControlValue("volume_db", this.pathBInputVolumeDb)];
        return result;
    }
    makePathBEndItem(): PedalboardItem {
        let result = new PedalboardItem();
        result.pluginName = this.pathBName + " Output";
        result.instanceId = Pedalboard.AUX_END_CONTROL_ID;
        result.uri = Pedalboard.END_PEDALBOARD_ITEM_URI;
        result.isEnabled = true;
        result.controlValues = [new ControlValue("volume_db", this.pathBOutputVolumeDb)];
        return result;
    }
    makeAdditionalPathTerminalItem(id: "C" | "D", input: boolean): PedalboardItem {
        const path = this.additionalPaths.find((value) => value.id === id);
        const result = new PedalboardItem();
        result.pluginName = `${path?.name ?? `Path ${id}`} ${input ? "Input" : "Output"}`;
        result.instanceId = id === "C"
            ? (input ? Pedalboard.PATH_C_START_CONTROL_ID : Pedalboard.PATH_C_END_CONTROL_ID)
            : (input ? Pedalboard.PATH_D_START_CONTROL_ID : Pedalboard.PATH_D_END_CONTROL_ID);
        result.uri = input
            ? Pedalboard.START_PEDALBOARD_ITEM_URI
            : Pedalboard.END_PEDALBOARD_ITEM_URI;
        result.isEnabled = true;
        result.controlValues = [
            new ControlValue("volume_db", input
                ? path?.inputVolumeDb ?? 0
                : path?.outputVolumeDb ?? 0)
        ];
        return result;
    }

    getItem(instanceId: number): PedalboardItem {
        let it = this.itemsGenerator();
        while (true)
        {
            let v = it.next();
            if (v.done) break;
            if (v.value.instanceId === instanceId)
            {
                return v.value;
            }
        }
        throw new PiPedalArgumentError("Item not found.");
    }
    tryGetItem(instanceId: number): PedalboardItem | null {
        let it = this.itemsGenerator();
        while (true)
        {
            let v = it.next();
            if (v.done) break;
            if (v.value.instanceId === instanceId)
            {
                return v.value;
            }
        }
        return null;
    }
    private deleteItem_(instanceId: number,items: PedalboardItem[]): number | null
    {
        for (let i = 0; i < items.length; ++i)
        {
            let item = items[i];
            if (item.instanceId === instanceId)
            {
                if (items.length > 1) {
                    items.splice(i,1);
                    let nextSelectedItem = i;
                    if (i >= items.length) --nextSelectedItem;
                    return items[nextSelectedItem].instanceId;
                } else {
                    // replace with an empty item.
                    let newItem = this.createEmptyItem();
                    items[i] = newItem;
                    return newItem.instanceId;

                }
            } else {
                if (item.isSplit())
                {
                    let splitItem = item as PedalboardSplitItem;
                    let t = this.deleteItem_(instanceId,splitItem.topChain);
                    if (t != null) return t;

                    t = this.deleteItem_(instanceId,splitItem.bottomChain);
                    if (t != null) return t;
                }
            }
        }
        return null;
    }

    canDeleteItem_(instanceId: number,items: PedalboardItem[]): boolean
    {
        for (let i = 0; i < items.length; ++i)
        {
            let item = items[i];
            if (item.instanceId === instanceId)
            {
                if (items.length > 1) return true;
                return !item.isEmpty(); // can delete if there's one non-empty item.
            }
            if (item.isSplit())
            {
                let splitItem = item as PedalboardSplitItem;
                if (this.canDeleteItem_(instanceId,splitItem.topChain))
                {
                    return true;
                }
                if (this.canDeleteItem_(instanceId,splitItem.bottomChain))
                {
                    return true;
                }
            }
        }
        return false;
    }

    canDeleteItem(instanceId: number): boolean 
    {
        if (this.canDeleteItem_(instanceId,this.items) ||
            this.canDeleteItem_(instanceId, this.pathBItems)) {
            return true;
        }
        return this.additionalPaths.some((path) =>
            this.canDeleteItem_(instanceId, path.items));
    }
    // Returns the next selected instanceId, or null if no deletion occurred.
    deleteItem(instanceId: number): number | null {
        let result = this.deleteItem_(instanceId,this.items);
        if (result === null) {
            result = this.deleteItem_(instanceId, this.pathBItems);
        }
        for (const path of this.additionalPaths) {
            if (result !== null) break;
            result = this.deleteItem_(instanceId, path.items);
        }
        return result;
    }

    setMidiBinding(instanceId: number, midiBinding: MidiBinding): boolean
    {
        let item = this.getItem(instanceId);
        if (!item) return false;
        return item.setMidiBinding(midiBinding);
    }
    addToStart(item: PedalboardItem)
    {
        this.items.splice(0,0,item);
    }
    addToEnd(item: PedalboardItem)
    {
        this.items.splice(this.items.length,0,item);
    }
    addToPathStart(item: PedalboardItem, terminalInstanceId: number)
    {
        let items = this.getPathRootItems(terminalInstanceId) ?? this.items;
        items.splice(0, 0, item);
    }
    addToPathEnd(item: PedalboardItem, terminalInstanceId: number)
    {
        let items = this.getPathRootItems(terminalInstanceId) ?? this.items;
        items.splice(items.length, 0, item);
    }
    static _addRelative(items: PedalboardItem[],newItem: PedalboardItem, instanceId: number, addBefore: boolean): boolean
    {
        for (let i = 0; i < items.length; ++i)
        {
            let item = items[i];
            if (item.instanceId === instanceId)
            {
                if (addBefore)
                {
                    items.splice(i,0,newItem);
                } else {
                    items.splice(i+1,0,newItem);
                }
                return true;
            }
            if (item.isSplit())
            {
                let split = item as PedalboardSplitItem;
                if (this._addRelative(split.topChain,newItem,instanceId,addBefore))
                {
                    return true;
                }
                if (this._addRelative(split.bottomChain,newItem,instanceId,addBefore))
                {
                    return true;
                }
            }
        }
        return false;

    }

    addBefore(item: PedalboardItem, instanceId: number)
    {
        if (item.instanceId === instanceId) return;
        let result = Pedalboard._addRelative(this.items,item, instanceId, true);
        if (!result) {
            result = Pedalboard._addRelative(this.pathBItems, item, instanceId, true);
        }
        for (const path of this.additionalPaths) {
            if (result) break;
            result = Pedalboard._addRelative(path.items, item, instanceId, true);
        }
        if (!result) {
            throw new PiPedalArgumentError("instanceId not found.");
        }

    }
    addAfter(item: PedalboardItem, instanceId: number)
    {
        if (item.instanceId === instanceId) return;
        let result = Pedalboard._addRelative(this.items,item, instanceId, false);
        if (!result) {
            result = Pedalboard._addRelative(this.pathBItems, item, instanceId, false);
        }
        for (const path of this.additionalPaths) {
            if (result) break;
            result = Pedalboard._addRelative(path.items, item, instanceId, false);
        }
        if (!result) {
            throw new PiPedalArgumentError("instanceId not found.");
        }

    }
    
    ensurePedalboardIds() {
        if (this.nextInstanceId === -1) {
            let minId = 1;
            let it = this.itemsGenerator();
            while (true) {
                let v = it.next();
                if (v.done) break;
                if (v.value.instanceId) {
                    let t = v.value.instanceId;
                    if (t+1 > minId) minId = t+1;
                }
    
            }
            this.nextInstanceId = minId;
        }
        let it = this.itemsGenerator();
        while (true) {
            let v = it.next();
            if (v.done) break;
            if (v.value.instanceId === -1) {
                v.value.instanceId = ++this.nextInstanceId;
    
            }
        }
    }
    createEmptySplit(): PedalboardSplitItem {
        let result: PedalboardSplitItem = new PedalboardSplitItem();
        result.uri = SPLIT_PEDALBOARD_ITEM_URI;
        result.instanceId = ++this.nextInstanceId;
        result.pluginName = "";
        result.isEnabled = true;
        result.topChain = [ this.createEmptyItem()];
        result.bottomChain = [ this.createEmptyItem()];
        result.controlValues = [
            new ControlValue(PedalboardSplitItem.TYPE_KEY, 0),
            new ControlValue(PedalboardSplitItem.SELECT_KEY,0),
            new ControlValue(PedalboardSplitItem.MIX_KEY,0),
            new ControlValue(PedalboardSplitItem.PANL_KEY,0),
            new ControlValue(PedalboardSplitItem.VOLL_KEY,0),
            new ControlValue(PedalboardSplitItem.PANR_KEY,0),
            new ControlValue(PedalboardSplitItem.VOLR_KEY,0)
        ];


        return result;


    }
    createEmptyItem(): PedalboardItem {
        let result: PedalboardItem = new PedalboardItem();
        result.uri = EMPTY_PEDALBOARD_ITEM_URI;
        result.instanceId = ++this.nextInstanceId;
        result.pluginName = "";
        result.isEnabled = true;

        return result;
    }
    setItemEmpty(item: PedalboardItem)
    {
        item.uri = EMPTY_PEDALBOARD_ITEM_URI;
        item.instanceId = ++this.nextInstanceId;
        item.pluginName = "";
        item.isEnabled = true;
        item.controlValues = [];
        item.vstState = "";
        item.lv2State = [false,{}];

    }

    _replaceItem(items: PedalboardItem[], instanceId: number, newItem: PedalboardItem): boolean {
        for (let i = 0; i < items.length; ++i)
        {
            let item = items[i];
            if (item.instanceId === instanceId)
            {
                items[i] = newItem;
                return true;
            }
            if (items[i].isSplit())
            {
                let  splitItem = item as PedalboardSplitItem;
                if (this._replaceItem(splitItem.topChain,instanceId,newItem))
                    return true;
                if (this._replaceItem(splitItem.bottomChain,instanceId,newItem))
                {
                    return true;
                }
            }
        }
        return false;
    }

    assignNewInstanceIds(items: PedalboardItem[])
    {
        for (let i = 0; i < items.length; ++i)
        {
            items[i].instanceId = ++this.nextInstanceId;
            if (items[i].isSplit())
            {
                let splitItem = items[i] as PedalboardSplitItem;
                this.assignNewInstanceIds(splitItem.topChain);
                this.assignNewInstanceIds(splitItem.bottomChain);
            }
        }
    }
    cloneItemWithNewInstanceIds(item: PedalboardItem): PedalboardItem
    {
        let result = item.clone();
        let instanceIdMap = new Map<number, number>();

        let assignIds = (currentItem: PedalboardItem) => {
            let oldInstanceId = currentItem.instanceId;
            currentItem.instanceId = ++this.nextInstanceId;
            instanceIdMap.set(oldInstanceId, currentItem.instanceId);

            if (currentItem.isSplit()) {
                let splitItem = currentItem as PedalboardSplitItem;
                splitItem.topChain.forEach(assignIds);
                splitItem.bottomChain.forEach(assignIds);
            }
        };
        let remapReferences = (currentItem: PedalboardItem) => {
            let remappedSidechainId = instanceIdMap.get(currentItem.sideChainInputId);
            if (remappedSidechainId !== undefined) {
                currentItem.sideChainInputId = remappedSidechainId;
            }
            if (currentItem.isSplit()) {
                let splitItem = currentItem as PedalboardSplitItem;
                splitItem.topChain.forEach(remapReferences);
                splitItem.bottomChain.forEach(remapReferences);
            }
        };

        assignIds(result);
        remapReferences(result);
        return result;
    }
    replaceItem(instanceId: number, newItem: PedalboardItem)
    {
        newItem.instanceId = ++this.nextInstanceId;

        let result = this._replaceItem(this.items,instanceId,newItem);
        if (!result) {
            result = this._replaceItem(this.pathBItems, instanceId, newItem);
        }
        for (const path of this.additionalPaths) {
            if (result) break;
            result = this._replaceItem(path.items, instanceId, newItem);
        }
        if (!result)
        {
            throw new PiPedalArgumentError("instanceId not found.");
        }
        if (newItem.isSplit()) 
        {
            // Generate new instance ids for all children, to avoid conflicts.
            let splitItem = newItem as PedalboardSplitItem;
            this.assignNewInstanceIds(splitItem.topChain);
            this.assignNewInstanceIds(splitItem.bottomChain);
        }
        return newItem.instanceId;
    }
    private _addItem(items: PedalboardItem[], newItem: PedalboardItem, instanceId: number, append: boolean)
    {
        for (let i = 0; i < items.length; ++i)
        {
            let item = items[i];
            if (item.instanceId === instanceId)
            {
                if (append)
                {
                    items.splice(i+1,0,newItem);
                    return true;
                } else {
                    items.splice(i,0,newItem);
                    return true;
                }
            }
            if (item.isSplit())
            {
                let splitItem = item as PedalboardSplitItem;
                if (this._addItem(splitItem.topChain,newItem,instanceId,append)) return true;
                if (this._addItem(splitItem.bottomChain,newItem,instanceId,append)) return true;
            }
        }
    }

    addItem(newItem: PedalboardItem, instanceId: number, append: boolean): void
    {
        let added = this._addItem(this.items,newItem,instanceId,append);
        if (!added) {
            added = this._addItem(this.pathBItems,newItem,instanceId,append);
        }
        for (const path of this.additionalPaths) {
            if (added) break;
            added = this._addItem(path.items,newItem,instanceId,append);
        }
    }

    addAdditionalPath(id: "C" | "D", inputChannel: number): void {
        let path = this.additionalPaths.find((value) => value.id === id);
        if (!path) {
            path = new PedalboardPath();
            path.id = id;
            path.name = `Path ${id}`;
            path.items = [this.createEmptyItem()];
            this.additionalPaths.push(path);
        }
        path.enabled = true;
        path.inputChannels = [inputChannel];
    }

    removeAdditionalPath(id: "C" | "D"): void {
        const path = this.additionalPaths.find((value) => value.id === id);
        if (path) path.enabled = false;
    }

    enablePathB(inputChannel: number = 0): void {
        this.pathBEnabled = true;
        this.pathBInputChannels = [inputChannel];
        if (this.pathBItems.length === 0) {
            this.pathBItems = [this.createEmptyItem()];
        }
    }

    disablePathB(): void {
        this.pathBEnabled = false;
    }

}

function* itemGenerator_(items: PedalboardItem[]): Generator<PedalboardItem, void, undefined> {
    for (let i = 0; i < items.length; ++i) {
        let item = items[i];
        yield item;
        if (item.uri === SPLIT_PEDALBOARD_ITEM_URI) {

            let splitItem = item as PedalboardSplitItem;

            let it = itemGenerator_(splitItem.topChain);
            while (true) {
                let v = it.next();
                if (v.done) break;
                yield v.value;
            }
            it = itemGenerator_(splitItem.bottomChain);
            while (true) {
                let v = it.next();
                if (v.done) break;
                yield v.value;
            }
        }
    }
}

function* itemGeneratorSplitAfter_(items: PedalboardItem[]): Generator<PedalboardItem, void, undefined> {
    for (let i = 0; i < items.length; ++i) {
        let item = items[i];
        if (item.uri === SPLIT_PEDALBOARD_ITEM_URI) {

            let splitItem = item as PedalboardSplitItem;

            let it = itemGenerator_(splitItem.topChain);
            while (true) {
                let v = it.next();
                if (v.done) break;
                yield v.value;
            }
            it = itemGenerator_(splitItem.bottomChain);
            while (true) {
                let v = it.next();
                if (v.done) break;
                yield v.value;
            }
        }
        yield item;
    }
}
