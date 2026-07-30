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
#include "catch.hpp"
#include <sstream>
#include <cstdint>
#include <string>

#include "json.hpp"
#include "json_variant.hpp"
#ifndef PIPEDAL_STANDALONE_JSON_TEST
#include "Pedalboard.hpp"
#include "JackServerSettings.hpp"
#include "ChannelRouterSettings.hpp"
#endif
#include <concepts>
#include <type_traits>

using namespace pipedal;

#ifndef PIPEDAL_STANDALONE_JSON_TEST
TEST_CASE("legacy pedalboards default to one path", "[json_read_test][multipath]")
{
    std::stringstream input{
        R"({"name":"Legacy","input_volume_db":0,"output_volume_db":0,"items":[],"nextInstanceId":0,"snapshots":[],"selectedSnapshot":-1,"selectedPlugin":-1})"};
    json_reader reader{input};
    Pedalboard pedalboard;
    reader.read(&pedalboard);

    REQUIRE(reader.is_complete());
    REQUIRE_FALSE(pedalboard.pathBEnabled());
    REQUIRE(pedalboard.pathBName() == "Vocal");
    REQUIRE(pedalboard.pathBInputChannels() == std::vector<int64_t>{0});
    REQUIRE(pedalboard.pathAOutputChannels().empty());
    REQUIRE(pedalboard.pathBOutputChannels().empty());
    REQUIRE(pedalboard.pathBItems().empty());
    REQUIRE(pedalboard.additionalPaths().empty());
}

TEST_CASE("multi-path pedalboards survive json roundtrip", "[json_read_test][multipath]")
{
    Pedalboard source = Pedalboard::MakeDefault();
    source.EnsurePathB();
    source.pathBName("Vocal");
    source.pathBInputChannels({0});
    source.pathBOutputChannels({0});
    source.pathBInputVolumeDb(-3.0f);
    source.pathBOutputVolumeDb(2.5f);
    source.pathAInputChannels({2});
    source.pathAOutputChannels({2, 3});
    source.pathAMute(true);
    source.pathAPan(-1.0f);
    source.pathBMute(false);
    source.pathBPan(1.0f);
    source.globalEqEnabled(true);
    source.globalEqLowCutHz(75);
    source.globalEqLowGainDb(-1.5f);
    source.globalEqMidGainDb(2.0f);
    source.globalEqMidFrequencyHz(1250);
    source.globalEqHighGainDb(-2.5f);
    source.globalEqHighCutHz(14500);
    PedalboardPath pathC;
    pathC.id("C");
    pathC.name("Keys");
    pathC.inputChannels({4, 5});
    pathC.outputChannels({6, 7});
    pathC.inputVolumeDb(-2.0f);
    pathC.outputVolumeDb(1.5f);
    pathC.mute(false);
    pathC.pan(-0.5f);
    pathC.items().push_back(source.MakeEmptyItem());
    source.additionalPaths().push_back(pathC);

    PedalboardPath pathD;
    pathD.id("D");
    pathD.name("Monitor");
    pathD.enabled(false);
    source.additionalPaths().push_back(pathD);
    MidiAction midiAction;
    midiAction.bindingType(BINDING_TYPE_CONTROL);
    midiAction.channel(2);
    midiAction.number(21);
    midiAction.gesture((int)MidiActionGesture::Press);
    midiAction.actionType((int)MidiActionType::TogglePathMute);
    midiAction.outputChannel(4);
    midiAction.actionNumber(73);
    midiAction.symbol("C");
    midiAction.togglePosition(1);
    midiAction.toggleGroup(3);
    midiAction.resetGroup(4);
    midiAction.delayMs(125);
    source.midiActions().push_back(midiAction);
    source.snapshots().push_back(
        std::make_shared<Snapshot>(source.MakeSnapshotFromCurrentSettings(source)));

    std::stringstream serialized;
    json_writer writer{serialized};
    writer.write(source);

    json_reader reader{serialized};
    Pedalboard result;
    reader.read(&result);

    REQUIRE(reader.is_complete());
    REQUIRE(result.pathBEnabled());
    REQUIRE(result.pathBName() == "Vocal");
    REQUIRE(result.pathBInputChannels() == std::vector<int64_t>{0});
    REQUIRE(result.pathBOutputChannels() == std::vector<int64_t>{0});
    REQUIRE(result.pathBInputVolumeDb() == -3.0f);
    REQUIRE(result.pathBOutputVolumeDb() == 2.5f);
    REQUIRE(result.pathAInputChannels() == std::vector<int64_t>{2});
    REQUIRE(result.pathAOutputChannels() == std::vector<int64_t>{2, 3});
    REQUIRE(result.pathAMute());
    REQUIRE(result.pathAPan() == -1.0f);
    REQUIRE_FALSE(result.pathBMute());
    REQUIRE(result.pathBPan() == 1.0f);
    REQUIRE(result.globalEqEnabled());
    REQUIRE(result.globalEqLowCutHz() == 75);
    REQUIRE(result.globalEqLowGainDb() == -1.5f);
    REQUIRE(result.globalEqMidGainDb() == 2.0f);
    REQUIRE(result.globalEqMidFrequencyHz() == 1250);
    REQUIRE(result.globalEqHighGainDb() == -2.5f);
    REQUIRE(result.globalEqHighCutHz() == 14500);
    REQUIRE(result.pathBItems().size() == 1);
    REQUIRE(result.additionalPaths().size() == 2);
    REQUIRE(result.additionalPaths()[0].id() == "C");
    REQUIRE(result.additionalPaths()[0].name() == "Keys");
    REQUIRE(result.additionalPaths()[0].inputChannels() == std::vector<int64_t>{4, 5});
    REQUIRE(result.additionalPaths()[0].outputChannels() == std::vector<int64_t>{6, 7});
    REQUIRE(result.additionalPaths()[0].inputVolumeDb() == -2.0f);
    REQUIRE(result.additionalPaths()[0].outputVolumeDb() == 1.5f);
    REQUIRE(result.additionalPaths()[0].pan() == -0.5f);
    REQUIRE(result.additionalPaths()[0].items().size() == 1);
    REQUIRE_FALSE(result.additionalPaths()[1].enabled());
    REQUIRE(result.midiActions().size() == 1);
    REQUIRE(result.midiActions()[0].channel() == 2);
    REQUIRE(result.midiActions()[0].number() == 21);
    REQUIRE(result.midiActions()[0].actionType() == (int)MidiActionType::TogglePathMute);
    REQUIRE(result.midiActions()[0].outputChannel() == 4);
    REQUIRE(result.midiActions()[0].actionNumber() == 73);
    REQUIRE(result.midiActions()[0].symbol() == "C");
    REQUIRE(result.midiActions()[0].toggleGroup() == 3);
    REQUIRE(result.midiActions()[0].resetGroup() == 4);
    REQUIRE(result.midiActions()[0].delayMs() == 125);
    REQUIRE(result.snapshots().size() == 1);
    REQUIRE(result.snapshots()[0]->hasMixSettings_);
    REQUIRE(result.snapshots()[0]->pathAMute_);
    REQUIRE(result.snapshots()[0]->pathAPan_ == -1.0f);
    REQUIRE(result.snapshots()[0]->pathBPan_ == 1.0f);
    REQUIRE(result.snapshots()[0]->globalEqEnabled_);
    REQUIRE(result.snapshots()[0]->globalEqMidFrequencyHz_ == 1250);
    REQUIRE(result.snapshots()[0]->additionalPathMixes_.size() == 2);
    REQUIRE(result.snapshots()[0]->additionalPathMixes_[0].id() == "C");
    REQUIRE(result.snapshots()[0]->additionalPathMixes_[0].pan() == -0.5f);
}

TEST_CASE("NAM calibration profiles follow the active interface", "[json_read_test][nam-calibration]")
{
    JackServerSettings babyface("hw:CARD=Babyface2359687", "hw:CARD=Babyface2359687", 48000, 48, 3);
    babyface.SetAlsaInputDevice(
        "hw:CARD=Babyface2359687",
        "RME Babyface Pro FS");
    REQUIRE(babyface.GetNamInputCalibrationDbu() == 13.0f);
    babyface.SetNamInputCalibrationDbu(14.5f);
    REQUIRE(babyface.GetNamInputCalibrationDbu() == 14.5f);

    babyface.SetAlsaInputDevice("hw:CARD=Other", "Other USB Audio");
    REQUIRE(babyface.GetNamInputCalibrationDbu() == 12.0f);
    babyface.SetNamInputCalibrationDbu(10.0f);

    std::stringstream serialized;
    json_writer writer{serialized};
    writer.write(babyface);
    json_reader reader{serialized};
    JackServerSettings restored;
    reader.read(&restored);

    REQUIRE(restored.GetNamInputCalibrationDbu() == 10.0f);
    restored.SetAlsaInputDevice("hw:CARD=Babyface2359687", "RME Babyface Pro FS");
    REQUIRE(restored.GetNamInputCalibrationDbu() == 14.5f);
}

TEST_CASE("NAM calibration recognizes known audio interfaces", "[json_read_test][nam-calibration]")
{
    struct TestCase
    {
        const char *name;
        float expected;
    };
    static constexpr TestCase testCases[] = {
        {"Antelope Audio Discrete 8 Pro", 18.0f},
        {"Arturia MiniFuse 2", 11.5f},
        {"Audient iD4", 12.0f},
        {"Audient iD44", 10.0f},
        {"Behringer UMC204HD 192k", 17.0f},
        {"Focusrite Scarlett 2i2 3rd Gen", 12.5f},
        {"IK Multimedia AXE I/O One", 10.5f},
        {"MOTU UltraLite-mk5", 18.0f},
        {"PreSonus Quantum HD 8", 21.0f},
        {"RME Babyface Pro (2359687)", 13.0f},
        {"SSL 18 USB Audio", 15.0f},
        {"Universal Audio UAD Volt 276", 12.5f},
        {"Unknown USB Audio", 12.0f},
    };

    JackServerSettings settings("hw:Test", "hw:Test", 48000, 64, 3);
    for (const auto &testCase : testCases)
    {
        settings.SetAlsaInputDevice("hw:Test", testCase.name);
        INFO(testCase.name);
        REQUIRE(settings.GetNamInputCalibrationDbu() == testCase.expected);
    }
}

TEST_CASE("output matrix follows channel router JSON", "[json_read_test][multipath]")
{
    ChannelRouterSettings source;
    source.configured(true);
    source.mainInputChannels({2, -1});
    source.mainOutputChannels({2, 3});
    OutputRoute route;
    route.sourceChannel(0);
    route.outputChannel(5);
    route.gainDb(-6.0f);
    route.mute(false);
    source.outputRoutes().push_back(route);

    std::stringstream serialized;
    json_writer writer{serialized};
    writer.write(source);
    json_reader reader{serialized};
    ChannelRouterSettings restored;
    reader.read(&restored);

    REQUIRE(restored.outputRoutes().size() == 1);
    REQUIRE(restored.outputRoutes()[0].sourceChannel() == 0);
    REQUIRE(restored.outputRoutes()[0].outputChannel() == 5);
    REQUIRE(restored.outputRoutes()[0].gainDb() == -6.0f);
    REQUIRE_FALSE(restored.outputRoutes()[0].mute());
}
#endif

class JsonTestTarget
{
private:
    JsonTestTarget(const JsonTestTarget &) {}                           // hide copy constructor.
    JsonTestTarget &operator=(const JsonTestTarget &) { return *this; } // hide assignment.
public:
    JsonTestTarget() // make sure reading works without  a default cosntructor.
    {
    }
    bool operator==(const JsonTestTarget &other) const
    {
        return this->int_ == other.int_ && this->float_ == other.float_ && this->double_ == other.double_ && this->string_ == other.string_ && std::equal(this->ints_.begin(), this->ints_.end(), other.ints_.begin(), other.ints_.end()) && std::equal(this->strings_.begin(), this->strings_.end(), other.strings_.begin(), other.strings_.end());
    }

public:
    int int_ = 1;
    float float_ = 3;
    double double_ = 4;

public:
    std::string string_{"5"};

    std::vector<int> ints_{1, 2, 3, 4, 5};
    std::vector<std::string> strings_{"a", "b", "c", "d"};
    std::vector<std::vector<int>> compound_array_{{1, 2}, {3}, {4, 5, 6}, {9}};

public:
    static json_map::storage_type<JsonTestTarget> jmap;

public:
    JsonTestTarget(json_reader &reader)
    {
#ifdef JUNK
        while (true)
        {
            const char *name = reader.read_member_name();
            if (name == nullptr)
            {
                break;
            }
        }
#endif
    }
};

json_map::storage_type<JsonTestTarget> JsonTestTarget::jmap{{
    // json_map::reference("char_", &JsonTestTarget::char_),
    json_map::reference("int", &JsonTestTarget::int_),
    json_map::reference("floatt", &JsonTestTarget::float_),
    json_map::reference("double", &JsonTestTarget::double_),
    json_map::reference("ints", &JsonTestTarget::ints_),
    json_map::reference("string", &JsonTestTarget::string_),
    json_map::reference("strings", &JsonTestTarget::strings_),
    json_map::reference("compoundarray", &JsonTestTarget::compound_array_),
}};

TEST_CASE("json write", "[json_write_test]")
{
    std::cout << "== json write ==" << std::endl;
    std::stringstream os;
    json_writer writer{os};

    JsonTestTarget testTarget;

    writer.write(testTarget);

    std::cout << os.str() << std::endl;
}

static std::string get_json()
{
    std::stringstream os;
    json_writer writer{os};

    JsonTestTarget testTarget;

    writer.write(testTarget);
    return os.str();
}

TEST_CASE("json read", "[json_read_test]")
{

    JsonTestTarget source;
    source.ints_ = {1, 7, 4};
    source.string_ = "xyz";
    source.double_ = 99483.1837;

    std::stringstream os;
    json_writer writer(os);
    writer.write(source);
    std::string json = os.str();

    std::stringstream input(json);
    json_reader reader{input};

    JsonTestTarget dest;
    reader.read(&dest);
    REQUIRE(reader.is_complete());

    REQUIRE(source == dest);

    JsonTestTarget *pDest;
    std::stringstream input2(json);
    json_reader reader2{input2};
    reader2.read(&pDest);

    // JsonTestTarget *testTarget = reader.read_object<JsonTestTarget>();
}

TEST_CASE("json smart ptrs", "[json_smart_ptrs][Build][Dev]")
{
    std::string json = get_json();

    {
        std::unique_ptr<JsonTestTarget> uniquePtr;
        std::stringstream input(json);
        json_reader reader{input};
        reader.read(&uniquePtr);
    }
    {
        std::shared_ptr<JsonTestTarget> sharedPtr;
        std::stringstream input(json);
        json_reader reader{input};
        reader.read(&sharedPtr);
    }
}

template <typename U>
U & VariantAs(json_variant& v)
{
    throw std::runtime_error("Missing specialization.");
}

    template <>
    inline json_null &VariantAs<json_null>(json_variant& v) { return v.as_null(); }

    template <>
    inline bool &VariantAs<bool>(json_variant& v) { return v.as_bool(); }

    template <>
    inline double &VariantAs<double>(json_variant& v) { return v.as_number(); }

    template <>
    inline std::string &VariantAs<std::string>(json_variant& v) { return v.as_string(); }

    template <>
    inline std::shared_ptr<json_object> &VariantAs<std::shared_ptr<json_object>>(json_variant& v) { return v.as_object(); }

    template <>
    inline std::shared_ptr<json_array> &VariantAs<std::shared_ptr<json_array>>(json_variant& v) { return v.as_array(); }

    template <>
    inline json_variant &VariantAs<json_variant>(json_variant& v) { return v; }



template <typename T>
void TestVariantRoundTrip(const T &value)
{
    json_variant variant(value);
    T &out = VariantAs<T>(variant);
    REQUIRE(out == value);

    std::string output;
    {
        std::stringstream s;
        json_writer writer(s);
        writer.write(variant);
        output = s.str();
    }
    std::cout << output << std::endl;

    {
        std::stringstream s(output);
        json_reader reader(s);

        json_variant outputVariant;
        reader.read(&outputVariant);
        REQUIRE(outputVariant == variant);
    }
}
void TestVariantRoundTrip(json_variant &value)
{
    json_variant variant(value);
    REQUIRE(variant == value);

    std::string output;
    {
        std::stringstream s;
        json_writer writer(s);
        writer.write(variant);
        output = s.str();
    }
    std::cout << output << std::endl;

    json_variant outputVariant;
    {
        std::stringstream s(output);
        json_reader reader(s);

        json_variant outputVariant;
        reader.read(&outputVariant);
        REQUIRE(outputVariant == variant);
    }
}

class X
{
public:
    template <typename T>
        requires std::derived_from<T, JsonSerializable> bool
    write(T &v)
    {
        (void)v;
        return true;
    }
    template <typename T>
    bool write(T &v)
    {
        (void)v;
        return false;
    }
};

void TestVariantSFINAE()
{
    X x;

    json_variant v;
    dynamic_cast<JsonSerializable &>(v);

    REQUIRE(x.write(v) == true);

    int i;
    REQUIRE(x.write(i) == false);
}

void TestIlleglUtf8Sequences()
{
    {
        std::string json = "\"\x80\x80\x80\"";
        std::stringstream s(json);
        json_reader reader(s);
        std::string v;
        reader.read(&v);
        // just sufficient that it doesn't throw.
    }


    {
    std::string illegalJsonString = "123\x80\x80\x80xyz";
        std::stringstream ss;
        json_writer writer(ss);
        writer.write(illegalJsonString);
        std::string output = ss.str();
        std::string result = ss.str();
        REQUIRE(result == "\"123\\uFFFDyz\""); // U+FFFD is the replacement character for illegal UTF-8 sequences.
    }
}   
TEST_CASE("json variants", "[json_variants][Build][Dev]")
{
    {
        TestIlleglUtf8Sequences();

        TestVariantSFINAE();

        
        TestVariantRoundTrip(0.0);
        TestVariantRoundTrip(std::string("abc"));
        TestVariantRoundTrip(json_null());

        json_array array;
        array.push_back(json_null());
        array.push_back(3.25E19);
        array.push_back(std::string("abc"));

        json_variant variantArray{std::move(array)};
        REQUIRE(array.size() == 0); // did it get moved property?
        TestVariantRoundTrip(variantArray);

        {
            json_object obj;
            obj["a"] = json_null();
            obj["b"] = 0.25;
            obj["c"] = std::move(variantArray);
            json_variant variantObj{std::move(obj)};
            REQUIRE((variantArray.is_null() || variantArray.size() == 0) == true); // did move happen?
            REQUIRE(obj.size() == 0); // did move happen?
            TestVariantRoundTrip(variantObj);

            variantObj["a"] = std::string("abc");
            TestVariantRoundTrip(variantObj);
        }
        {
            json_variant x = json_variant::make_array();
            x.resize(3);
            x[0] = "def";
        }
    }
    REQUIRE(json_object::allocation_count() == 0);
    REQUIRE(json_array::allocation_count() == 0);
}
