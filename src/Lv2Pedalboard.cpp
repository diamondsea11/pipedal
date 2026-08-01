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
#include "Lv2Pedalboard.hpp"
#include "Lv2Effect.hpp"

#include "SplitEffect.hpp"
#include "RingBufferReader.hpp"
#include "VuUpdate.hpp"
#include "AudioHost.hpp"
#include "Lv2EventBufferWriter.hpp"
#include "Lv2Log.hpp"
#include "CrashGuard.hpp"
#include "restrict.hpp"
#include "AudioDriver.hpp"

using namespace pipedal;

namespace
{
    enum class EqType
    {
        LowPass,
        HighPass,
        LowShelf,
        Peak,
        HighShelf
    };

    void ConfigureBiquad(
        Lv2Pedalboard::Biquad &filter,
        EqType type,
        float sampleRate,
        float frequency,
        float gainDb = 0,
        float q = 0.70710678f)
    {
        frequency = std::max(10.0f, std::min(frequency, sampleRate * 0.45f));
        float a = std::pow(10.0f, gainDb / 40.0f);
        float omega = 2.0f * (float)M_PI * frequency / sampleRate;
        float cosine = std::cos(omega);
        float sine = std::sin(omega);
        float alpha = sine / (2.0f * q);
        float sqrtA = std::sqrt(a);
        float b0, b1, b2, a0, a1, a2;

        switch (type)
        {
        case EqType::LowPass:
            b0 = (1.0f - cosine) * 0.5f;
            b1 = 1.0f - cosine;
            b2 = b0;
            a0 = 1.0f + alpha;
            a1 = -2.0f * cosine;
            a2 = 1.0f - alpha;
            break;
        case EqType::HighPass:
            b0 = (1.0f + cosine) * 0.5f;
            b1 = -(1.0f + cosine);
            b2 = b0;
            a0 = 1.0f + alpha;
            a1 = -2.0f * cosine;
            a2 = 1.0f - alpha;
            break;
        case EqType::LowShelf:
            alpha = sine * 0.5f * std::sqrt(2.0f);
            b0 = a * ((a + 1) - (a - 1) * cosine + 2 * sqrtA * alpha);
            b1 = 2 * a * ((a - 1) - (a + 1) * cosine);
            b2 = a * ((a + 1) - (a - 1) * cosine - 2 * sqrtA * alpha);
            a0 = (a + 1) + (a - 1) * cosine + 2 * sqrtA * alpha;
            a1 = -2 * ((a - 1) + (a + 1) * cosine);
            a2 = (a + 1) + (a - 1) * cosine - 2 * sqrtA * alpha;
            break;
        case EqType::HighShelf:
            alpha = sine * 0.5f * std::sqrt(2.0f);
            b0 = a * ((a + 1) + (a - 1) * cosine + 2 * sqrtA * alpha);
            b1 = -2 * a * ((a - 1) + (a + 1) * cosine);
            b2 = a * ((a + 1) + (a - 1) * cosine - 2 * sqrtA * alpha);
            a0 = (a + 1) - (a - 1) * cosine + 2 * sqrtA * alpha;
            a1 = 2 * ((a - 1) - (a + 1) * cosine);
            a2 = (a + 1) - (a - 1) * cosine - 2 * sqrtA * alpha;
            break;
        default:
            b0 = 1 + alpha * a;
            b1 = -2 * cosine;
            b2 = 1 - alpha * a;
            a0 = 1 + alpha / a;
            a1 = -2 * cosine;
            a2 = 1 - alpha / a;
            break;
        }

        filter.b0 = b0 / a0;
        filter.b1 = b1 / a0;
        filter.b2 = b2 / a0;
        filter.a1 = a1 / a0;
        filter.a2 = a2 / a0;
        filter.z1 = filter.z2 = 0;
    }

    void ConfigureBypass(Lv2Pedalboard::Biquad &filter)
    {
        filter.b0 = 1;
        filter.b1 = filter.b2 = filter.a1 = filter.a2 = 0;
        filter.z1 = filter.z2 = 0;
    }

    void ConfigureFirstOrderCut(
        Lv2Pedalboard::Biquad &filter,
        EqType type,
        float sampleRate,
        float frequency)
    {
        frequency = std::max(10.0f, std::min(frequency, sampleRate * 0.45f));
        const float k = std::tan((float)M_PI * frequency / sampleRate);
        const float norm = 1.0f / (1.0f + k);
        filter.b0 = type == EqType::LowPass ? k * norm : norm;
        filter.b1 = type == EqType::LowPass ? filter.b0 : -filter.b0;
        filter.b2 = 0;
        filter.a1 = (k - 1.0f) * norm;
        filter.a2 = 0;
        filter.z1 = filter.z2 = 0;
    }

    void ConfigureCutFilters(
        Lv2Pedalboard::Biquad &first,
        Lv2Pedalboard::Biquad &second,
        EqType type,
        float sampleRate,
        float frequency,
        int slopeDb)
    {
        switch (slopeDb)
        {
        case 6:
            ConfigureFirstOrderCut(first, type, sampleRate, frequency);
            ConfigureBypass(second);
            break;
        case 18:
            ConfigureFirstOrderCut(first, type, sampleRate, frequency);
            ConfigureBiquad(second, type, sampleRate, frequency, 0, 1.0f);
            break;
        case 24:
            ConfigureBiquad(first, type, sampleRate, frequency, 0, 0.5411961f);
            ConfigureBiquad(second, type, sampleRate, frequency, 0, 1.3065630f);
            break;
        default:
            ConfigureBiquad(first, type, sampleRate, frequency);
            ConfigureBypass(second);
            break;
        }
    }
}

float *Lv2Pedalboard::CreateNewAudioBuffer()
{
    return bufferPool.AllocateBuffer<float>(pHost->GetMaxAudioBufferSize());
}

std::vector<float *> Lv2Pedalboard::AllocateAudioBuffers(int nChannels)
{
    std::vector<float *> result;
    for (int i = 0; i < nChannels; ++i)
    {
        result.push_back(bufferPool.AllocateBuffer<float>(pHost->GetMaxAudioBufferSize()));
    }
    return result;
}

int Lv2Pedalboard::GetControlIndex(uint64_t instanceId, const std::string &symbol)
{
    for (int i = 0; i < realtimeEffects.size(); ++i)
    {
        auto item = realtimeEffects[i];
        if (item->GetInstanceId() == instanceId)
        {
            return item->GetControlIndex(symbol);
        }
    }
    return -1;
}

std::vector<float *> Lv2Pedalboard::PrepareItems(
    std::vector<PedalboardItem> &items,
    std::vector<float *> inputBuffers,
    Lv2PedalboardErrorList &errorList,
    ExistingEffectMap *existingEffects)
{
    for (int i = 0; i < items.size(); ++i)
    {
        auto &item = items[i];
        if (!item.isEmpty())
        {
            std::shared_ptr<IEffect> pEffect = nullptr;

            if (item.isSplit())
            {
                auto pSplit = new SplitEffect(item.instanceId(), pHost->GetSampleRate(), inputBuffers);
                pEffect = std::shared_ptr<IEffect>(pSplit);

                int topInputChannels = inputBuffers.size();
                int bottomInputChannels = inputBuffers.size();

                std::vector<float *> topInputs = AllocateAudioBuffers(topInputChannels);
                std::vector<float *> bottomInputs = AllocateAudioBuffers(bottomInputChannels);

                auto preMixAction = [pSplit](uint32_t frames)
                { pSplit->PreMix(frames); };

                this->processActions.push_back(preMixAction);

                std::vector<float *> topResult = PrepareItems(item.topChain(), topInputs, errorList, existingEffects);
                std::vector<float *> bottomResult = PrepareItems(item.bottomChain(), bottomInputs, errorList, existingEffects);

                this->processActions.push_back(
                    [pSplit](uint32_t frames)
                    { pSplit->PostMix(frames); });
                auto controlValue = item.GetControlValue("splitType");
                // if split is L/R, always output stereo.

                bool forceStereo = (controlValue != nullptr && controlValue->value() == 2);
                pSplit->SetChainBuffers(topInputs, bottomInputs, topResult, bottomResult, forceStereo);

                for (int i = 0; i < item.controlValues().size(); ++i)
                {
                    auto &controlValue = item.controlValues()[i];
                    int index = pSplit->GetControlIndex(controlValue.key());
                    if (index != -1)
                    {
                        pSplit->SetControl(index, controlValue.value());
                    }
                }
            }
            else
            {
                std::shared_ptr<IEffect> pLv2Effect;

                if (existingEffects && existingEffects->contains(item.instanceId()))
                {
                    pLv2Effect = existingEffects->at(item.instanceId());
                    ((Lv2Effect *)pLv2Effect.get())->SetBorrowedEffect(true);
                }
                else
                {
                    try
                    {
                        pLv2Effect = std::shared_ptr<IEffect>(this->pHost->CreateEffect(item));
                    }
                    catch (const std::exception &e)
                    {
                        Lv2Log::warning(SS(e.what()));
                    }

                    if (pLv2Effect && pLv2Effect->HasErrorMessage())
                    {
                        std::string error = pLv2Effect->TakeErrorMessage();
                        Lv2Log::error(error);
                        errorList.push_back({item.instanceId(), error});
                    }
                }

                if (pLv2Effect)
                {

                    pEffect = pLv2Effect;

                    uint64_t instanceId = pEffect->GetInstanceId();
                    pLv2Effect->PrepareNoInputEffect(inputBuffers.size(), pHost->GetMaxAudioBufferSize());

                    if (inputBuffers.size() == 1)
                    {
                        if (pLv2Effect->GetNumberOfInputAudioBuffers() == 1)
                        {
                            pLv2Effect->SetAudioInputBuffer(0, inputBuffers[0]);
                        }
                        else if (pLv2Effect->GetNumberOfInputAudioBuffers() >= 2)
                        {
                            pLv2Effect->SetAudioInputBuffer(0, inputBuffers[0]);
                            pLv2Effect->SetAudioInputBuffer(1, inputBuffers[0]);
                        }
                    }
                    else
                    {
                        if (pLv2Effect->GetNumberOfInputAudioBuffers() == 1)
                        {
                            pLv2Effect->SetAudioInputBuffer(0, inputBuffers[0]);

                            auto inputBuffer = inputBuffers[0];
                        }
                        else if (pLv2Effect->GetNumberOfInputAudioBuffers() >= 2)
                        {
                            pLv2Effect->SetAudioInputBuffer(0, inputBuffers[0]);
                            pLv2Effect->SetAudioInputBuffer(1, inputBuffers[1]);

                            auto bufferL = inputBuffers[0];
                            auto bufferR = inputBuffers[1];
                        }
                    }
                    // Connect sidechain buffers.

                    if (pLv2Effect->GetNumberOfSidechainAudioBuffers() != 0)
                    {
                        if (item.sideChainInputId() == -2) // -2 means "use pedalboard inputs".
                        {
                            for (size_t i = 0; i < pLv2Effect->GetNumberOfSidechainAudioBuffers(); ++i)
                            {
                                if (i < this->pedalboardInputBuffers.size())
                                {
                                    pLv2Effect->SetAudioSidechainBuffer(i, this->pedalboardInputBuffers[i]);
                                }
                                else
                                {
                                    // just use the first output buffer for all sidechain inputs.
                                    pLv2Effect->SetAudioSidechainBuffer(i, this->pedalboardInputBuffers[0]);
                                }
                            }
                        }
                        else if (item.sideChainInputId() != -1)
                        {
                            IEffect *pSideChainInput = GetEffect(item.sideChainInputId());

                            if (pSideChainInput)
                            {
                                for (size_t i = 0; i < pLv2Effect->GetNumberOfSidechainAudioBuffers(); ++i)
                                {
                                    if (i < pSideChainInput->GetNumberOfOutputAudioBuffers())
                                    {
                                        pLv2Effect->SetAudioSidechainBuffer(i, pSideChainInput->GetAudioOutputBuffer(i));
                                    }
                                    else
                                    {
                                        // just use the first output buffer for all sidechain inputs.
                                        pLv2Effect->SetAudioSidechainBuffer(i, pSideChainInput->GetAudioOutputBuffer(0));
                                    }
                                }
                            }
                            else
                            {
                                throw std::runtime_error("Internal error: Sidechain input IEffect not found.");
                            }
                        }
                        else
                        {
                            // No sidechain input. Feed zero buffer to all sidechain audio ports..
                            for (size_t i = 0; i < pLv2Effect->GetNumberOfSidechainAudioBuffers(); ++i)
                            {

                                // just use one buffer for all plugins
                                if (!this->pedalboardSidechainBuffer)
                                {
                                    this->pedalboardSidechainBuffer = CreateNewAudioBuffer();
                                }
                                pLv2Effect->SetAudioSidechainBuffer(i, this->pedalboardSidechainBuffer);
                            }
                        }
                    }

                    // check to see whether we need buffer staging.
                    bool requiresBufferStaging = false;
                    if (pLv2Effect->IsLv2Effect())
                    {
                        Lv2Effect *lv2Effect = (Lv2Effect *)pLv2Effect.get();

                        if (lv2Effect->RequiresBufferStaging())
                        {
                            requiresBufferStaging = true;
                            this->processActions.push_back(
                                [lv2Effect, this](uint32_t frames)
                                {
                                    lv2Effect->RunWithBufferStaging(frames, this->ringBufferWriter);
                                });
                        }
                    }

                    if (!requiresBufferStaging)
                    {
                        this->processActions.push_back(
                            [pLv2Effect, this](uint32_t frames)
                            {
                                pLv2Effect->Run(frames, this->ringBufferWriter);
                            });
                    }

                    // reset any trigger controls to default state after processing
                    if (pLv2Effect->IsLv2Effect())
                    {
                        Lv2Effect *lv2Effect = (Lv2Effect *)pLv2Effect.get();

                        auto pluginInfo = pHost->GetPluginInfo(item.uri());
                        if (pluginInfo)
                        {
                            for (auto control : pluginInfo->ports())
                            {
                                if (control->trigger_property() && control->is_input() && control->is_control_port())
                                {
                                    int controlIndex = lv2Effect->GetControlIndex(control->symbol());
                                    if (controlIndex >= 0)
                                    {
                                        float defaultValue = control->default_value();
                                        this->processActions.push_back(
                                            [pLv2Effect, controlIndex, defaultValue](int32_t frames)
                                            {
                                                pLv2Effect->SetControl(controlIndex, defaultValue);
                                            });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (pEffect)
            {
                this->effects.push_back(pEffect); // for ownership.

                this->realtimeEffects.push_back(pEffect.get()); // because std::shared_ptr is not threadsafe.

                std::vector<float *> effectOutput;

                if (pEffect->GetNumberOfOutputAudioBuffers() == 1)
                {
                    effectOutput.push_back(CreateNewAudioBuffer());
                }
                else if (pEffect->GetNumberOfOutputAudioBuffers() >= 2)
                {
                    effectOutput.push_back(CreateNewAudioBuffer());
                    effectOutput.push_back(CreateNewAudioBuffer());
                }
                for (size_t i = 0; i < effectOutput.size(); ++i)
                {
                    pEffect->SetAudioOutputBuffer(i, effectOutput[i]);
                }
                inputBuffers = effectOutput;
            }
        }
    }
    return inputBuffers;
}

void Lv2Pedalboard::Prepare(IHost *pHost, Pedalboard &pedalboard, Lv2PedalboardErrorList &errorList, ExistingEffectMap *existingEffects)
{
    this->pHost = pHost;

    inputVolume.SetSampleRate((float)(this->pHost->GetSampleRate()));
    outputVolume.SetSampleRate((float)(this->pHost->GetSampleRate()));
    pathBInputVolume.SetSampleRate((float)(this->pHost->GetSampleRate()));
    pathBOutputVolume.SetSampleRate((float)(this->pHost->GetSampleRate()));
    inputVolume.SetMinDb(-60);
    outputVolume.SetMinDb(-60);
    pathBInputVolume.SetMinDb(-60);
    pathBOutputVolume.SetMinDb(-60);

    inputVolume.SetTarget(pedalboard.input_volume_db());
    outputVolume.SetTarget(pedalboard.output_volume_db());
    pathBInputVolume.SetTarget(pedalboard.pathBInputVolumeDb());
    pathBOutputVolume.SetTarget(pedalboard.pathBOutputVolumeDb());
    this->pathAMute = pedalboard.pathAMute();
    this->pathAPan = std::max(-1.0f, std::min(1.0f, pedalboard.pathAPan()));
    this->pathBMute = pedalboard.pathBMute();
    this->pathBPan = std::max(-1.0f, std::min(1.0f, pedalboard.pathBPan()));
    this->globalEqEnabled = pedalboard.globalEqEnabled();

    for (size_t channel = 0; channel < this->globalEq.size(); ++channel)
    {
        auto &filters = this->globalEq[channel];
        float sampleRate = (float)this->pHost->GetSampleRate();
        ConfigureCutFilters(filters[0], filters[1], EqType::HighPass, sampleRate,
                            pedalboard.globalEqLowCutHz(), pedalboard.globalEqLowCutSlopeDb());
        ConfigureBiquad(filters[2], EqType::LowShelf, sampleRate, 120, pedalboard.globalEqLowGainDb());
        ConfigureBiquad(filters[3], EqType::Peak, sampleRate,
                        pedalboard.globalEqMidFrequencyHz(), pedalboard.globalEqMidGainDb(),
                        pedalboard.globalEqMidQ());
        ConfigureBiquad(filters[4], EqType::HighShelf, sampleRate, 4000, pedalboard.globalEqHighGainDb());
        ConfigureCutFilters(filters[5], filters[6], EqType::LowPass, sampleRate,
                            pedalboard.globalEqHighCutHz(), pedalboard.globalEqHighCutSlopeDb());
    }

    this->pathAInputChannels = pedalboard.pathAInputChannels();
    this->pathAOutputChannels = pedalboard.pathAOutputChannels();
    size_t nInputs = this->pathAInputChannels.empty()
        ? std::max(GetNumberOfAudioInputChannels(), (size_t)1)
        : std::max(this->pathAInputChannels.size(), (size_t)1);

    for (size_t i = 0; i < nInputs; ++i)
    {
        this->pedalboardInputBuffers.push_back(bufferPool.AllocateBuffer<float>(pHost->GetMaxAudioBufferSize()));
    }

    size_t effectStart = effects.size();
    auto outputs = PrepareItems(pedalboard.items(), this->pedalboardInputBuffers, errorList, existingEffects);
    for (size_t effectIndex = effectStart; effectIndex < effects.size(); ++effectIndex)
    {
        pathALatencyEffects.push_back(effects[effectIndex].get());
    }
    size_t nOutputs = GetNumberOfAudioOutputChannels();
    if (nOutputs == 1)
    {
        this->pedalboardOutputBuffers.push_back(outputs[0]);
    }
    else
    {
        if (outputs.size() == 1)
        {
            this->pedalboardOutputBuffers.push_back(outputs[0]);
            this->pedalboardOutputBuffers.push_back(outputs[0]);
        }
        else
        {
            this->pedalboardOutputBuffers.push_back(outputs[0]);
            this->pedalboardOutputBuffers.push_back(outputs[1]);
        }
    }

    this->pathBEnabled = pedalboard.pathBEnabled();
    this->pathBInputChannels = pedalboard.pathBInputChannels();
    this->pathBOutputChannels = pedalboard.pathBOutputChannels();
    if (this->pathBEnabled)
    {
        size_t nPathBInputs = std::max(this->pathBInputChannels.size(), (size_t)1);
        this->pathBInputBuffers = AllocateAudioBuffers((int)nPathBInputs);
        effectStart = effects.size();
        auto pathBOutputs = PrepareItems(
            pedalboard.pathBItems(),
            this->pathBInputBuffers,
            errorList,
            existingEffects);
        for (size_t effectIndex = effectStart; effectIndex < effects.size(); ++effectIndex)
        {
            pathBLatencyEffects.push_back(effects[effectIndex].get());
        }

        if (nOutputs == 1)
        {
            this->pathBOutputBuffers.push_back(pathBOutputs[0]);
        }
        else if (pathBOutputs.size() == 1)
        {
            this->pathBOutputBuffers.push_back(pathBOutputs[0]);
            this->pathBOutputBuffers.push_back(pathBOutputs[0]);
        }
        else
        {
            this->pathBOutputBuffers.push_back(pathBOutputs[0]);
            this->pathBOutputBuffers.push_back(pathBOutputs[1]);
        }
    }
    for (auto &path : pedalboard.additionalPaths())
    {
        if (!path.enabled() || additionalPaths.size() >= 2)
        {
            continue;
        }
        auto runtimePath = std::make_unique<AdditionalPathRuntime>();
        runtimePath->id = path.id();
        runtimePath->inputChannels = path.inputChannels();
        runtimePath->outputChannels = path.outputChannels();
        runtimePath->sourceSendsDb = path.sourceSendsDb();
        runtimePath->mute = path.mute();
        runtimePath->pan = std::max(-1.0f, std::min(1.0f, path.pan()));
        runtimePath->inputVolume.SetSampleRate((float)this->pHost->GetSampleRate());
        runtimePath->outputVolume.SetSampleRate((float)this->pHost->GetSampleRate());
        runtimePath->inputVolume.SetMinDb(-60);
        runtimePath->outputVolume.SetMinDb(-60);
        runtimePath->inputVolume.SetTarget(path.inputVolumeDb());
        runtimePath->outputVolume.SetTarget(path.outputVolumeDb());

        const size_t pathInputCount = runtimePath->sourceSendsDb.empty()
            ? std::max(runtimePath->inputChannels.size(), (size_t)1)
            : 2;
        runtimePath->inputBuffers = AllocateAudioBuffers((int)pathInputCount);
        if (!runtimePath->sourceSendsDb.empty())
        {
            struct SendSource
            {
                const std::vector<float *> *buffers;
                float gain;
            };
            std::vector<SendSource> sendSources;
            for (const auto &[sourceId, levelDb] : runtimePath->sourceSendsDb)
            {
                const std::vector<float *> *sourceBuffers = nullptr;
                if (sourceId == "A")
                {
                    sourceBuffers = &pedalboardOutputBuffers;
                }
                else if (sourceId == "B" && pathBEnabled)
                {
                    sourceBuffers = &pathBOutputBuffers;
                }
                else
                {
                    for (const auto &previousPath : additionalPaths)
                    {
                        if (previousPath->id == sourceId)
                        {
                            sourceBuffers = &previousPath->outputBuffers;
                            break;
                        }
                    }
                }
                if (sourceBuffers != nullptr && !sourceBuffers->empty())
                {
                    sendSources.push_back({
                        sourceBuffers,
                        std::pow(10.0f, std::clamp(levelDb, -60.0f, 12.0f) / 20.0f)});
                }
            }
            const auto returnInputs = runtimePath->inputBuffers;
            processActions.push_back(
                [returnInputs, sendSources](uint32_t frames)
                {
                    for (size_t channel = 0; channel < returnInputs.size(); ++channel)
                    {
                        float *destination = returnInputs[channel];
                        for (uint32_t frame = 0; frame < frames; ++frame)
                        {
                            float value = 0;
                            for (const auto &send : sendSources)
                            {
                                const size_t sourceChannel =
                                    std::min(channel, send.buffers->size() - 1);
                                value += (*send.buffers)[sourceChannel][frame] * send.gain;
                            }
                            destination[frame] = value;
                        }
                    }
                });
        }
        effectStart = effects.size();
        auto pathOutputs = PrepareItems(
            path.items(), runtimePath->inputBuffers, errorList, existingEffects);
        for (size_t effectIndex = effectStart; effectIndex < effects.size(); ++effectIndex)
        {
            runtimePath->latencyEffects.push_back(effects[effectIndex].get());
        }
        if (nOutputs == 1)
        {
            runtimePath->outputBuffers.push_back(pathOutputs[0]);
        }
        else if (pathOutputs.size() == 1)
        {
            runtimePath->outputBuffers.push_back(pathOutputs[0]);
            runtimePath->outputBuffers.push_back(pathOutputs[0]);
        }
        else
        {
            runtimePath->outputBuffers.push_back(pathOutputs[0]);
            runtimePath->outputBuffers.push_back(pathOutputs[1]);
        }
        additionalPaths.push_back(std::move(runtimePath));
    }
    const size_t delayCapacity =
        std::max((size_t)2, (size_t)this->pHost->GetSampleRate() * 2 + 1);
    pathADelay.Prepare(delayCapacity);
    pathBDelay.Prepare(delayCapacity);
    for (auto &path : additionalPaths)
    {
        path->delay.Prepare(delayCapacity);
    }
    for (const auto &action : pedalboard.GetActiveMidiActions())
    {
        if (action.enabled())
        {
            midiActions.push_back(RuntimeMidiAction{action, 0});
        }
    }
    PrepareMidiMap(pedalboard);
}

void Lv2Pedalboard::PrepareMidiMap(const PedalboardItem &pedalboardItem)
{
    if (pedalboardItem.midiBindings().size() != 0)
    {
        Lv2PluginInfo::ptr pluginInfo;
        if (pedalboardItem.uri() == SPLIT_PEDALBOARD_ITEM_URI)
        {
            pluginInfo = GetSplitterPluginInfo();
        }
        else
        {
            pluginInfo = pHost->GetPluginInfo(pedalboardItem.uri());
        }

        int effectIndex = this->GetIndexOfInstanceId(pedalboardItem.instanceId());

        if (pluginInfo && effectIndex != -1)
        {
            for (size_t bindingIndex = 0; bindingIndex < pedalboardItem.midiBindings().size(); ++bindingIndex)
            {
                auto &binding = pedalboardItem.midiBindings()[bindingIndex];
                {
                    const Lv2PortInfo *pPortInfo;
                    int controlIndex;
                    if (binding.symbol() == "__bypass")
                    {
                        pPortInfo = GetBypassPortInfo();
                        controlIndex = -1;
                    }
                    else
                    {
                        try
                        {
                            pPortInfo = &pluginInfo->getPort(binding.symbol());
                            controlIndex = this->GetControlIndex(pedalboardItem.instanceId(), binding.symbol());
                        }
                        catch (const std::exception &ignored)
                        {
                            continue;
                        }
                    }

                    MidiMapping mapping;
                    mapping.pluginInfo = pluginInfo; // for lifetime management. <shrugs> We're holding internal pointers to this. May save us in a disorderly shutdown.
                    mapping.pPortInfo = pPortInfo;
                    mapping.effectIndex = effectIndex;
                    mapping.controlIndex = controlIndex;
                    mapping.midiBinding = binding;
                    mapping.instanceId = pedalboardItem.instanceId();

                    if (pPortInfo->mod_momentaryOffByDefault() || pPortInfo->mod_momentaryOnByDefault())
                    {
                        mapping.mappingType = MidiControlType::MomentarySwitch;
                    }
                    else if (pPortInfo->trigger_property())
                    {
                        mapping.mappingType = MidiControlType::Trigger;
                    }
                    else if (pPortInfo->IsSwitch())
                    {
                        mapping.mappingType = MidiControlType::Toggle;
                    }
                    else if (pPortInfo->enumeration_property())
                    {
                        mapping.mappingType = MidiControlType::Select;
                    }
                    else if (binding.bindingType() == BINDING_TYPE_TAP_TEMPO) {
                        mapping.mappingType = MidiControlType::TapTempo;
                    }
                    else
                    {
                        mapping.mappingType = MidiControlType::Dial;
                    }
                    if (binding.bindingType() == BINDING_TYPE_NOTE || binding.bindingType() == BINDING_TYPE_TAP_TEMPO)
                    {
                        mapping.key = 0x9000 | binding.note(); // i.e. midi note on.
                    }
                    else if (binding.bindingType() == BINDING_TYPE_CONTROL)
                    {
                        mapping.key = 0xB000 | binding.control(); // i.e. midi control
                    }
                    else
                    {
                        mapping.key = -1;
                    }
                    if (mapping.key != -1)
                    {
                        midiMappings.push_back(std::move(mapping));
                    }
                }
            }
        }
    }
    for (size_t i = 0; i < pedalboardItem.topChain().size(); ++i)
    {
        PrepareMidiMap(pedalboardItem.topChain()[i]);
    }
    for (size_t i = 0; i < pedalboardItem.bottomChain().size(); ++i)
    {
        PrepareMidiMap(pedalboardItem.bottomChain()[i]);
    }
}
void Lv2Pedalboard::PrepareMidiMap(const Pedalboard &pedalboard)
{
    for (size_t i = 0; i < pedalboard.items().size(); ++i)
    {
        auto &item = pedalboard.items()[i];
        PrepareMidiMap(item);
    }
    if (pedalboard.pathBEnabled())
    {
        for (const auto &item : pedalboard.pathBItems())
        {
            PrepareMidiMap(item);
        }
    }
    for (const auto &path : pedalboard.additionalPaths())
    {
        if (!path.enabled())
        {
            continue;
        }
        for (const auto &item : path.items())
        {
            PrepareMidiMap(item);
        }
    }
    std::sort(this->midiMappings.begin(), this->midiMappings.end(),
              [](const MidiMapping &left, const MidiMapping &right)
              { return left.key < right.key; });
}

void Lv2Pedalboard::UpdateAudioPorts()
{
    for (int i = 0; i < this->effects.size(); ++i)
    {
        IEffect *effect = this->realtimeEffects[i];
        if (effect->IsLv2Effect())
        {
            Lv2Effect *lv2Effect = (Lv2Effect *)effect;
            lv2Effect->UpdateAudioPorts();
        }
    }
}

void Lv2Pedalboard::Activate()
{
    CrashGuardLock crashGuardLock;

    for (int i = 0; i < this->effects.size(); ++i)
    {
        this->realtimeEffects[i]->Activate();
    }
}
void Lv2Pedalboard::Deactivate()
{
    for (int i = 0; i < this->effects.size(); ++i)
    {
        this->realtimeEffects[i]->Deactivate();
    }
}

static void Copy(float *restrict input, float *restrict output, uint32_t samples)
{
    for (uint32_t i = 0; i < samples; ++i)
    {
        output[i] = input[i];
    }
}
bool Lv2Pedalboard::Run(
    float **inputBuffers,
    float **outputBuffers,
    float **pathBHardwareInputBuffers,
    float *const *const *additionalPathHardwareInputBuffers,
    size_t additionalPathHardwareInputCount,
    float *const *directOutputBuffers,
    size_t directOutputBufferCount,
    uint32_t samples,
    RealtimeRingBufferWriter *ringBufferWriter)
{
    this->ringBufferWriter = ringBufferWriter;
    for (size_t i = 0; i < this->pedalboardInputBuffers.size(); ++i)
    {
        if (inputBuffers[i] == nullptr)
        {
            return false;
        }
    }

    for (size_t i = 0; i < samples; ++i)
    {
        float volume = this->inputVolume.Tick();
        for (int c = 0; c < this->pedalboardInputBuffers.size(); ++c)
        {
            this->pedalboardInputBuffers[c][i] = inputBuffers[c][i] * volume;
        }
    }
    if (this->pathBEnabled)
    {
        for (size_t i = 0; i < samples; ++i)
        {
            float volume = this->pathBInputVolume.Tick();
            for (size_t c = 0; c < this->pathBInputBuffers.size(); ++c)
            {
                float *source = pathBHardwareInputBuffers == nullptr
                    ? nullptr
                    : pathBHardwareInputBuffers[c];
                this->pathBInputBuffers[c][i] = source == nullptr
                    ? 0
                    : source[i] * volume;
            }
        }
    }
    for (size_t pathIndex = 0; pathIndex < additionalPaths.size(); ++pathIndex)
    {
        auto &path = *additionalPaths[pathIndex];
        float *const *hardwareInputs =
            additionalPathHardwareInputBuffers != nullptr &&
            pathIndex < additionalPathHardwareInputCount
                ? additionalPathHardwareInputBuffers[pathIndex]
                : nullptr;
        for (size_t i = 0; i < samples; ++i)
        {
            float volume = path.inputVolume.Tick();
            for (size_t channel = 0; channel < path.inputBuffers.size(); ++channel)
            {
                float *source = hardwareInputs == nullptr ? nullptr : hardwareInputs[channel];
                path.inputBuffers[channel][i] = source == nullptr ? 0 : source[i] * volume;
            }
        }
    }
    for (int i = 0; i < this->processActions.size(); ++i)
    {
        processActions[i](samples);
    }
    for (size_t i = 0; i < this->effects.size(); ++i)
    {
        IEffect *effect = effects[i].get();
        if (effect->HasErrorMessage())
        {
            ringBufferWriter->WriteLv2ErrorMessage(effect->GetInstanceId(), effect->TakeErrorMessage());
        }
    }
    auto getPathLatency = [](const std::vector<IEffect *> &pathEffects)
    {
        uint64_t result = 0;
        for (const auto *effect : pathEffects)
        {
            result += effect->GetLatencySamples();
        }
        return (uint32_t)std::min(result, (uint64_t)UINT32_MAX);
    };
    const uint32_t pathALatency = getPathLatency(pathALatencyEffects);
    const uint32_t pathBLatency =
        pathBEnabled ? getPathLatency(pathBLatencyEffects) : 0;
    std::array<uint32_t, 2> additionalPathLatencies = {0, 0};
    uint32_t maximumPathLatency = std::max(pathALatency, pathBLatency);
    for (size_t pathIndex = 0; pathIndex < additionalPaths.size(); ++pathIndex)
    {
        auto &path = *additionalPaths[pathIndex];
        uint32_t sourceLatency = 0;
        for (const auto &[sourceId, unusedLevel] : path.sourceSendsDb)
        {
            (void)unusedLevel;
            if (sourceId == "A")
            {
                sourceLatency = std::max(sourceLatency, pathALatency);
            }
            else if (sourceId == "B")
            {
                sourceLatency = std::max(sourceLatency, pathBLatency);
            }
            else
            {
                for (size_t previousIndex = 0; previousIndex < pathIndex; ++previousIndex)
                {
                    if (additionalPaths[previousIndex]->id == sourceId)
                    {
                        sourceLatency = std::max(
                            sourceLatency,
                            additionalPathLatencies[previousIndex]);
                        break;
                    }
                }
            }
        }
        additionalPathLatencies[pathIndex] =
            sourceLatency + getPathLatency(path.latencyEffects);
        maximumPathLatency = std::max(
            maximumPathLatency,
            additionalPathLatencies[pathIndex]);
    }
    auto hasDirectOutput = [directOutputBufferCount](
                               const std::vector<int64_t> &channels)
    {
        for (int64_t channel : channels)
        {
            if (channel >= 0 && (size_t)channel < directOutputBufferCount)
            {
                return true;
            }
        }
        return false;
    };
    const bool pathADirect = hasDirectOutput(pathAOutputChannels);
    const bool pathBDirect = hasDirectOutput(pathBOutputChannels);
    std::array<bool, 2> additionalPathDirect = {false, false};
    for (size_t pathIndex = 0; pathIndex < additionalPaths.size(); ++pathIndex)
    {
        additionalPathDirect[pathIndex] =
            hasDirectOutput(additionalPaths[pathIndex]->outputChannels);
    }
    auto addDirectOutput = [
        directOutputBuffers,
        directOutputBufferCount](
            const std::vector<int64_t> &channels,
            size_t frame,
            float left,
            float right)
    {
        if (directOutputBuffers == nullptr || channels.empty())
        {
            return;
        }
        if (channels.size() == 1)
        {
            const int64_t channel = channels[0];
            if (channel >= 0 && (size_t)channel < directOutputBufferCount &&
                directOutputBuffers[channel] != nullptr)
            {
                directOutputBuffers[channel][frame] += 0.5f * (left + right);
            }
            return;
        }
        const float values[2] = {left, right};
        for (size_t sourceChannel = 0; sourceChannel < 2; ++sourceChannel)
        {
            const int64_t channel = channels[sourceChannel];
            if (channel >= 0 && (size_t)channel < directOutputBufferCount &&
                directOutputBuffers[channel] != nullptr)
            {
                directOutputBuffers[channel][frame] += values[sourceChannel];
            }
        }
    };
    // Fast path for the common single-path case: no path B, no extra paths, no
    // direct outputs, no global EQ, centred pan, unmuted, and latency-aligned
    // (delay == 0, which makes the delay compensators pure pass-through). This
    // avoids the per-sample delay-line reads/writes, modulo ops, pan branches
    // and array zero-inits that the general mixer below would otherwise run on
    // every sample even when none of those features are engaged.
    const bool simpleOutput =
        !this->pathBEnabled &&
        this->additionalPaths.empty() &&
        !pathADirect &&
        !this->globalEqEnabled &&
        this->pathAPan == 0.0f &&
        !this->pathAMute &&
        maximumPathLatency == pathALatency;
    if (simpleOutput)
    {
        const size_t lastChannel = this->pedalboardOutputBuffers.size() - 1;
        for (size_t i = 0; i < samples; ++i)
        {
            float volume = outputVolume.Tick();
            for (size_t c = 0; c < 2 && outputBuffers[c] != nullptr; ++c)
            {
                outputBuffers[c][i] =
                    this->pedalboardOutputBuffers[std::min(c, lastChannel)][i] * volume;
            }
        }
        this->currentFrameOffset += samples;
        return true;
    }
    for (size_t i = 0; i < samples; ++i)
    {
        float volume = this->pathAMute ? 0 : outputVolume.Tick();
        float pathBVolume = this->pathBEnabled && !this->pathBMute ? pathBOutputVolume.Tick() : 0;
        std::array<float, 2> additionalPathVolumes = {0, 0};
        for (size_t pathIndex = 0; pathIndex < additionalPaths.size(); ++pathIndex)
        {
            auto &path = *additionalPaths[pathIndex];
            additionalPathVolumes[pathIndex] = path.mute ? 0 : path.outputVolume.Tick();
        }
        std::array<float, 2> pathAValues = {0, 0};
        std::array<float, 2> pathBValues = {0, 0};
        std::array<std::array<float, 2>, 2> additionalPathValues = {};
        for (size_t c = 0; c < 2; ++c)
        {
            float pathAGain = c == 0
                ? (this->pathAPan > 0 ? 1.0f - this->pathAPan : 1.0f)
                : (this->pathAPan < 0 ? 1.0f + this->pathAPan : 1.0f);
            float pathBGain = c == 0
                ? (this->pathBPan > 0 ? 1.0f - this->pathBPan : 1.0f)
                : (this->pathBPan < 0 ? 1.0f + this->pathBPan : 1.0f);
            const size_t pathAChannel = std::min(
                c, this->pedalboardOutputBuffers.size() - 1);
            const float pathARaw =
                this->pedalboardOutputBuffers[pathAChannel][i] *
                volume *
                pathAGain;
            const size_t pathBChannel = this->pathBOutputBuffers.empty()
                ? 0
                : std::min(c, this->pathBOutputBuffers.size() - 1);
            const float pathBRaw = this->pathBEnabled
                ? this->pathBOutputBuffers[pathBChannel][i] *
                    pathBVolume *
                    pathBGain
                : 0;
            pathAValues[c] = pathADelay.Process(
                c, pathARaw, maximumPathLatency - pathALatency);
            pathBValues[c] = pathBDelay.Process(
                c, pathBRaw, maximumPathLatency - pathBLatency);
            for (size_t pathIndex = 0; pathIndex < additionalPaths.size(); ++pathIndex)
            {
                auto &path = *additionalPaths[pathIndex];
                float pathGain = c == 0
                    ? (path.pan > 0 ? 1.0f - path.pan : 1.0f)
                    : (path.pan < 0 ? 1.0f + path.pan : 1.0f);
                const float pathRaw =
                    c < path.outputBuffers.size()
                        ? path.outputBuffers[c][i] *
                            additionalPathVolumes[pathIndex] *
                            pathGain
                        : 0;
                additionalPathValues[pathIndex][c] = path.delay.Process(
                    c,
                    pathRaw,
                    maximumPathLatency - additionalPathLatencies[pathIndex]);
            }
        }
        if (pathADirect)
        {
            addDirectOutput(
                pathAOutputChannels, i, pathAValues[0], pathAValues[1]);
        }
        if (pathBDirect)
        {
            addDirectOutput(
                pathBOutputChannels, i, pathBValues[0], pathBValues[1]);
        }
        for (size_t pathIndex = 0; pathIndex < additionalPaths.size(); ++pathIndex)
        {
            if (additionalPathDirect[pathIndex])
            {
                addDirectOutput(
                    additionalPaths[pathIndex]->outputChannels,
                    i,
                    additionalPathValues[pathIndex][0],
                    additionalPathValues[pathIndex][1]);
            }
        }
        for (size_t c = 0;
             c < 2 && outputBuffers[c] != nullptr;
             ++c)
        {
            float value = pathADirect ? 0 : pathAValues[c];
            if (this->pathBEnabled && !pathBDirect)
            {
                value += pathBValues[c];
            }
            for (size_t pathIndex = 0;
                 pathIndex < additionalPaths.size();
                 ++pathIndex)
            {
                if (!additionalPathDirect[pathIndex])
                {
                    value += additionalPathValues[pathIndex][c];
                }
            }
            if (this->globalEqEnabled && c < this->globalEq.size())
            {
                for (auto &filter : this->globalEq[c])
                {
                    value = filter.Process(value);
                }
            }
            outputBuffers[c][i] = value;
        }
        pathADelay.Advance();
        pathBDelay.Advance();
        for (auto &path : additionalPaths)
        {
            path->delay.Advance();
        }
    }
    this->currentFrameOffset += samples;

    return true;
}

float Lv2Pedalboard::GetControlOutputValue(int effectIndex, int portIndex)
{
    auto effect = realtimeEffects[effectIndex];
    return effect->GetOutputControlValue(portIndex);
}

void Lv2Pedalboard::SetControlValue(int effectIndex, int index, float value)
{
    auto effect = realtimeEffects[effectIndex];
    effect->SetControl(index, value);
}
void Lv2Pedalboard::SetBypass(int effectIndex, bool enabled)
{
    auto effect = realtimeEffects[effectIndex];
    effect->SetBypass(enabled);
}


void Lv2Pedalboard::ComputeVus(RealtimeVuBuffers *realtimeVuBuffers, uint32_t samples)
{
    if (realtimeVuBuffers == nullptr) 
    {
        return;
    }
    for (size_t i = 0; i < realtimeVuBuffers->enabledIndexes.size(); ++i)
    {
        auto& rtIndex = realtimeVuBuffers->enabledIndexes[i];
        int index = rtIndex.index;
        if (index == -1) continue;
        VuUpdateX *pUpdate = &realtimeVuBuffers->vuUpdateWorkingData[i];
        if (index == Pedalboard::START_CONTROL_ID)
        {
            if (this->pedalboardInputBuffers.size() == 2)
            {
                // input is handled by master VU updates.
                pUpdate->AccumulateOutputs(&(this->pedalboardInputBuffers[0][0]), &(this->pedalboardInputBuffers[1][0]), samples); // after outputVolume applied.
            }
            else if (this->pedalboardInputBuffers.size() == 1)
            {
                pUpdate->AccumulateOutputs(&(this->pedalboardInputBuffers[0][0]), samples); // before input volume applied.
                // output is handled by master VU updates.
            }
        }
        else if (index == Pedalboard::END_CONTROL_ID)
        {
            if (this->pedalboardOutputBuffers.size() == 2)
            {
                pUpdate->AccumulateInputs(&(this->pedalboardOutputBuffers[0][0]), &(this->pedalboardOutputBuffers[1][0]), samples);
            }
            else if (this->pedalboardOutputBuffers.size() == 1)
            {
                pUpdate->AccumulateInputs(&(this->pedalboardOutputBuffers[0][0]), samples);
            }
        }
        else if (index == Pedalboard::AUX_START_CONTROL_ID)
        {
            if (!this->pathBEnabled)
            {
                continue;
            }
            if (this->pathBInputBuffers.size() >= 2)
            {
                pUpdate->AccumulateOutputs(
                    this->pathBInputBuffers[0],
                    this->pathBInputBuffers[1],
                    samples);
            }
            else if (this->pathBInputBuffers.size() == 1)
            {
                pUpdate->AccumulateOutputs(this->pathBInputBuffers[0], samples);
            }
        }
        else if (index == Pedalboard::AUX_END_CONTROL_ID)
        {
            if (!this->pathBEnabled)
            {
                continue;
            }
            if (this->pathBOutputBuffers.size() >= 2)
            {
                pUpdate->AccumulateInputs(
                    this->pathBOutputBuffers[0],
                    this->pathBOutputBuffers[1],
                    samples);
            }
            else if (this->pathBOutputBuffers.size() == 1)
            {
                pUpdate->AccumulateInputs(this->pathBOutputBuffers[0], samples);
            }
        }
        else if (
            index == Pedalboard::PATH_C_START_CONTROL_ID ||
            index == Pedalboard::PATH_C_END_CONTROL_ID ||
            index == Pedalboard::PATH_D_START_CONTROL_ID ||
            index == Pedalboard::PATH_D_END_CONTROL_ID)
        {
            const std::string pathId =
                (index == Pedalboard::PATH_C_START_CONTROL_ID ||
                 index == Pedalboard::PATH_C_END_CONTROL_ID)
                    ? "C"
                    : "D";
            const bool isInput =
                index == Pedalboard::PATH_C_START_CONTROL_ID ||
                index == Pedalboard::PATH_D_START_CONTROL_ID;
            for (const auto &path : additionalPaths)
            {
                if (path->id != pathId)
                {
                    continue;
                }
                const auto &buffers = isInput ? path->inputBuffers : path->outputBuffers;
                if (buffers.size() >= 2)
                {
                    if (isInput)
                        pUpdate->AccumulateOutputs(buffers[0], buffers[1], samples);
                    else
                        pUpdate->AccumulateInputs(buffers[0], buffers[1], samples);
                }
                else if (buffers.size() == 1)
                {
                    if (isInput)
                        pUpdate->AccumulateOutputs(buffers[0], samples);
                    else
                        pUpdate->AccumulateInputs(buffers[0], samples);
                }
                break;
            }
        }
        else
        {
            auto effect = this->realtimeEffects[index];

            if (effect->GetNumberOfInputAudioBuffers() == 1)
            {
                pUpdate->AccumulateInputs(effect->GetAudioInputBuffer(0), samples);
            }
            else if (effect->GetNumberOfInputAudioBuffers() >= 2)
            {
                pUpdate->AccumulateInputs(
                    effect->GetAudioInputBuffer(0),
                    effect->GetAudioInputBuffer(1), samples);
            }
            if (effect->GetNumberOfOutputAudioBuffers() == 1)
            {
                pUpdate->AccumulateOutputs(effect->GetAudioOutputBuffer(0), samples);
            }
            else if (effect->GetNumberOfOutputAudioBuffers() >= 2)
            {
                pUpdate->AccumulateOutputs(
                    effect->GetAudioOutputBuffer(0),
                    effect->GetAudioOutputBuffer(1),
                    samples);
            }
        }
    }
}

void Lv2Pedalboard::ResetAtomBuffers()
{
    for (size_t i = 0; i < this->effects.size(); ++i)
    {
        auto effect = this->effects[i];
        effect->ResetAtomBuffers();
    }
}

void Lv2Pedalboard::GatherPathPatchProperties(IPatchWriterCallback *cbPatchWriter)
{
    for (auto &pEffect : this->effects)
    {
        if (pEffect->IsLv2Effect())
        {
            Lv2Effect *pLv2Effect = (Lv2Effect *)pEffect.get();
            pLv2Effect->GatherPathPatchProperties(cbPatchWriter);
        }
    }
}

void Lv2Pedalboard::ProcessParameterRequests(RealtimePatchPropertyRequest *pParameterRequests, size_t samplesThisTime)
{
    while (pParameterRequests != nullptr)
    {
        pParameterRequests->sampleTimeout -= samplesThisTime;
        IEffect *pEffect = this->GetEffect(pParameterRequests->instanceId);

        if (pEffect == nullptr)
        {
            pParameterRequests->errorMessage = "No such effect.";
        }
        else if (pEffect->IsVst3())
        {
            pParameterRequests->errorMessage = "Not supported for VST3 plugins";
        }
        else if (pParameterRequests->sampleTimeout < 0)
        {
            pParameterRequests->sampleTimeout = 0;
            pParameterRequests->errorMessage = "Timed out.";
        }
        else
        {
            if (pEffect->IsLv2Effect())
            {
                Lv2Effect *pLv2Effect = dynamic_cast<Lv2Effect *>(pEffect);

                if (pParameterRequests->requestType == RealtimePatchPropertyRequest::RequestType::PatchGet)
                {
                    pLv2Effect->RequestPatchProperty(pParameterRequests->uridUri);
                }
                else if (pParameterRequests->requestType == RealtimePatchPropertyRequest::RequestType::PatchSet)
                {
                    pLv2Effect->SetPatchProperty(
                        pParameterRequests->uridUri,
                        pParameterRequests->GetSize(),
                        (LV2_Atom *)pParameterRequests->GetBuffer());
                    pLv2Effect->SetRequestStateChangedNotification(true);
                }
            }
        }
        pParameterRequests = pParameterRequests->pNext;
    }
}

void Lv2Pedalboard::GatherPatchProperties(RealtimePatchPropertyRequest *pParameterRequests)
{
    while (pParameterRequests != nullptr)
    {
        if (pParameterRequests->requestType == RealtimePatchPropertyRequest::RequestType::PatchGet)
        {
            IEffect *effect = this->GetEffect(pParameterRequests->instanceId);
            if (effect == nullptr)
            {
                pParameterRequests->errorMessage = "No such effect.";
            }
            else if (effect->IsVst3())
            {
                pParameterRequests->errorMessage = "Not supported for VST3";
            }
            else
            {
                if (effect->IsLv2Effect())
                {
                    Lv2Effect *pLv2Effect = dynamic_cast<Lv2Effect *>(effect);
                    pLv2Effect->GatherPatchProperties(pParameterRequests);
                }
            }
        }

        pParameterRequests = pParameterRequests->pNext;
    }
}

int Lv2Pedalboard::GetMidiActionTogglePosition(int key) const
{
    for (const auto &state : midiActionToggleStates)
    {
        if (state.valid && state.key == key)
        {
            return state.position;
        }
    }
    return 1;
}

void Lv2Pedalboard::AdvanceMidiActionToggle(
    int key,
    int currentPosition,
    int toggleGroup,
    int resetGroup)
{
    MidiActionToggleState *target = nullptr;
    for (auto &state : midiActionToggleStates)
    {
        if (state.valid && resetGroup != 0 &&
            state.group == resetGroup && state.key != key)
        {
            state.position = 1;
        }
        if (state.valid && state.key == key)
        {
            target = &state;
        }
        else if (!state.valid && target == nullptr)
        {
            target = &state;
        }
    }
    if (target == nullptr)
    {
        return;
    }

    target->valid = true;
    target->key = key;
    target->position = currentPosition == 1 ? 2 : 1;
    target->group = toggleGroup;
    if (toggleGroup != 0)
    {
        for (auto &state : midiActionToggleStates)
        {
            if (state.valid && state.group == toggleGroup)
            {
                state.position = target->position;
            }
        }
    }
}

size_t Lv2Pedalboard::CollectTriggeredMidiActions(
    const MidiEvent &event,
    const MidiAction **result,
    size_t capacity)
{
    if (event.size < 2 || capacity == 0)
    {
        return 0;
    }
    const uint8_t status = event.buffer[0];
    const int channel = status & 0x0F;
    const int command = status & 0xF0;
    const int number = event.buffer[1] & 0x7F;
    const uint8_t value = event.size >= 3 ? event.buffer[2] & 0x7F : 127;
    const bool notePress = command == 0x90 && value != 0;
    const bool noteRelease = command == 0x80 || (command == 0x90 && value == 0);
    const bool control = command == 0xB0;
    const bool program = command == 0xC0;
    size_t count = 0;
    int toggleKey = -1;
    int togglePosition = 1;
    int toggleGroup = 0;
    int resetGroup = 0;
    bool usesToggle = false;

    for (auto &runtimeAction : midiActions)
    {
        auto &action = runtimeAction.action;
        if ((action.channel() >= 0 && action.channel() != channel) ||
            action.number() != number)
        {
            continue;
        }
        bool bindingMatches =
            (action.bindingType() == BINDING_TYPE_NOTE && (notePress || noteRelease)) ||
            (action.bindingType() == BINDING_TYPE_CONTROL && control) ||
            (action.bindingType() == BINDING_TYPE_PROGRAM && program);
        if (!bindingMatches)
        {
            continue;
        }

        bool triggered = false;
        auto gesture = (MidiActionGesture)action.gesture();
        bool actionPress = false;
        bool actionRelease = false;
        if (action.bindingType() == BINDING_TYPE_NOTE)
        {
            actionPress = notePress;
            actionRelease = noteRelease;
            triggered =
                (gesture == MidiActionGesture::Press && notePress) ||
                (gesture == MidiActionGesture::Release && noteRelease) ||
                gesture == MidiActionGesture::AnyValue;
        }
        else if (action.bindingType() == BINDING_TYPE_CONTROL)
        {
            actionPress = value >= 64 && runtimeAction.lastValue < 64;
            actionRelease = value < 64 && runtimeAction.lastValue >= 64;
            triggered =
                (gesture == MidiActionGesture::Press && actionPress) ||
                (gesture == MidiActionGesture::Release && actionRelease) ||
                gesture == MidiActionGesture::AnyValue;
            runtimeAction.lastValue = value;
        }
        else
        {
            actionPress = true;
            triggered = true;
        }
        if (gesture == MidiActionGesture::LongPress)
        {
            if (actionPress)
            {
                runtimeAction.pressed = true;
                runtimeAction.longPressTriggered = false;
                runtimeAction.pressFrame = currentFrameOffset;
                runtimeAction.triggerKey =
                    ((action.bindingType() & 0xFF) << 16) |
                    (((channel + 1) & 0x1F) << 8) |
                    (number & 0x7F);
            }
            else if (actionRelease)
            {
                runtimeAction.pressed = false;
            }
            triggered = false;
        }
        else if (gesture == MidiActionGesture::DoublePress)
        {
            triggered = actionPress &&
                runtimeAction.previousPressFrame != 0 &&
                currentFrameOffset + 1 - runtimeAction.previousPressFrame <=
                    (uint64_t)(pHost->GetSampleRate() * 0.4);
            if (actionPress)
            {
                runtimeAction.previousPressFrame = currentFrameOffset + 1;
            }
        }
        if (!triggered)
        {
            continue;
        }

        const int key =
            ((action.bindingType() & 0xFF) << 16) |
            (((channel + 1) & 0x1F) << 8) |
            (number & 0x7F);
        if (toggleKey == -1)
        {
            toggleKey = key;
            togglePosition = GetMidiActionTogglePosition(key);
        }
        if (action.togglePosition() != 0)
        {
            usesToggle = true;
            if (action.toggleGroup() != 0) toggleGroup = action.toggleGroup();
            if (action.resetGroup() != 0) resetGroup = action.resetGroup();
        }
        if ((action.togglePosition() == 0 ||
             action.togglePosition() == togglePosition) &&
            count < capacity)
        {
            result[count++] = &action;
        }
    }

    if (usesToggle && toggleKey != -1)
    {
        AdvanceMidiActionToggle(
            toggleKey, togglePosition, toggleGroup, resetGroup);
    }
    return count;
}

size_t Lv2Pedalboard::CollectTimedMidiActions(
    const MidiAction **result,
    size_t capacity)
{
    struct DueToggle
    {
        int key;
        int position;
        int toggleGroup;
        int resetGroup;
    };
    std::array<DueToggle, 64> dueToggles;
    size_t dueToggleCount = 0;
    size_t count = 0;
    const uint64_t longPressFrames =
        (uint64_t)(pHost->GetSampleRate() * 0.6);
    for (auto &runtimeAction : midiActions)
    {
        if ((MidiActionGesture)runtimeAction.action.gesture() ==
                MidiActionGesture::LongPress &&
            runtimeAction.pressed &&
            !runtimeAction.longPressTriggered &&
            currentFrameOffset - runtimeAction.pressFrame >= longPressFrames)
        {
            runtimeAction.longPressTriggered = true;
            const auto &action = runtimeAction.action;
            const int key = runtimeAction.triggerKey;
            if (key < 0)
            {
                continue;
            }
            const int position = GetMidiActionTogglePosition(key);
            if ((action.togglePosition() == 0 ||
                 action.togglePosition() == position) &&
                count < capacity)
            {
                result[count++] = &action;
            }
            if (action.togglePosition() != 0)
            {
                size_t index = 0;
                for (; index < dueToggleCount; ++index)
                {
                    if (dueToggles[index].key == key)
                    {
                        break;
                    }
                }
                if (index == dueToggleCount && dueToggleCount < dueToggles.size())
                {
                    dueToggles[dueToggleCount++] = {
                        key,
                        position,
                        action.toggleGroup(),
                        action.resetGroup()};
                }
                else if (index < dueToggleCount)
                {
                    if (action.toggleGroup() != 0)
                    {
                        dueToggles[index].toggleGroup = action.toggleGroup();
                    }
                    if (action.resetGroup() != 0)
                    {
                        dueToggles[index].resetGroup = action.resetGroup();
                    }
                }
            }
        }
    }
    for (size_t i = 0; i < dueToggleCount; ++i)
    {
        const auto &toggle = dueToggles[i];
        AdvanceMidiActionToggle(
            toggle.key,
            toggle.position,
            toggle.toggleGroup,
            toggle.resetGroup);
    }
    return count;
}

bool Lv2Pedalboard::ExecuteInternalMidiAction(
    const MidiAction &action,
    void *callbackHandle,
    MidiCallbackFn *pfnCallback)
{
    const auto actionType = (MidiActionType)action.actionType();
    if (actionType == MidiActionType::SetPluginControl ||
        actionType == MidiActionType::TogglePluginControl ||
        actionType == MidiActionType::TogglePluginBypass)
    {
        const int effectIndex = GetIndexOfInstanceId(action.targetId());
        if (effectIndex < 0)
        {
            return true;
        }
        int controlIndex = -1;
        if (actionType != MidiActionType::TogglePluginBypass)
        {
            controlIndex = GetControlIndex(action.targetId(), action.symbol());
            if (controlIndex < 0)
            {
                return true;
            }
        }
        IEffect *effect = realtimeEffects[effectIndex];
        float value = action.value();
        if (actionType == MidiActionType::TogglePluginControl ||
            actionType == MidiActionType::TogglePluginBypass)
        {
            const float currentValue = effect->GetControlValue(controlIndex);
            value = currentValue == action.value()
                ? action.alternateValue()
                : action.value();
        }
        effect->SetControl(controlIndex, value);
        pfnCallback(callbackHandle, action.targetId(), controlIndex, value);
        return true;
    }
    if (actionType == MidiActionType::SetPathMute ||
        actionType == MidiActionType::TogglePathMute)
    {
        bool *mute = nullptr;
        if (action.symbol() == "A") mute = &pathAMute;
        else if (action.symbol() == "B") mute = &pathBMute;
        else
        {
            for (auto &path : additionalPaths)
            {
                if (path->id == action.symbol())
                {
                    mute = &path->mute;
                    break;
                }
            }
        }
        if (mute != nullptr)
        {
            *mute = actionType == MidiActionType::TogglePathMute
                ? !*mute
                : action.value() != 0;
        }
        return true;
    }
    if (actionType == MidiActionType::ToggleGlobalEq)
    {
        globalEqEnabled = !globalEqEnabled;
        return true;
    }
    return false;
}

void Lv2Pedalboard::OnMidiMessage(
    const MidiEvent&event,
    void *callbackHandle,
    MidiCallbackFn *pfnCallback)

{
    if (midiMappings.size() == 0)
        return;

    size_t size = event.size;
    const uint8_t *message = event.buffer;
    if (size < 2)
        return;
    uint8_t cmd = message[0];
    uint8_t channel = cmd & 0x0F;
    cmd &= 0xF0;

    uint8_t value;
    uint8_t index;
    if (cmd == 0x80) // note off.
    {
        index = message[1];
        cmd = 0x90;
        index = message[1];
        value = 0;
    }
    else if (cmd == 0x90) // note on.
    {
        if (size < 3)
            return;
        index = message[1];
        value = message[2] == 0 ? 0 : 127; // zero velocity = note off.
    }
    else if (cmd == 0xB0) // midi control.
    {
        if (size < 3)
            return;
        index = message[1];
        value = message[2] & 0x7F;
    }
    int searchKey = (cmd << 8) | index;
    int min = 0;
    int max = midiMappings.size() - 1;
    while (max > min)
    {
        int mid = (min + max) / 2;
        if (midiMappings[mid].key < searchKey)
        {
            min = mid + 1;
        }
        else if (midiMappings[mid].key > searchKey)
        {
            max = mid - 1;
        }
        else
        {
            if (mid == 0)
            {
                min = max = mid;
            }
            else
            {
                if (midiMappings[mid - 1].key == searchKey)
                {
                    max = mid - 1;
                }
                else
                {
                    min = max = mid;
                }
            }
        }
    }
    if (midiMappings[min].key == searchKey)
    {
        float range = value / 127.0;

        for (int i = min; i < midiMappings.size(); ++i)
        {
            MidiMapping &mapping = midiMappings[i];
            if (mapping.key != searchKey)
                break;

            if (mapping.midiBinding.channel() == -1 || mapping.midiBinding.channel() == channel)
            {
                switch (mapping.mappingType)
                {
                case MidiControlType::Trigger:
                {
                    bool triggered = false;
                    if (mapping.midiBinding.switchControlType() == SwitchControlTypeT::TRIGGER_ON_RISING_EDGE || mapping.midiBinding.bindingType() == BINDING_TYPE_NOTE)
                    {
                        if (mapping.lastValue < range)
                        {
                            if (!mapping.lastValueIncreasing)
                            {
                                triggered = true;
                            }
                            mapping.lastValueIncreasing = true;
                            mapping.lastValue = range;
                        }
                        else
                        {
                            mapping.lastValueIncreasing = false;
                            mapping.lastValue = range;
                        }
                    }
                    else
                    {
                        triggered = true;
                    }
                    if (triggered)
                    {
                        IEffect *pEffect = this->realtimeEffects[mapping.effectIndex];
                        float value = mapping.pPortInfo->max_value();
                        if (value == mapping.pPortInfo->default_value())
                        {
                            value = mapping.pPortInfo->min_value();
                        }
                        this->SetControlValue(mapping.effectIndex, mapping.controlIndex, value);
                        // do NOT notify anyone!
                    }
                    break;
                }
                case MidiControlType::Toggle:
                {
                    bool triggered = false;

                    range = std::round(range);

                    if (mapping.midiBinding.switchControlType() == SwitchControlTypeT::TOGGLE_ON_RISING_EDGE)
                    {
                        if (range > mapping.lastValue)
                        {
                            if (!mapping.lastValueIncreasing)
                            {
                                triggered = true;
                            }
                            mapping.lastValueIncreasing = true;
                            mapping.lastValue = range;
                        }
                        else
                        {
                            mapping.lastValueIncreasing = false;
                            mapping.lastValue = range;
                        }
                        if (triggered)
                        {
                            IEffect *pEffect = this->realtimeEffects[mapping.effectIndex];
                            float currentValue = pEffect->GetControlValue(mapping.controlIndex);

                            currentValue = currentValue == 0 ? 1 : 0;
                            pEffect->SetControl(mapping.controlIndex, currentValue);
                            pfnCallback(callbackHandle, mapping.instanceId, mapping.pPortInfo->index(), currentValue);
                        }
                    }
                    else if (mapping.midiBinding.switchControlType() == SwitchControlTypeT::TOGGLE_ON_VALUE)
                    {
                        triggered = true;
                        mapping.lastValue = range;
                        IEffect *pEffect = this->realtimeEffects[mapping.effectIndex];
                        float currentValue = pEffect->GetControlValue(mapping.controlIndex);
                        if (currentValue != range)
                        {
                            pEffect->SetControl(mapping.controlIndex, range);
                            pfnCallback(callbackHandle, mapping.instanceId, mapping.pPortInfo->index(), range);
                        }
                    }
                    else
                    {
                        // any control value toggles.
                        triggered = true;
                        mapping.lastValue = range;
                        IEffect *pEffect = this->realtimeEffects[mapping.effectIndex];
                        float currentValue = pEffect->GetControlValue(mapping.controlIndex);
                        currentValue = currentValue == 0 ? 1 : 0;
                        pEffect->SetControl(mapping.controlIndex, currentValue);
                        pfnCallback(callbackHandle, mapping.instanceId, mapping.pPortInfo->index(), currentValue);
                    }
                    break;
                }
                case MidiControlType::MomentarySwitch:
                {
                    IEffect *pEffect = this->realtimeEffects[mapping.effectIndex];
                    pEffect->SetControl(mapping.controlIndex, range != 0 ? mapping.pPortInfo->max_value() : mapping.pPortInfo->min_value());
                    // do NOT notify anyone!
                }
                break;

                case MidiControlType::Select:
                case MidiControlType::Dial:
                {
                    IEffect *pEffect = this->realtimeEffects[mapping.effectIndex];
                    float range = mapping.midiBinding.calculateRange(value);
                    float currentValue = mapping.pPortInfo->rangeToValue(range);
                    if (pEffect->GetControlValue(mapping.controlIndex) != currentValue)
                    {
                        this->SetControlValue(mapping.effectIndex, mapping.controlIndex, currentValue);
                        pfnCallback(callbackHandle, mapping.instanceId, mapping.pPortInfo->index(), currentValue);
                    }
                    break;
                }
                case MidiControlType::TapTempo:
                {
                    handleTapTempo(value, event.timeStamp, mapping,  callbackHandle, pfnCallback);
                    break;
                }
                case MidiControlType::None:
                default:
                    break;
                }
            }
        }
    }
}

void Lv2Pedalboard::handleTapTempo(uint8_t value, const MidiTimestamp& timestamp, MidiMapping &mapping, void *callbackHandle, MidiCallbackFn *pfnSetControlCallback)
{
    if (value != 0) // only on note on
    {
        if (!mapping.lastTapTimestamp.isEmpty())
        {
            double seconds = timestamp.timeDiff(mapping.lastTapTimestamp); 
            if (seconds > 60.0/450.0) // debounce check. (~= 450bpm)
            {
                auto units = mapping.pPortInfo->units();
                float controlValue = -1;
                switch (units)
                {
                case Units::bpm:
                {
                    controlValue = 60.0f / (float)seconds;
                    break;
                }
                case Units::hz:
                {
                    controlValue = 1.0f / (float)seconds;
                    break;
                }
                case Units::s:
                {
                    controlValue = (float)(seconds);
                    break;
                }
                case Units::ms:
                {
                    controlValue = (float)(seconds * 1000.0);
                    break;
                }
                default:
                {
                    controlValue = -1;
                }
                }
                if (mapping.pPortInfo->min_value() < mapping.pPortInfo->max_value())
                {
                    if (controlValue < mapping.pPortInfo->min_value())
                    {
                        controlValue = -1;
                    }
                    else if (controlValue > mapping.pPortInfo->max_value())
                    {
                        controlValue = -1;
                    }
                }
                else
                {
                    if (controlValue > mapping.pPortInfo->min_value())
                    {
                        controlValue = -1;
                    }
                    else if (controlValue < mapping.pPortInfo->max_value())
                    {
                        controlValue = -1;
                    }
                }
                if (controlValue != -1)
                {

                    IEffect *pEffect = this->realtimeEffects[mapping.effectIndex];
                    if (pEffect->IsLv2Effect())
                    {
                        Lv2Effect *pLv2Effect = dynamic_cast<Lv2Effect *>(pEffect);
                        pEffect->SetControl(mapping.controlIndex, controlValue);
                        pfnSetControlCallback(callbackHandle, mapping.instanceId, mapping.pPortInfo->index(), controlValue);
                    }
                }
            }
        }
        mapping.lastTapTimestamp = timestamp;
    }
}


size_t Lv2Pedalboard::GetNumberOfAudioInputChannels() const {
    return pHost->GetChannelSelection().mainInputChannels().size();
}

size_t Lv2Pedalboard::GetNumberOfAudioOutputChannels() const {
    return pHost->GetChannelSelection().mainOutputChannels().size();
}
