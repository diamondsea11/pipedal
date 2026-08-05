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

#include "pch.h"
#include "FxLoopEffect.hpp"
#include "Pedalboard.hpp"
#include "PluginHost.hpp"

#include <algorithm>
#include <cmath>

using namespace pipedal;

namespace
{
    // An unassigned channel. Blocks stay silent/inert until the user picks one.
    constexpr int UNASSIGNED_CHANNEL = -1;
    constexpr int MAX_ASSIGNABLE_CHANNEL = 63;

    constexpr float LEVEL_MIN_DB = -60.0f;
    constexpr float LEVEL_MAX_DB = 12.0f;

    constexpr float MAX_LOOP_LATENCY_MS = 200.0f;

    // Ramp times. Levels use the shared dB dezipper; mix gets a linear ramp.
    constexpr float LEVEL_RAMP_S = 0.02f;
    constexpr float MIX_RAMP_S = 0.02f;

    std::shared_ptr<Lv2PortInfo> MakeControlPort(
        const char *symbol,
        const char *name,
        int index,
        float minValue,
        float maxValue,
        float defaultValue)
    {
        auto port = std::make_shared<Lv2PortInfo>();
        port->symbol(symbol);
        port->name(name);
        port->is_input(true);
        port->is_control_port(true);
        port->index(index);
        port->min_value(minValue);
        port->max_value(maxValue);
        port->default_value(defaultValue);
        return port;
    }

    std::shared_ptr<Lv2PortInfo> MakeLevelPort(
        const char *symbol,
        const char *name,
        int index)
    {
        auto port = MakeControlPort(symbol, name, index, LEVEL_MIN_DB, LEVEL_MAX_DB, 0.0f);
        port->scale_points().push_back(Lv2ScalePoint(LEVEL_MIN_DB, "-INF"));
        return port;
    }

    std::shared_ptr<Lv2PortInfo> MakeChannelPort(
        const char *symbol,
        const char *name,
        int index,
        size_t channelCount,
        bool isOutput)
    {
        auto port = MakeControlPort(
            symbol, name, index,
            (float)UNASSIGNED_CHANNEL, (float)MAX_ASSIGNABLE_CHANNEL,
            (float)UNASSIGNED_CHANNEL);
        port->integer_property(true);
        // Render as a named drop-down of the interface's real channels instead
        // of a raw numeric dial.
        port->enumeration_property(true);
        port->scale_points().push_back(Lv2ScalePoint((float)UNASSIGNED_CHANNEL, "None"));
        // If the channel count isn't known yet (audio device not configured when
        // the plugin list is built) fall back to the full assignable range so the
        // control stays usable.
        size_t count = channelCount > 0
            ? std::min(channelCount, (size_t)(MAX_ASSIGNABLE_CHANNEL + 1))
            : (size_t)(MAX_ASSIGNABLE_CHANNEL + 1);
        const char *prefix = isOutput ? "Out " : "In ";
        for (size_t ch = 0; ch < count; ++ch)
        {
            port->scale_points().push_back(
                Lv2ScalePoint((float)ch, std::string(prefix) + std::to_string(ch + 1)));
        }
        return port;
    }

    std::shared_ptr<Lv2PortInfo> MakeMixPort(int index, float defaultPercent)
    {
        return MakeControlPort(FXLOOP_MIX_KEY, "Mix", index, 0.0f, 100.0f, defaultPercent);
    }

    void AddAudioPorts(Lv2PluginInfo &info, int channels, int firstIndex)
    {
        int index = firstIndex;
        for (int channel = 0; channel < channels; ++channel)
        {
            auto port = std::make_shared<Lv2PortInfo>();
            port->symbol(channel == 0 ? "in_l" : "in_r");
            port->name(channel == 0 ? "In L" : "In R");
            port->is_input(true);
            port->is_audio_port(true);
            port->index(index++);
            info.ports().push_back(port);
        }
        for (int channel = 0; channel < channels; ++channel)
        {
            auto port = std::make_shared<Lv2PortInfo>();
            port->symbol(channel == 0 ? "out_l" : "out_r");
            port->name(channel == 0 ? "Out L" : "Out R");
            port->is_output(true);
            port->is_audio_port(true);
            port->index(index++);
            info.ports().push_back(port);
        }
    }

    Lv2PluginInfo MakeFxLoopInfo(
        const char *uri,
        const char *name,
        const char *comment,
        FxLoopMode mode,
        size_t outputChannelCount,
        size_t inputChannelCount)
    {
        Lv2PluginInfo result;
        result.uri(uri);
        result.name(name);
        result.brand("PiPedal");
        result.label(name);
        result.author_name("PiPedal");
        result.comment(comment);
        result.plugin_class("http://lv2plug.in/ns/lv2core#UtilityPlugin");
        result.is_valid(true);

        const bool isSend = mode == FxLoopMode::SendLeft || mode == FxLoopMode::SendRight;
        const bool isReturn = mode == FxLoopMode::ReturnLeft || mode == FxLoopMode::ReturnRight;
        const bool isLoop = mode == FxLoopMode::Loop;

        if (isLoop || isSend)
        {
            result.ports().push_back(
                MakeLevelPort(FXLOOP_SEND_LEVEL_KEY, "Send", FxLoopEffect::SEND_LEVEL_CTL));
        }
        if (isLoop || isReturn)
        {
            result.ports().push_back(
                MakeLevelPort(FXLOOP_RETURN_LEVEL_KEY, "Return", FxLoopEffect::RETURN_LEVEL_CTL));
        }
        if (isLoop || isReturn)
        {
            // Helix semantics: 0% bypasses the loop entirely, 100% is fully wet.
            result.ports().push_back(MakeMixPort(FxLoopEffect::MIX_CTL, 100.0f));
        }
        if (isLoop || isSend)
        {
            result.ports().push_back(
                MakeChannelPort(FXLOOP_SEND_CHANNEL_KEY,
                                isLoop ? "Send Ch L" : "Send Ch",
                                FxLoopEffect::SEND_CHANNEL_CTL,
                                outputChannelCount, /*isOutput=*/true));
        }
        if (isLoop)
        {
            result.ports().push_back(
                MakeChannelPort(FXLOOP_SEND_CHANNEL_R_KEY, "Send Ch R",
                                FxLoopEffect::SEND_CHANNEL_R_CTL,
                                outputChannelCount, /*isOutput=*/true));
        }
        if (isLoop || isReturn)
        {
            result.ports().push_back(
                MakeChannelPort(FXLOOP_RETURN_CHANNEL_KEY,
                                isLoop ? "Return Ch L" : "Return Ch",
                                FxLoopEffect::RETURN_CHANNEL_CTL,
                                inputChannelCount, /*isOutput=*/false));
        }
        if (isLoop)
        {
            result.ports().push_back(
                MakeChannelPort(FXLOOP_RETURN_CHANNEL_R_KEY, "Return Ch R",
                                FxLoopEffect::RETURN_CHANNEL_R_CTL,
                                inputChannelCount, /*isOutput=*/false));
        }
        if (isLoop || isReturn)
        {
            // Measured round-trip time of the external gear. Only used to align
            // parallel paths; it does not delay this block's own audio.
            auto port = MakeControlPort(
                FXLOOP_LATENCY_KEY, "Loop Lat", FxLoopEffect::LOOP_LATENCY_CTL,
                0.0f, MAX_LOOP_LATENCY_MS, 0.0f);
            port->scale_points().push_back(Lv2ScalePoint(0.0f, "Off"));
            result.ports().push_back(port);
        }

        AddAudioPorts(result, isLoop ? 2 : 1, FxLoopEffect::MAX_INPUT_CONTROL);
        return result;
    }

    struct FxLoopCatalogEntry
    {
        const char *uri;
        const char *name;
        const char *comment;
        FxLoopMode mode;
    };

    // Static metadata only. The actual Lv2PluginInfo (with channel drop-downs
    // sized to the current interface) is built on demand -- see GetFxLoopPluginInfo.
    const std::vector<FxLoopCatalogEntry> &Catalog()
    {
        static const std::vector<FxLoopCatalogEntry> catalog = {
            {FXLOOP_PEDALBOARD_ITEM_URI, "FX Loop",
             "Stereo insert point for external hardware: sends the signal to a "
             "pair of physical outputs and blends the physical inputs back in.",
             FxLoopMode::Loop},
            {SEND_L_PEDALBOARD_ITEM_URI, "Send L",
             "Taps the left/mono chain signal to a physical output. The chain "
             "itself passes through unchanged.",
             FxLoopMode::SendLeft},
            {SEND_R_PEDALBOARD_ITEM_URI, "Send R",
             "Taps the right chain signal to a physical output. The chain "
             "itself passes through unchanged.",
             FxLoopMode::SendRight},
            {RETURN_L_PEDALBOARD_ITEM_URI, "Return L",
             "Blends a physical input into the left/mono side of the chain.",
             FxLoopMode::ReturnLeft},
            {RETURN_R_PEDALBOARD_ITEM_URI, "Return R",
             "Blends a physical input into the right side of the chain.",
             FxLoopMode::ReturnRight},
        };
        return catalog;
    }

    const FxLoopCatalogEntry *FindEntry(const std::string &uri)
    {
        for (const auto &entry : Catalog())
        {
            if (uri == entry.uri)
            {
                return &entry;
            }
        }
        return nullptr;
    }
} // namespace

bool pipedal::IsFxLoopUri(const std::string &uri)
{
    return FindEntry(uri) != nullptr;
}

FxLoopMode pipedal::FxLoopModeFromUri(const std::string &uri)
{
    const auto *entry = FindEntry(uri);
    return entry ? entry->mode : FxLoopMode::Loop;
}

std::shared_ptr<Lv2PluginInfo> pipedal::GetFxLoopPluginInfo(
    const std::string &uri, size_t outputChannelCount, size_t inputChannelCount)
{
    const auto *entry = FindEntry(uri);
    if (!entry)
    {
        return nullptr;
    }
    return std::make_shared<Lv2PluginInfo>(MakeFxLoopInfo(
        entry->uri, entry->name, entry->comment, entry->mode,
        outputChannelCount, inputChannelCount));
}

std::vector<std::shared_ptr<Lv2PluginInfo>> pipedal::GetAllFxLoopPluginInfos(
    size_t outputChannelCount, size_t inputChannelCount)
{
    std::vector<std::shared_ptr<Lv2PluginInfo>> result;
    for (const auto &entry : Catalog())
    {
        result.push_back(std::make_shared<Lv2PluginInfo>(MakeFxLoopInfo(
            entry.uri, entry.name, entry.comment, entry.mode,
            outputChannelCount, inputChannelCount)));
    }
    return result;
}

FxLoopEffect::FxLoopEffect(
    uint64_t instanceId_,
    FxLoopMode mode_,
    double sampleRate_,
    const HardwareLoopBuffers *hardwareBuffers_)
    : instanceId(instanceId_),
      mode(mode_),
      sampleRate(sampleRate_),
      hardwareBuffers(hardwareBuffers_)
{
    for (int i = 0; i < MAX_INPUT_CONTROL; ++i)
    {
        controlValues[i] = GetDefaultInputControlValue((uint64_t)i);
    }

    sendLevel.SetSampleRate(sampleRate);
    returnLevel.SetSampleRate(sampleRate);
    sendLevel.SetMinDb(LEVEL_MIN_DB);
    returnLevel.SetMinDb(LEVEL_MIN_DB);
    sendLevel.SetRate(LEVEL_RAMP_S);
    returnLevel.SetRate(LEVEL_RAMP_S);

    mixStep = (float)(1.0 / std::max(1.0, sampleRate * MIX_RAMP_S));

    SetChannelCount(mode == FxLoopMode::Loop ? 2 : 1);
    UpdateTargets();
    mixCurrent = mixTarget;
}

void FxLoopEffect::SetChannelCount(int channels)
{
    channelCount = std::clamp(channels, 1, 2);
    inputBuffers.assign((size_t)channelCount, nullptr);
    outputBuffers.assign((size_t)channelCount, nullptr);
}

void FxLoopEffect::SetAudioInputBuffer(int index, float *buffer)
{
    if (index >= 0 && (size_t)index < inputBuffers.size())
    {
        inputBuffers[(size_t)index] = buffer;
    }
}

void FxLoopEffect::SetAudioOutputBuffer(int index, float *buffer)
{
    if (index >= 0 && (size_t)index < outputBuffers.size())
    {
        outputBuffers[(size_t)index] = buffer;
    }
}

void FxLoopEffect::Activate()
{
    UpdateTargets();
    sendLevel.Reset(controlValues[SEND_LEVEL_CTL]);
    returnLevel.Reset(controlValues[RETURN_LEVEL_CTL]);
    mixCurrent = mixTarget;
}

bool FxLoopEffect::IsInputControl(uint64_t index) const
{
    return index < (uint64_t)MAX_INPUT_CONTROL;
}

float FxLoopEffect::GetDefaultInputControlValue(uint64_t index) const
{
    switch ((int)index)
    {
    case SEND_LEVEL_CTL:
    case RETURN_LEVEL_CTL:
        return 0.0f; // 0 dB, unity
    case MIX_CTL:
        return 100.0f; // fully wet, i.e. a plain series insert
    case SEND_CHANNEL_CTL:
    case SEND_CHANNEL_R_CTL:
    case RETURN_CHANNEL_CTL:
    case RETURN_CHANNEL_R_CTL:
        return (float)UNASSIGNED_CHANNEL;
    case LOOP_LATENCY_CTL:
        return 0.0f; // no compensation unless the user measures the loop
    default:
        return 0.0f;
    }
}

int FxLoopEffect::GetControlIndex(const std::string &symbol) const
{
    if (symbol == FXLOOP_SEND_LEVEL_KEY) return SEND_LEVEL_CTL;
    if (symbol == FXLOOP_RETURN_LEVEL_KEY) return RETURN_LEVEL_CTL;
    if (symbol == FXLOOP_MIX_KEY) return MIX_CTL;
    if (symbol == FXLOOP_SEND_CHANNEL_KEY) return SEND_CHANNEL_CTL;
    if (symbol == FXLOOP_SEND_CHANNEL_R_KEY) return SEND_CHANNEL_R_CTL;
    if (symbol == FXLOOP_RETURN_CHANNEL_KEY) return RETURN_CHANNEL_CTL;
    if (symbol == FXLOOP_RETURN_CHANNEL_R_KEY) return RETURN_CHANNEL_R_CTL;
    if (symbol == FXLOOP_LATENCY_KEY) return LOOP_LATENCY_CTL;
    return -1;
}

void FxLoopEffect::SetControl(int index, float value)
{
    if (index == -1)
    {
        SetBypass(value != 0);
        return;
    }
    if (index < 0 || index >= MAX_INPUT_CONTROL)
    {
        return;
    }
    controlValues[index] = value;
    UpdateTargets();
}

float FxLoopEffect::GetControlValue(int index) const
{
    if (index == -1)
    {
        return bypassed ? 0.0f : 1.0f;
    }
    if (index < 0 || index >= MAX_INPUT_CONTROL)
    {
        return 0.0f;
    }
    return controlValues[index];
}

void FxLoopEffect::SetBypass(bool enabled)
{
    // PiPedal's convention: "enabled" true means the block is active.
    const bool newBypassed = !enabled;
    if (newBypassed != bypassed)
    {
        bypassed = newBypassed;
        UpdateTargets();
    }
}

void FxLoopEffect::UpdateTargets()
{
    // While bypassed the block passes dry audio, but keeps feeding the send so
    // that reverb/delay tails in the outboard gear do not cut off abruptly and
    // click when the block is switched back on.
    const float mixPercent = bypassed ? 0.0f : controlValues[MIX_CTL];
    mixTarget = std::clamp(mixPercent, 0.0f, 100.0f) * 0.01f;

    sendLevel.SetTarget(std::clamp(controlValues[SEND_LEVEL_CTL], LEVEL_MIN_DB, LEVEL_MAX_DB));
    returnLevel.SetTarget(std::clamp(controlValues[RETURN_LEVEL_CTL], LEVEL_MIN_DB, LEVEL_MAX_DB));

    const float latencyMs = std::clamp(controlValues[LOOP_LATENCY_CTL], 0.0f, MAX_LOOP_LATENCY_MS);
    latencySamples = (uint32_t)std::lround(latencyMs * 0.001 * sampleRate);
}

float *FxLoopEffect::ResolveDirectOutput(int channel) const
{
    if (hardwareBuffers == nullptr || channel < 0)
    {
        return nullptr;
    }
    if ((size_t)channel >= hardwareBuffers->directOutputCount ||
        hardwareBuffers->directOutputs == nullptr)
    {
        return nullptr;
    }
    return hardwareBuffers->directOutputs[channel];
}

const float *FxLoopEffect::ResolveDeviceInput(int channel) const
{
    if (hardwareBuffers == nullptr || channel < 0)
    {
        return nullptr;
    }
    if ((size_t)channel >= hardwareBuffers->deviceInputCount ||
        hardwareBuffers->deviceInputs == nullptr)
    {
        return nullptr;
    }
    return hardwareBuffers->deviceInputs[channel];
}

void FxLoopEffect::Run(uint32_t samples, RealtimeRingBufferWriter * /*ringBufferWriter*/)
{
    const size_t nCh = outputBuffers.size();
    if (nCh == 0 || inputBuffers.empty())
    {
        return;
    }

    float *const in0 = inputBuffers[0];
    float *const in1 = inputBuffers.size() > 1 ? inputBuffers[1] : in0;
    float *const out0 = outputBuffers[0];
    float *const out1 = nCh > 1 ? outputBuffers[1] : nullptr;

    if (in0 == nullptr || out0 == nullptr)
    {
        return;
    }

    const int sendChannelL = (int)std::lround(controlValues[SEND_CHANNEL_CTL]);
    const int sendChannelR = (int)std::lround(controlValues[SEND_CHANNEL_R_CTL]);
    const int returnChannelL = (int)std::lround(controlValues[RETURN_CHANNEL_CTL]);
    const int returnChannelR = (int)std::lround(controlValues[RETURN_CHANNEL_R_CTL]);

    float *sendL = ResolveDirectOutput(sendChannelL);
    float *sendR = ResolveDirectOutput(sendChannelR);
    const float *returnL = ResolveDeviceInput(returnChannelL);
    const float *returnR = ResolveDeviceInput(returnChannelR);

    switch (mode)
    {
    case FxLoopMode::SendLeft:
    case FxLoopMode::SendRight:
    {
        // A send is a pure tap: the chain passes through untouched.
        float *const source = (mode == FxLoopMode::SendRight) ? in1 : in0;
        for (uint32_t i = 0; i < samples; ++i)
        {
            const float gain = sendLevel.Tick();
            if (sendL != nullptr)
            {
                sendL[i] += source[i] * gain;
            }
            out0[i] = in0[i];
            if (out1 != nullptr)
            {
                out1[i] = in1[i];
            }
        }
        break;
    }

    case FxLoopMode::ReturnLeft:
    case FxLoopMode::ReturnRight:
    {
        const bool targetRight = (mode == FxLoopMode::ReturnRight) && out1 != nullptr;
        for (uint32_t i = 0; i < samples; ++i)
        {
            const float gain = returnLevel.Tick();
            if (mixCurrent < mixTarget)
            {
                mixCurrent = std::min(mixTarget, mixCurrent + mixStep);
            }
            else if (mixCurrent > mixTarget)
            {
                mixCurrent = std::max(mixTarget, mixCurrent - mixStep);
            }

            const float wet = (returnL != nullptr) ? returnL[i] * gain : 0.0f;
            const float dryL = in0[i];
            const float dryR = in1[i];

            if (targetRight)
            {
                out0[i] = dryL;
                out1[i] = dryR * (1.0f - mixCurrent) + wet * mixCurrent;
            }
            else
            {
                out0[i] = dryL * (1.0f - mixCurrent) + wet * mixCurrent;
                if (out1 != nullptr)
                {
                    out1[i] = dryR;
                }
            }
        }
        break;
    }

    case FxLoopMode::Loop:
    default:
    {
        for (uint32_t i = 0; i < samples; ++i)
        {
            const float sendGain = sendLevel.Tick();
            const float returnGain = returnLevel.Tick();
            if (mixCurrent < mixTarget)
            {
                mixCurrent = std::min(mixTarget, mixCurrent + mixStep);
            }
            else if (mixCurrent > mixTarget)
            {
                mixCurrent = std::max(mixTarget, mixCurrent - mixStep);
            }

            const float dryL = in0[i];
            const float dryR = in1[i];

            if (sendL != nullptr)
            {
                sendL[i] += dryL * sendGain;
            }
            if (sendR != nullptr)
            {
                sendR[i] += dryR * sendGain;
            }

            const float wetL = (returnL != nullptr) ? returnL[i] * returnGain : 0.0f;
            const float wetR = (returnR != nullptr) ? returnR[i] * returnGain : wetL;

            out0[i] = dryL * (1.0f - mixCurrent) + wetL * mixCurrent;
            if (out1 != nullptr)
            {
                out1[i] = dryR * (1.0f - mixCurrent) + wetR * mixCurrent;
            }
        }
        break;
    }
    }
}
