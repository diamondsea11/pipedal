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

#pragma once
#include "Pedalboard.hpp"
#include "MidiEvent.hpp"
#include "PluginHost.hpp"
#include "Lv2Effect.hpp"
#include "BufferPool.hpp"
#include <functional>
#include <lv2/urid/urid.h>
#include <functional>
#include "DbDezipper.hpp"
#include <array>
#include <algorithm>
#include <cmath>

namespace pipedal
{

    class AudioDriver;
    class IPatchWriterCallback;
    class RealtimeVuBuffers;
    class RealtimePatchPropertyRequest;
    class RealtimeRingBufferWriter;

    using ExistingEffectMap = std::map<uint64_t, std::shared_ptr<IEffect>>;

    struct Lv2PedalboardError
    {
        int64_t intanceId;
        std::string message;
    };

    class Lv2PedalboardErrorList : public std::vector<Lv2PedalboardError> // (forward declaration issues with a using statement)
    {
    };

    class Lv2Pedalboard
    {
    public:
        struct Biquad
        {
            float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
            float z1 = 0, z2 = 0;
            float Process(float value)
            {
                float result = value * b0 + z1;
                z1 = value * b1 - result * a1 + z2;
                z2 = value * b2 - result * a2;
                return result;
            }
        };

    private:
        class InputNoiseGate
        {
            bool enabled = false;
            float threshold = 0.001f;
            float envelope = 0;
            float gain = 1;
            float detectorAttack = 0;
            float detectorRelease = 0;
            float gainAttack = 0;
            float gainRelease = 0;
            uint32_t holdSamples = 0;
            uint32_t holdRemaining = 0;
        public:
            void Configure(float sampleRate, bool enabledValue, float thresholdDb, float decayMs)
            {
                enabled = enabledValue;
                threshold = std::pow(10.0f, std::clamp(thresholdDb, -96.0f, 0.0f) / 20.0f);
                const float safeRate = std::max(sampleRate, 1.0f);
                detectorAttack = std::exp(-1.0f / (0.001f * safeRate));
                detectorRelease = std::exp(-1.0f / (0.03f * safeRate));
                gainAttack = std::exp(-1.0f / (0.001f * safeRate));
                const float decaySeconds = std::clamp(decayMs, 10.0f, 2000.0f) * 0.001f;
                gainRelease = std::exp(std::log(0.001f) / (decaySeconds * safeRate));
                holdSamples = (uint32_t)(safeRate * 0.02f);
                if (!enabled)
                {
                    envelope = 0;
                    gain = 1;
                    holdRemaining = 0;
                }
            }
            float Tick(float level)
            {
                if (!enabled) return 1;
                const float detectorCoefficient = level > envelope
                    ? detectorAttack
                    : detectorRelease;
                envelope = detectorCoefficient * envelope +
                    (1 - detectorCoefficient) * level;
                if (envelope >= threshold)
                {
                    holdRemaining = holdSamples;
                    gain = 1 - (1 - gain) * gainAttack;
                }
                else if (holdRemaining != 0)
                {
                    --holdRemaining;
                    gain = 1 - (1 - gain) * gainAttack;
                }
                else
                {
                    gain *= gainRelease;
                    if (gain < 0.00001f) gain = 0;
                }
                return gain;
            }
        };

        IHost *pHost = nullptr;
        size_t currentFrameOffset = 0;
        DbDezipper inputVolume;
        DbDezipper outputVolume;
        DbDezipper pathBInputVolume;
        DbDezipper pathBOutputVolume;
        InputNoiseGate inputGate;
        InputNoiseGate pathBInputGate;

        BufferPool bufferPool;
        std::vector<float *> pedalboardInputBuffers;
        std::vector<float *> pedalboardOutputBuffers;
        std::vector<int64_t> pathAInputChannels;
        std::vector<int64_t> pathAOutputChannels;
        bool pathAMute = false;
        float pathAPan = 0;
        bool pathBEnabled = false;
        std::vector<int64_t> pathBInputChannels;
        std::vector<int64_t> pathBOutputChannels;
        std::vector<float *> pathBInputBuffers;
        std::vector<float *> pathBOutputBuffers;
        class DelayCompensator
        {
            std::array<std::vector<float>, 2> buffers;
            size_t writeIndex = 0;
        public:
            void Prepare(size_t capacity)
            {
                for (auto &buffer : buffers)
                {
                    buffer.assign(capacity, 0);
                }
                writeIndex = 0;
            }
            float Process(size_t channel, float value, uint32_t delay)
            {
                auto &buffer = buffers[std::min(channel, (size_t)1)];
                if (buffer.empty()) return value;
                const size_t clampedDelay =
                    std::min((size_t)delay, buffer.size() - 1);
                buffer[writeIndex] = value;
                const size_t readIndex =
                    (writeIndex + buffer.size() - clampedDelay) % buffer.size();
                return buffer[readIndex];
            }
            void Advance()
            {
                if (!buffers[0].empty())
                {
                    writeIndex = (writeIndex + 1) % buffers[0].size();
                }
            }
        };
        std::vector<IEffect *> pathALatencyEffects;
        std::vector<IEffect *> pathBLatencyEffects;
        DelayCompensator pathADelay;
        DelayCompensator pathBDelay;
        bool pathBMute = false;
        float pathBPan = 0;
        struct AdditionalPathRuntime
        {
            std::string id;
            std::vector<int64_t> inputChannels;
            std::vector<int64_t> outputChannels;
            std::map<std::string, float> sourceSendsDb;
            std::vector<float *> inputBuffers;
            std::vector<float *> outputBuffers;
            DbDezipper inputVolume;
            DbDezipper outputVolume;
            InputNoiseGate inputGate;
            bool mute = false;
            float pan = 0;
            std::vector<IEffect *> latencyEffects;
            DelayCompensator delay;
        };
        std::vector<std::unique_ptr<AdditionalPathRuntime>> additionalPaths;
        bool globalEqEnabled = false;
        std::array<std::array<Biquad, 7>, 2> globalEq;
        float *pedalboardSidechainBuffer = nullptr;

        std::vector<std::shared_ptr<IEffect>> effects;
        std::vector<IEffect *> realtimeEffects;

        using Action = std::function<void()>;
        using ProcessAction = std::function<void(uint32_t frames)>;

        std::vector<Action> activateActions;

        std::vector<ProcessAction> processActions;

        std::vector<Action> deactivateActions;

        float *CreateNewAudioBuffer();

        RealtimeRingBufferWriter *ringBufferWriter;

        enum class MidiControlType
        {
            None,
            Select,
            Dial,
            Toggle,
            Trigger,
            MomentarySwitch,
            TapTempo
        };
        class MidiMapping
        {
        public:
            std::shared_ptr<Lv2PluginInfo> pluginInfo; // lifecycle
            const Lv2PortInfo *pPortInfo = nullptr;    // owned by port.
            int instanceId = -1;
            int effectIndex = -1;
            int controlIndex = -1;
            int key; // key to the note or control. internal use only.
            MidiTimestamp lastTapTimestamp;
            bool hasLastValue = false;
            bool lastValueIncreasing = false;
            float lastValue = 0;
            MidiControlType mappingType;
            MidiBinding midiBinding;
        };

        std::vector<MidiMapping> midiMappings;
        struct RuntimeMidiAction
        {
            MidiAction action;
            uint8_t lastValue = 0;
            bool pressed = false;
            bool longPressTriggered = false;
            uint64_t pressFrame = 0;
            uint64_t previousPressFrame = 0;
            int triggerKey = -1;
        };
        struct MidiActionToggleState
        {
            bool valid = false;
            int key = 0;
            int position = 1;
            int group = 0;
        };
        std::vector<RuntimeMidiAction> midiActions;
        std::array<MidiActionToggleState, 64> midiActionToggleStates;

        int GetMidiActionTogglePosition(int key) const;
        void AdvanceMidiActionToggle(
            int key,
            int currentPosition,
            int toggleGroup,
            int resetGroup);

        std::vector<float *> PrepareItems(
            std::vector<PedalboardItem> &items,
            std::vector<float *> inputBuffers,
            Lv2PedalboardErrorList &errorList,
            ExistingEffectMap *existingEffects);

        void PrepareMidiMap(const Pedalboard &pedalboard);
        void PrepareMidiMap(const PedalboardItem &pedalboardItem);

        std::vector<float *> AllocateAudioBuffers(int nChannels);
        int CalculateChainInputs(const std::vector<float *> &inputBuffers, const std::vector<PedalboardItem> &items);
        void AppendParameterRequest(uint8_t *atomBuffer, LV2_URID uridParameter);

    public:
        Lv2Pedalboard() {}
        ~Lv2Pedalboard() {}

        void Prepare(IHost *pHost, Pedalboard &pedalboard, Lv2PedalboardErrorList &errorList, ExistingEffectMap *existingEffects = nullptr);

        std::vector<IEffect *> &GetEffects() { return realtimeEffects; }
        std::vector<std::shared_ptr<IEffect>> &GetSharedEffectList() { return effects; }

        size_t GetNumberOfAudioInputChannels() const;
        size_t GetNumberOfAudioOutputChannels() const;

        int GetIndexOfInstanceId(uint64_t instanceId)
        {
            for (int i = 0; i < this->realtimeEffects.size(); ++i)
            {
                if (this->realtimeEffects[i]->GetInstanceId() == instanceId)
                    return i;
            }
            return -1;
        }
        IEffect *GetEffect(uint64_t instanceId)
        {
            for (int i = 0; i < realtimeEffects.size(); ++i)
            {
                if (realtimeEffects[i]->GetInstanceId() == instanceId)
                {
                    return realtimeEffects[i];
                }
            }
            return nullptr;
        }
        void Activate();
        void Deactivate();
        void UpdateAudioPorts();

        bool Run(
            float **inputBuffers,
            float **outputBuffers,
            float **pathBHardwareInputBuffers,
            float *const *const *additionalPathHardwareInputBuffers,
            size_t additionalPathHardwareInputCount,
            float *const *directOutputBuffers,
            size_t directOutputBufferCount,
            uint32_t samples,
            RealtimeRingBufferWriter *realtimeWriter);
        bool Run(
            float **inputBuffers,
            float **outputBuffers,
            uint32_t samples,
            RealtimeRingBufferWriter *realtimeWriter)
        {
            return Run(
                inputBuffers,
                outputBuffers,
                nullptr,
                nullptr,
                0,
                nullptr,
                0,
                samples,
                realtimeWriter);
        }

        void ResetAtomBuffers();

        void ProcessParameterRequests(RealtimePatchPropertyRequest *pParameterRequests, size_t samplesThisTime);
        void GatherPatchProperties(RealtimePatchPropertyRequest *pParameterRequests);
        void GatherPathPatchProperties(IPatchWriterCallback *cbPatchWriter);

        std::vector<float *> &GetInputBuffers() { return this->pedalboardInputBuffers; }
        std::vector<float *> &GetoutputBuffers() { return this->pedalboardOutputBuffers; }
        bool IsPathBEnabled() const { return this->pathBEnabled; }
        const std::vector<int64_t> &GetPathBInputChannels() const { return this->pathBInputChannels; }
        const std::vector<int64_t> &GetPathAInputChannels() const { return this->pathAInputChannels; }
        size_t GetAdditionalPathCount() const
        {
            return this->additionalPaths.size();
        }
        const std::vector<int64_t> &GetAdditionalPathInputChannels(size_t index) const
        {
            return this->additionalPaths.at(index)->inputChannels;
        }
        const std::string &GetAdditionalPathId(size_t index) const
        {
            return this->additionalPaths.at(index)->id;
        }

        int GetControlIndex(uint64_t instanceId, const std::string &symbol);
        void SetControlValue(int effectIndex, int portIndex, float value);
        void SetInputVolume(float value) { this->inputVolume.SetTarget(value); }
        void SetOutputVolume(float value) { this->outputVolume.SetTarget(value); }
        void SetPathBInputVolume(float value) { this->pathBInputVolume.SetTarget(value); }
        void SetPathBOutputVolume(float value) { this->pathBOutputVolume.SetTarget(value); }
        void SetBypass(int effectIndex, bool enabled);

        void ComputeVus(RealtimeVuBuffers *vuConfiguration, uint32_t samples);

        float GetControlOutputValue(int effectIndex, int portIndex);

        typedef void(MidiCallbackFn)(void *data, uint64_t intanceId, int controlIndex, float value);
        void OnMidiMessage(
            const MidiEvent&message,
            void *callbackHandle,
            MidiCallbackFn *pfnCallback);
        size_t CollectTriggeredMidiActions(
            const MidiEvent &message,
            const MidiAction **result,
            size_t capacity);
        size_t CollectTimedMidiActions(
            const MidiAction **result,
            size_t capacity);
        bool ExecuteInternalMidiAction(
            const MidiAction &action,
            void *callbackHandle,
            MidiCallbackFn *pfnCallback);
private:
        void handleTapTempo(
            uint8_t value, 
            const MidiTimestamp& timestamp, 
            MidiMapping &mapping,
            void *callbackHandle,
            MidiCallbackFn *pfnCallback);


    };

} // namespace
