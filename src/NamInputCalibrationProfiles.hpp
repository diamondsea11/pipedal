// Copyright (c) 2026 Thomas Rapolani
// SPDX-License-Identifier: MIT

#pragma once

#include <algorithm>
#include <cctype>
#include <optional>
#include <string>

namespace pipedal
{
    struct NamInputCalibrationProfile
    {
        const char *devicePattern;
        float maximumInputLevelDbu;
    };

    inline std::string NormalizeNamCalibrationDeviceName(const std::string &value)
    {
        std::string result;
        result.reserve(value.size());
        for (unsigned char c : value)
        {
            if (std::isalnum(c))
            {
                result.push_back(static_cast<char>(std::tolower(c)));
            }
        }
        return result;
    }

    inline bool MatchesNamCalibrationPattern(
        const std::string &normalizedName,
        const std::string &pattern)
    {
        size_t namePosition = 0;
        size_t patternPosition = 0;
        while (patternPosition < pattern.size())
        {
            size_t separator = pattern.find('*', patternPosition);
            size_t componentLength =
                separator == std::string::npos
                    ? pattern.size() - patternPosition
                    : separator - patternPosition;
            if (componentLength != 0)
            {
                size_t match = normalizedName.find(
                    pattern.substr(patternPosition, componentLength),
                    namePosition);
                if (match == std::string::npos)
                {
                    return false;
                }
                namePosition = match + componentLength;
            }
            if (separator == std::string::npos)
            {
                break;
            }
            patternPosition = separator + 1;
        }
        return true;
    }

    inline std::optional<float> FindNamInputCalibrationDbu(const std::string &deviceName)
    {
        // Maximum instrument-input level at 0 dBFS. Values are based on the
        // Ghost Note Audio Amp Simulation Input Gain database (July 2026).
        static constexpr NamInputCalibrationProfile profiles[] = {
            {"antelopeaudiodiscrete4pro", 18.0f},
            {"antelopeaudiodiscrete8pro", 18.0f},
            {"orionstudiosynergycore", 18.0f},
            {"antelopeaudiozenquadro", 20.0f},
            {"apogeejamx", 18.0f},
            {"apogeesymphonydesktop", 14.0f},
            {"arturiaaudiofuse16", 20.0f},
            {"arturiaminifuse", 11.5f},
            {"audientevo4", 10.0f},
            {"audientevo16", 10.0f},
            {"audientid4", 12.0f},
            {"audientid14", 12.0f},
            {"audientid22", 16.0f},
            {"audientid24", 12.0f},
            {"audientid44", 10.0f},
            {"audientid48", 15.0f},
            {"avidmboxstudio", 14.0f},
            {"axefxiii", 17.4f},
            {"behringerumc1820", 17.0f},
            {"behringerumc22", 22.0f},
            {"behringerum2", 22.0f},
            {"behringerumc404hd", 17.0f},
            {"behringerumc204hd", 17.0f},
            {"behringerumc202hd", 17.0f},
            {"blackstarpolar2", 10.0f},
            {"blackstarpolar4", 10.0f},
            {"focusriteclarett2pre", 15.0f},
            {"focusriteclarett8pre", 15.0f},
            {"focusriteclarettoctopre", 15.0f},
            {"focusritescarlett*2ndgen", 13.0f},
            {"focusritescarlett*3rdgen", 12.5f},
            {"focusritescarlett*4thgen", 12.0f},
            {"fractalfm3", 16.0f},
            {"ik*axeioone", 10.5f},
            {"ik*axeio", 14.0f},
            {"ik*irighdx", 9.0f},
            {"lewittconnect2", 14.7f},
            {"lewittconnect6", 8.2f},
            {"line6helix", 11.5f},
            {"maudioair1928", 6.8f},
            {"motu828usb3", 18.0f},
            {"motum2", 16.0f},
            {"motum4", 16.0f},
            {"motum6", 16.0f},
            {"motuultralitemk5", 18.0f},
            {"neuraldspquadcortex", 15.0f},
            {"presonusquantumes4", 15.0f},
            {"presonusquantum2626", 15.0f},
            {"presonus1824c", 15.0f},
            {"presonusquantumhd2", 21.0f},
            {"presonusquantumhd8", 21.0f},
            {"presonusstudio24c", 19.0f},
            {"prismlyra1", 17.0f},
            {"rmebabyfaceprofs", 13.0f},
            {"rmebabyfacepro", 13.0f},
            {"rmefireface802fs", 21.0f},
            {"rmefirefaceufxiii", 21.0f},
            {"solidstatelogicssl12", 14.0f},
            {"solidstatelogicssl18", 15.0f},
            {"solidstatelogicssl2plus", 15.0f},
            {"solidstatelogicssl2", 15.0f},
            {"ssl12", 14.0f},
            {"ssl18", 15.0f},
            {"steinbergur22c", 11.2f},
            {"toppinge2x2", 14.8f},
            {"uadapollotwinx", 12.2f},
            {"uadvolt", 12.5f},
            {"fractalaxefx3", 16.0f},
            {"fractalam4", 20.0f},
        };

        const std::string normalizedName = NormalizeNamCalibrationDeviceName(deviceName);
        const NamInputCalibrationProfile *bestMatch = nullptr;
        size_t bestMatchLength = 0;
        for (const auto &profile : profiles)
        {
            std::string pattern = profile.devicePattern;
            size_t specificity = std::count_if(
                pattern.begin(), pattern.end(),
                [](char c) { return c != '*'; });
            if (specificity > bestMatchLength &&
                MatchesNamCalibrationPattern(normalizedName, pattern))
            {
                bestMatch = &profile;
                bestMatchLength = specificity;
            }
        }
        if (bestMatch)
        {
            return bestMatch->maximumInputLevelDbu;
        }
        return std::nullopt;
    }
}
