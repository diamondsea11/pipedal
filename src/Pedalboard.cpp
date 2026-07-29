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

#include "pch.h"
#include "Pedalboard.hpp"
#include "AtomConverter.hpp"
#include "PluginHost.hpp"
#include "AtomConverter.hpp"
#include "SplitEffect.hpp"


using namespace pipedal;


static const PedalboardItem* GetItem_(const std::vector<PedalboardItem>&items,int64_t pedalboardItemId)
{
    for (size_t i = 0; i < items.size(); ++i)
    {
        auto &item = items[i];
        if (items[i].instanceId() == pedalboardItemId)
        {
            return &(items[i]);
        }
        if (item.isSplit())
        {
            const PedalboardItem* t = GetItem_(item.topChain(),pedalboardItemId);
            if (t != nullptr) return t;
            t = GetItem_(item.bottomChain(),pedalboardItemId);
            if (t != nullptr) return t;
        }
    }
    return nullptr;
}

static void GetAllItems(std::vector<PedalboardItem*> & result, std::vector<PedalboardItem>&items)
{
    for (auto& item: items)
    {
        if (item.isSplit())
        {
            GetAllItems(result,item.topChain());
            GetAllItems(result,item.bottomChain());
        }
        result.push_back(&item);
    }    
}
std::vector<PedalboardItem*> Pedalboard::GetAllPlugins()
{
    std::vector<PedalboardItem*> result;
    GetAllItems(result,this->items());
    GetAllItems(result,this->pathBItems());
    return result;
}


const PedalboardItem*Pedalboard::GetItem(int64_t pedalItemId) const
{
    const PedalboardItem *result = GetItem_(this->items(), pedalItemId);
    if (result == nullptr)
    {
        result = GetItem_(this->pathBItems(), pedalItemId);
    }
    return result;
}
PedalboardItem*Pedalboard::GetItem(int64_t pedalItemId)
 {
     return const_cast<PedalboardItem*>(GetItem_(this->items(),pedalItemId));
 }


ControlValue* PedalboardItem::GetControlValue(const std::string&symbol)
{
    for (size_t i = 0; i < this->controlValues().size(); ++i)
    {
        if (this->controlValues()[i].key() == symbol)
        {
            return &(this->controlValues()[i]);
        }
    }
    return nullptr;
}



bool PedalboardItem::SetControlValue(const std::string&symbol, float value)
{
    ControlValue*controlValue = GetControlValue(symbol);
    if (controlValue == nullptr) 
    {
        this->controlValues().push_back(ControlValue(symbol.c_str(),value));
        return true;
    }
    if (controlValue->value() != value)
    {
        controlValue->value(value);
        return true;
    }
    return false;
}

const ControlValue* PedalboardItem::GetControlValue(const std::string&symbol) const
{
    for (size_t i = 0; i < this->controlValues().size(); ++i)
    {
        if (this->controlValues()[i].key() == symbol)
        {
            return &(this->controlValues()[i]);
        }
    }
    return nullptr;
}

bool Pedalboard::SetItemUseModUi(int64_t pedalItemId, bool enabled)
{
    PedalboardItem*item = GetItem(pedalItemId);
    if (!item) return false;
    if (item->useModUi() != enabled)
    {
        item->useModUi(enabled);
        return true;
    }
    return false;

}
bool Pedalboard::SetItemEnabled(int64_t pedalItemId, bool enabled)
{
    PedalboardItem*item = GetItem(pedalItemId);

    if (!item) return false;
    if (item->isEnabled() != enabled)
    {
        item->isEnabled(enabled);
        return true;
    }
    return false;

}


bool Pedalboard::SetControlValue(int64_t pedalItemId, const std::string &symbol, float value)
{
    PedalboardItem*item = GetItem(pedalItemId);
    if (!item) return false;
    return item->SetControlValue(symbol,value);
}

bool Pedalboard::SetItemTitle(int64_t pedalItemId, const std::string &title, const std::string&iconColor)
{
    PedalboardItem*item = GetItem(pedalItemId);
    if (!item) return false;
    if (item->title() == title && item->iconColor() == iconColor) return false; // no change.
    item->title(title);
    item->iconColor(iconColor);
    return true;
}


PedalboardItem Pedalboard::MakeEmptyItem()
{
    uint64_t instanceId = NextInstanceId();

    PedalboardItem result;
    result.instanceId(instanceId);
    result.uri(EMPTY_PEDALBOARD_ITEM_URI);
    result.pluginName("");
    result.isEnabled(true);
    return result;
}


PedalboardItem Pedalboard::MakeSplit()
{
    uint64_t instanceId = NextInstanceId();

    PedalboardItem result;
    result.instanceId(instanceId);
    result.uri(SPLIT_PEDALBOARD_ITEM_URI);
    result.pluginName("");
    result.isEnabled(true);

    result.topChain().push_back(MakeEmptyItem());
    result.bottomChain().push_back(MakeEmptyItem());
    result.controlValues().push_back(
        ControlValue(SPLIT_SPLITTYPE_KEY,0));
    result.controlValues().push_back(
        ControlValue(SPLIT_SELECT_KEY,0));
    result.controlValues().push_back(
        ControlValue(SPLIT_MIX_KEY,0));
    result.controlValues().push_back(
        ControlValue(SPLIT_PANL_KEY,0));
    result.controlValues().push_back(
        ControlValue(SPLIT_VOLL_KEY,-3));
    result.controlValues().push_back(
        ControlValue(SPLIT_PANR_KEY,0));
    result.controlValues().push_back(
        ControlValue(SPLIT_VOLR_KEY,-3));
    
    return result;
}



Pedalboard Pedalboard::MakeDefault()
{
    // copy insanity. but it happens so rarely.
    Pedalboard result;

    result.items().push_back(result.MakeEmptyItem());
    result.name("Default Preset");

    return result;
}

void Pedalboard::EnsurePathB()
{
    pathBEnabled(true);
    if (pathBItems().empty())
    {
        pathBItems().push_back(MakeEmptyItem());
    }
    if (pathBInputChannels().empty())
    {
        pathBInputChannels().push_back(0);
    }
}


bool IsPedalboardSplitItem(const PedalboardItem*self, const std::vector<PedalboardItem>&value)
{
    return self->uri() == SPLIT_PEDALBOARD_ITEM_URI;
}

bool Pedalboard::ApplySnapshot(int64_t snapshotIndex, PluginHost&pluginHost)
{
    if (snapshotIndex < 0 || 
        snapshotIndex >= this->snapshots_.size() || 
        this->snapshots_[snapshotIndex] == nullptr 
    )
    {
        return false;
    }
    std::map<int64_t, SnapshotValue*> indexedValues;
    Snapshot *snapshot = this->snapshots_[snapshotIndex].get();
    if (snapshot->hasMixSettings_)
    {
        input_volume_db_ = snapshot->inputVolumeDb_;
        output_volume_db_ = snapshot->outputVolumeDb_;
        pathBInputVolumeDb_ = snapshot->pathBInputVolumeDb_;
        pathBOutputVolumeDb_ = snapshot->pathBOutputVolumeDb_;
        pathAMute_ = snapshot->pathAMute_;
        pathAPan_ = snapshot->pathAPan_;
        pathBMute_ = snapshot->pathBMute_;
        pathBPan_ = snapshot->pathBPan_;
        globalEqEnabled_ = snapshot->globalEqEnabled_;
        globalEqLowCutHz_ = snapshot->globalEqLowCutHz_;
        globalEqLowGainDb_ = snapshot->globalEqLowGainDb_;
        globalEqMidGainDb_ = snapshot->globalEqMidGainDb_;
        globalEqMidFrequencyHz_ = snapshot->globalEqMidFrequencyHz_;
        globalEqHighGainDb_ = snapshot->globalEqHighGainDb_;
        globalEqHighCutHz_ = snapshot->globalEqHighCutHz_;
    }

    for (auto &value: snapshot->values_)
    {
        indexedValues[value.instanceId_] = &value;
    }

    auto plugins = this->GetAllPlugins();
    for (PedalboardItem *pedalboardItem: plugins)
    {
        if (!pedalboardItem->isEmpty())
        {
            SnapshotValue*snapshotValue = indexedValues[pedalboardItem->instanceId()];
            if (snapshotValue)
            {
                pedalboardItem->ApplySnapshotValue(snapshotValue);
            } else {
                pedalboardItem->ApplyDefaultValues(pluginHost);
            }
        }
    }
    return true;
}

void PedalboardItem::ApplyDefaultValues(PluginHost&pluginHost)
{
    if (isEmpty()) return;
    auto pluginInfo = pluginHost.GetPluginInfo(this->uri());
    if (!pluginInfo)
    {
        if (this->isSplit())
        {
            pluginInfo = GetSplitterPluginInfo();
        }
    }
    this->isEnabled(true);
    if (pluginInfo)
    {
        for (auto &port: pluginInfo->ports())
        {
            this->SetControlValue(port->symbol(),port->default_value());
        }
        // a cheat. this isn't actually true, but close enough.
        for (auto &pathProperty: this->pathProperties_)
        {
            pathProperties_[pathProperty.first] = AtomConverter::EmptyPathstring();
        }
    }
}


void PedalboardItem::ApplySnapshotValue(SnapshotValue*snapshotValue)
{
    std::map<std::string,float> cumulativeValues;
    for (auto &controlValue: this->controlValues())
    {
        cumulativeValues[controlValue.key()] = controlValue.value();
    }
    for (auto&controlValue : snapshotValue->controlValues_)
    {
        cumulativeValues[controlValue.key()] = controlValue.value();
    }
    this->controlValues().clear();
    for (auto&pair: cumulativeValues)
    {
        this->controlValues_.push_back(ControlValue(pair.first.c_str(),pair.second));
    }
    if (this->lv2State() != snapshotValue->lv2State_)
    {
        this->lv2State(snapshotValue->lv2State_);
        this->stateUpdateCount(this->stateUpdateCount()+1);
    }
    for (auto&property: snapshotValue->pathProperties_)
    {
        if (property.second == "null")
        {
            this->pathProperties_[property.first] = AtomConverter::EmptyPathstring();

        } else {
            this->pathProperties_[property.first] = property.second;
        }
    }
    this->isEnabled(snapshotValue->isEnabled_);

}


// can we just send a snapshot-style uddate instead of reloading plugins? All settings are ignored.
bool Pedalboard::IsStructureIdentical(const Pedalboard &other) const
{
    if (this->nextInstanceId_ != other.nextInstanceId_) // quick check that catches 95% of structural changes.
    {
        return false;
    }
    if (this->items_.size() != other.items_.size()) 
    {
        return false;
    }
    for (size_t i = 0; i < this->items_.size();++i) 
    {
        if (!this->items_[i].IsStructurallyIdentical(other.items_[i]))
        {
            return false;
        }
    }
    if (this->pathBEnabled_ != other.pathBEnabled_ ||
        this->pathAInputChannels_ != other.pathAInputChannels_ ||
        this->pathAMute_ != other.pathAMute_ ||
        this->pathAPan_ != other.pathAPan_ ||
        this->pathBInputChannels_ != other.pathBInputChannels_ ||
        this->pathBMute_ != other.pathBMute_ ||
        this->pathBPan_ != other.pathBPan_ ||
        this->globalEqEnabled_ != other.globalEqEnabled_ ||
        this->globalEqLowCutHz_ != other.globalEqLowCutHz_ ||
        this->globalEqLowGainDb_ != other.globalEqLowGainDb_ ||
        this->globalEqMidGainDb_ != other.globalEqMidGainDb_ ||
        this->globalEqMidFrequencyHz_ != other.globalEqMidFrequencyHz_ ||
        this->globalEqHighGainDb_ != other.globalEqHighGainDb_ ||
        this->globalEqHighCutHz_ != other.globalEqHighCutHz_ ||
        this->pathBItems_.size() != other.pathBItems_.size())
    {
        return false;
    }
    for (size_t i = 0; i < this->pathBItems_.size(); ++i)
    {
        if (!this->pathBItems_[i].IsStructurallyIdentical(other.pathBItems_[i]))
        {
            return false;
        }
    }
    return true;
}

bool PedalboardItem::IsStructurallyIdentical(const PedalboardItem&other) const
{
    if (this->instanceId() != other.instanceId()) // must match in order to ensure that realtime message passing works.
    {
        return false;
    }
    if (this->uri() != other.uri())
    {
        return false;
    }
    if (this->midiBindings() != other.midiBindings())
    {
        return false;
    }
    if (this->isSplit()) // so is the other by virtue of idential uris.
    {

        // // split type changes potentially trigger buffer allocation changes, 
        // // so different split types are not structurally identical.

        auto myValue = this->GetControlValue("splitType");
        auto otherValue = other.GetControlValue("splitType");
        if (myValue == nullptr || otherValue == nullptr) // actually an error.
        {
            return false;
        }
        if (myValue->value() != otherValue->value()) {
            return false; 
        }
        if (topChain().size() != other.topChain().size())
        {
            return false;
        }
        for (size_t i = 0; i < topChain().size(); ++i)
        {
            if (!topChain()[i].IsStructurallyIdentical(other.topChain()[i] ))
            {
                return false;
            }
        }
        if (bottomChain().size() != other.bottomChain().size())
        {
            for (size_t i = 0; i < bottomChain().size(); ++i)
            {
                if (!bottomChain()[i].IsStructurallyIdentical(other.bottomChain()[i]))
                {
                    return false;
                }
            }
        }
    }
    return true;
}

void PedalboardItem::AddToSnapshotFromCurrentSettings(Snapshot&snapshot) const
{
    SnapshotValue snapshotValue;
    snapshotValue.instanceId_ = this->instanceId_;
    snapshotValue.isEnabled_ = this->isEnabled_;

    for (const ControlValue &value: this->controlValues_)
    {
        snapshotValue.controlValues_.push_back(value);
    }
    for (const auto&pathProperty: this->pathProperties_)
    {
        snapshotValue.pathProperties_[pathProperty.first] = pathProperty.second;
    }
    snapshotValue.lv2State_ = this->lv2State_;
    snapshot.values_.push_back(std::move(snapshotValue));

    if (this->isSplit())
    {
        for (auto&item: this->topChain_)
        {
            item.AddToSnapshotFromCurrentSettings(snapshot);;
        }
        for (auto&item: this->bottomChain_)
        {
            item.AddToSnapshotFromCurrentSettings(snapshot);
        }
    }
}

void PedalboardItem::AddResetsForMissingProperties(Snapshot&snapshot, size_t*index) const
{
    // structure must be identical
    // items must be enumerated in the same order as AddToSnapshotFromCurrentSettings
    SnapshotValue&snapshotValue = snapshot.values_[*index];
    
    if (snapshotValue.instanceId_ != this->instanceId())
    {
        throw std::runtime_error("Pedalboard structure does not match.");
    }

    for (auto&property: this->pathProperties_)
    {
        auto f = snapshotValue.pathProperties_.find(property.first);
        if (f == snapshotValue.pathProperties_.end())
        {
            snapshotValue.pathProperties_[property.first] = AtomConverter::EmptyPathstring();
        }
    }   
    ++(*index);

    if (this->isSplit())
    {
        for (auto&item: this->topChain())
        {
            item.AddResetsForMissingProperties(snapshot,index);
        }
        for (auto&item: this->bottomChain())
        {
            item.AddResetsForMissingProperties(snapshot,index);
        }
    }

}

Pedalboard Pedalboard::DeepCopy()
{
    Pedalboard result = *this;
    for (size_t i= 0; i < snapshots_.size(); ++i)
    {
        if (snapshots_[i])
        {
            result.snapshots_[i] = std::make_shared<Snapshot>(*(snapshots_[i]));
        }
    }
    return result;
}
void  Pedalboard::SetCurrentSnapshotModified(bool modified)
{
    if (selectedSnapshot() != -1)
    {
        auto& snapshot = snapshots_[selectedSnapshot_];
        if (snapshot)
        {
            snapshot->isModified_ = modified;
        }
    }
}

Snapshot Pedalboard::MakeSnapshotFromCurrentSettings(const Pedalboard &previousPedalboard)
{
    Snapshot snapshot;
    snapshot.hasMixSettings_ = true;
    snapshot.inputVolumeDb_ = input_volume_db_;
    snapshot.outputVolumeDb_ = output_volume_db_;
    snapshot.pathBInputVolumeDb_ = pathBInputVolumeDb_;
    snapshot.pathBOutputVolumeDb_ = pathBOutputVolumeDb_;
    snapshot.pathAMute_ = pathAMute_;
    snapshot.pathAPan_ = pathAPan_;
    snapshot.pathBMute_ = pathBMute_;
    snapshot.pathBPan_ = pathBPan_;
    snapshot.globalEqEnabled_ = globalEqEnabled_;
    snapshot.globalEqLowCutHz_ = globalEqLowCutHz_;
    snapshot.globalEqLowGainDb_ = globalEqLowGainDb_;
    snapshot.globalEqMidGainDb_ = globalEqMidGainDb_;
    snapshot.globalEqMidFrequencyHz_ = globalEqMidFrequencyHz_;
    snapshot.globalEqHighGainDb_ = globalEqHighGainDb_;
    snapshot.globalEqHighCutHz_ = globalEqHighCutHz_;
    // name and color don't matter. this is strictly for loading purposes.
    auto items = this->GetAllPlugins();
    for (auto item : items)
    {
        item->AddToSnapshotFromCurrentSettings(snapshot);
    }
    // a neccesary precondition: the previous pedalboard must have identical structure, 
    // so we can just 
    // auto items = this->GetAllPlugins();

    // for (auto&item: previousPedalboard.items_)
    // {
    //     item.AddResetsForMissingProperties(snapshot,&index);
    // }
    return snapshot;

}


Pedalboard::Pedalboard()
{
    nextInstanceId_ = 0;
}


JSON_MAP_BEGIN(ControlValue)
    JSON_MAP_REFERENCE(ControlValue,key)
    JSON_MAP_REFERENCE(ControlValue,value)
JSON_MAP_END()



JSON_MAP_BEGIN(PedalboardItem)
    JSON_MAP_REFERENCE(PedalboardItem,instanceId)
    JSON_MAP_REFERENCE(PedalboardItem,uri)
    JSON_MAP_REFERENCE(PedalboardItem,isEnabled)
    JSON_MAP_REFERENCE(PedalboardItem,controlValues)
    JSON_MAP_REFERENCE(PedalboardItem,pluginName)
    JSON_MAP_REFERENCE_CONDITIONAL(PedalboardItem,topChain,IsPedalboardSplitItem)
    JSON_MAP_REFERENCE_CONDITIONAL(PedalboardItem,bottomChain,&IsPedalboardSplitItem)
    JSON_MAP_REFERENCE(PedalboardItem,midiBindings)
    JSON_MAP_REFERENCE(PedalboardItem,midiChannelBinding)
    JSON_MAP_REFERENCE(PedalboardItem,stateUpdateCount)
    JSON_MAP_REFERENCE(PedalboardItem,lv2State)
    JSON_MAP_REFERENCE(PedalboardItem,lilvPresetUri)
    JSON_MAP_REFERENCE(PedalboardItem,pathProperties)
    JSON_MAP_REFERENCE(PedalboardItem,title)
    JSON_MAP_REFERENCE(PedalboardItem,useModUi)
    JSON_MAP_REFERENCE(PedalboardItem,iconColor)
    JSON_MAP_REFERENCE(PedalboardItem,sideChainInputId)
JSON_MAP_END()


JSON_MAP_BEGIN(Pedalboard)
    JSON_MAP_REFERENCE(Pedalboard,name)
    JSON_MAP_REFERENCE(Pedalboard,input_volume_db)
    JSON_MAP_REFERENCE(Pedalboard,output_volume_db)
    JSON_MAP_REFERENCE(Pedalboard,pathAInputChannels)
    JSON_MAP_REFERENCE(Pedalboard,pathAMute)
    JSON_MAP_REFERENCE(Pedalboard,pathAPan)
    JSON_MAP_REFERENCE(Pedalboard,items)
    JSON_MAP_REFERENCE(Pedalboard,pathBEnabled)
    JSON_MAP_REFERENCE(Pedalboard,pathBName)
    JSON_MAP_REFERENCE(Pedalboard,pathBInputVolumeDb)
    JSON_MAP_REFERENCE(Pedalboard,pathBOutputVolumeDb)
    JSON_MAP_REFERENCE(Pedalboard,pathBMute)
    JSON_MAP_REFERENCE(Pedalboard,pathBPan)
    JSON_MAP_REFERENCE(Pedalboard,pathBInputChannels)
    JSON_MAP_REFERENCE(Pedalboard,pathBItems)
    JSON_MAP_REFERENCE(Pedalboard,globalEqEnabled)
    JSON_MAP_REFERENCE(Pedalboard,globalEqLowCutHz)
    JSON_MAP_REFERENCE(Pedalboard,globalEqLowGainDb)
    JSON_MAP_REFERENCE(Pedalboard,globalEqMidGainDb)
    JSON_MAP_REFERENCE(Pedalboard,globalEqMidFrequencyHz)
    JSON_MAP_REFERENCE(Pedalboard,globalEqHighGainDb)
    JSON_MAP_REFERENCE(Pedalboard,globalEqHighCutHz)
    JSON_MAP_REFERENCE(Pedalboard,nextInstanceId)
    JSON_MAP_REFERENCE(Pedalboard,snapshots)
    JSON_MAP_REFERENCE(Pedalboard,selectedSnapshot)
    JSON_MAP_REFERENCE(Pedalboard,selectedPlugin)
JSON_MAP_END()

JSON_MAP_BEGIN(SnapshotValue)
    JSON_MAP_REFERENCE(SnapshotValue,instanceId)
    JSON_MAP_REFERENCE(SnapshotValue,isEnabled)
    JSON_MAP_REFERENCE(SnapshotValue,controlValues)
    JSON_MAP_REFERENCE(SnapshotValue,lv2State)
    JSON_MAP_REFERENCE(SnapshotValue,pathProperties)
JSON_MAP_END()

JSON_MAP_BEGIN(Snapshot)
    JSON_MAP_REFERENCE(Snapshot,name)
    JSON_MAP_REFERENCE(Snapshot,isModified)
    JSON_MAP_REFERENCE(Snapshot,color)
    JSON_MAP_REFERENCE(Snapshot,values)
    JSON_MAP_REFERENCE(Snapshot,hasMixSettings)
    JSON_MAP_REFERENCE(Snapshot,inputVolumeDb)
    JSON_MAP_REFERENCE(Snapshot,outputVolumeDb)
    JSON_MAP_REFERENCE(Snapshot,pathBInputVolumeDb)
    JSON_MAP_REFERENCE(Snapshot,pathBOutputVolumeDb)
    JSON_MAP_REFERENCE(Snapshot,pathAMute)
    JSON_MAP_REFERENCE(Snapshot,pathAPan)
    JSON_MAP_REFERENCE(Snapshot,pathBMute)
    JSON_MAP_REFERENCE(Snapshot,pathBPan)
    JSON_MAP_REFERENCE(Snapshot,globalEqEnabled)
    JSON_MAP_REFERENCE(Snapshot,globalEqLowCutHz)
    JSON_MAP_REFERENCE(Snapshot,globalEqLowGainDb)
    JSON_MAP_REFERENCE(Snapshot,globalEqMidGainDb)
    JSON_MAP_REFERENCE(Snapshot,globalEqMidFrequencyHz)
    JSON_MAP_REFERENCE(Snapshot,globalEqHighGainDb)
    JSON_MAP_REFERENCE(Snapshot,globalEqHighCutHz)
JSON_MAP_END()
