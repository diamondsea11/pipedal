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

// Helix-style FX Loop / Send / Return blocks.
//
// These are pseudo-plugins (like SplitEffect): they are not real LV2 plugins,
// but appear in the plugin catalog so they can be dropped into a chain like any
// other block. They give the pedalboard an insert point for external hardware:
//
//   Send    -- taps the chain signal and writes it to a physical output channel.
//   Return  -- reads a physical input channel and blends it into the chain.
//   FX Loop -- both at one insert point (stereo).
//
// Physical channels are addressed through the buffers the audio driver already
// exposes: direct output buffers for sends, device input buffers for returns.
//
// IMPORTANT -- latency: the external round trip (DA -> outboard gear -> AD) is
// NOT latency-compensated, exactly as on a Helix. Used in series (Mix = 100%)
// that is simply added latency. At Mix values between 0 and 100 the delayed
// return runs against the undelayed dry signal, which causes comb filtering.
// That is inherent to analogue loops, not a defect of this implementation.

#pragma once

#include "IEffect.hpp"
#include "DbDezipper.hpp"

#include <cstddef>
#include <memory>
#include <string>
#include <vector>

namespace pipedal
{
    class Lv2PluginInfo;

    // Buffers the realtime graph needs in order to reach physical I/O. Owned by
    // Lv2Pedalboard and refreshed once per audio cycle; blocks hold a pointer to
    // it, so nothing is allocated or resized on the realtime thread.
    struct HardwareLoopBuffers
    {
        float *const *deviceInputs = nullptr;
        size_t deviceInputCount = 0;
        float *const *directOutputs = nullptr;
        size_t directOutputCount = 0;
    };

    enum class FxLoopMode
    {
        Loop = 0,    // stereo send + return at one insert point
        SendLeft,    // mono tap -> physical output
        SendRight,
        ReturnLeft,  // physical input -> mono injection into the chain
        ReturnRight
    };

    // Catalog helpers. Return nullptr / false for anything that is not one of
    // the fx-loop pseudo-plugins.
    bool IsFxLoopUri(const std::string &uri);
    FxLoopMode FxLoopModeFromUri(const std::string &uri);
    // The channel controls are rendered as a drop-down of the interface's real
    // channels, so these take the current output/input channel counts. Pass 0
    // when the audio device isn't known yet (falls back to the full range).
    std::shared_ptr<Lv2PluginInfo> GetFxLoopPluginInfo(
        const std::string &uri, size_t outputChannelCount = 0, size_t inputChannelCount = 0);
    std::vector<std::shared_ptr<Lv2PluginInfo>> GetAllFxLoopPluginInfos(
        size_t outputChannelCount = 0, size_t inputChannelCount = 0);

    class FxLoopEffect : public IEffect
    {
    public:
        // Control indices are fixed across all modes so that symbol lookup and
        // snapshot values stay stable even though each mode only publishes the
        // ports that are meaningful for it.
        static constexpr int SEND_LEVEL_CTL = 0;
        static constexpr int RETURN_LEVEL_CTL = 1;
        static constexpr int MIX_CTL = 2;
        static constexpr int SEND_CHANNEL_CTL = 3;
        static constexpr int SEND_CHANNEL_R_CTL = 4;
        static constexpr int RETURN_CHANNEL_CTL = 5;
        static constexpr int RETURN_CHANNEL_R_CTL = 6;
        static constexpr int LOOP_LATENCY_CTL = 7;
        static constexpr int MAX_INPUT_CONTROL = 8;

        FxLoopEffect(
            uint64_t instanceId,
            FxLoopMode mode,
            double sampleRate,
            const HardwareLoopBuffers *hardwareBuffers);

        virtual ~FxLoopEffect() {}

        // -- IEffect ---------------------------------------------------------
        virtual uint64_t GetInstanceId() const override { return instanceId; }
        virtual bool IsLv2Effect() const override { return false; }
        virtual bool IsVst3() const override { return false; }

        virtual uint64_t GetMaxInputControl() const override { return MAX_INPUT_CONTROL; }
        virtual bool IsInputControl(uint64_t index) const override;
        virtual float GetDefaultInputControlValue(uint64_t index) const override;

        virtual int GetControlIndex(const std::string &symbol) const override;
        virtual void SetControl(int index, float value) override;
        virtual float GetControlValue(int index) const override;
        virtual float GetOutputControlValue(int index) const override
        {
            return GetControlValue(index);
        }

        virtual void SetBypass(bool enabled) override;

        virtual void SetPatchProperty(LV2_URID, size_t, LV2_Atom *) override {}
        virtual void RequestPatchProperty(LV2_URID) override {}
        virtual void RequestAllPathPatchProperties() override {}
        virtual void ResetAtomBuffers() override {}

        virtual bool GetRequestStateChangedNotification() const override { return false; }
        virtual void SetRequestStateChangedNotification(bool) override {}

        virtual bool GetLv2State(Lv2PluginState *) override { return false; }
        virtual void SetLv2State(Lv2PluginState &) override {}

        virtual bool HasErrorMessage() const override { return false; }
        virtual const char *TakeErrorMessage() override { return ""; }

        // The block itself is sample-aligned and adds no latency of its own.
        // What it *does* introduce is the external round trip, which cannot be
        // measured from here -- so the user reports it via the Loop Latency
        // control. Feeding it back to the host lets the existing parallel-path
        // delay compensation align the other branches of a split against this
        // one. Zero (the default) reproduces plain Helix behaviour.
        virtual uint32_t GetLatencySamples() const override { return latencySamples; }

        virtual void PrepareNoInputEffect(int, size_t) override {}

        virtual int GetNumberOfInputAudioPorts() const override { return channelCount; }
        virtual int GetNumberOfOutputAudioPorts() const override { return channelCount; }
        virtual int GetNumberOfInputAudioBuffers() const override
        {
            return (int)inputBuffers.size();
        }
        virtual int GetNumberOfOutputAudioBuffers() const override
        {
            return (int)outputBuffers.size();
        }

        virtual float *GetAudioInputBuffer(int index) const override
        {
            return inputBuffers.at((size_t)index);
        }
        virtual float *GetAudioOutputBuffer(int index) const override
        {
            return outputBuffers.at((size_t)index);
        }
        virtual void SetAudioInputBuffer(int index, float *buffer) override;
        virtual void SetAudioOutputBuffer(int index, float *buffer) override;

        virtual void Activate() override;
        virtual void Deactivate() override {}

        virtual void Run(uint32_t samples, RealtimeRingBufferWriter *ringBufferWriter) override;

        // Called by Lv2Pedalboard once the chain width is known.
        void SetChannelCount(int channels);

    private:
        // Resolves a control-port channel value to a real buffer, or nullptr if
        // the channel is unassigned or out of range.
        float *ResolveDirectOutput(int channel) const;
        const float *ResolveDeviceInput(int channel) const;

        void UpdateTargets();

        uint64_t instanceId;
        FxLoopMode mode;
        double sampleRate = 44100.0;
        const HardwareLoopBuffers *hardwareBuffers = nullptr;

        int channelCount = 1;
        std::vector<float *> inputBuffers;
        std::vector<float *> outputBuffers;

        bool bypassed = false;

        // Raw control values, indexed by the *_CTL constants above.
        float controlValues[MAX_INPUT_CONTROL];

        DbDezipper sendLevel;
        DbDezipper returnLevel;

        // Mix is a percentage, not a level, so it gets a plain linear ramp.
        float mixCurrent = 1.0f;
        float mixTarget = 1.0f;
        float mixStep = 1.0f;

        // Cached from the Loop Latency control so GetLatencySamples() stays
        // trivial -- it is polled once per audio cycle.
        uint32_t latencySamples = 0;
    };

} // namespace pipedal
