// Maximum instrument-input level at 0 dBFS. Values are based on the
// Ghost Note Audio Amp Simulation Input Gain database (July 2026).
const NAM_INPUT_CALIBRATION_PROFILES: ReadonlyArray<readonly [string, number]> = [
    ["antelopeaudiodiscrete4pro", 18.0],
    ["antelopeaudiodiscrete8pro", 18.0],
    ["orionstudiosynergycore", 18.0],
    ["antelopeaudiozenquadro", 20.0],
    ["apogeejamx", 18.0],
    ["apogeesymphonydesktop", 14.0],
    ["arturiaaudiofuse16", 20.0],
    ["arturiaminifuse", 11.5],
    ["audientevo4", 10.0],
    ["audientevo16", 10.0],
    ["audientid4", 12.0],
    ["audientid14", 12.0],
    ["audientid22", 16.0],
    ["audientid24", 12.0],
    ["audientid44", 10.0],
    ["audientid48", 15.0],
    ["avidmboxstudio", 14.0],
    ["axefxiii", 17.4],
    ["behringerumc1820", 17.0],
    ["behringerumc22", 22.0],
    ["behringerum2", 22.0],
    ["behringerumc404hd", 17.0],
    ["behringerumc204hd", 17.0],
    ["behringerumc202hd", 17.0],
    ["blackstarpolar2", 10.0],
    ["blackstarpolar4", 10.0],
    ["focusriteclarett2pre", 15.0],
    ["focusriteclarett8pre", 15.0],
    ["focusriteclarettoctopre", 15.0],
    ["focusritescarlett*2ndgen", 13.0],
    ["focusritescarlett*3rdgen", 12.5],
    ["focusritescarlett*4thgen", 12.0],
    ["fractalfm3", 16.0],
    ["ik*axeioone", 10.5],
    ["ik*axeio", 14.0],
    ["ik*irighdx", 9.0],
    ["lewittconnect2", 14.7],
    ["lewittconnect6", 8.2],
    ["line6helix", 11.5],
    ["maudioair1928", 6.8],
    ["motu828usb3", 18.0],
    ["motum2", 16.0],
    ["motum4", 16.0],
    ["motum6", 16.0],
    ["motuultralitemk5", 18.0],
    ["neuraldspquadcortex", 15.0],
    ["presonusquantumes4", 15.0],
    ["presonusquantum2626", 15.0],
    ["presonus1824c", 15.0],
    ["presonusquantumhd2", 21.0],
    ["presonusquantumhd8", 21.0],
    ["presonusstudio24c", 19.0],
    ["prismlyra1", 17.0],
    ["rmebabyfaceprofs", 13.0],
    ["rmebabyfacepro", 13.0],
    ["rmefireface802fs", 21.0],
    ["rmefirefaceufxiii", 21.0],
    ["solidstatelogicssl12", 14.0],
    ["solidstatelogicssl18", 15.0],
    ["solidstatelogicssl2plus", 15.0],
    ["solidstatelogicssl2", 15.0],
    ["ssl12", 14.0],
    ["ssl18", 15.0],
    ["steinbergur22c", 11.2],
    ["toppinge2x2", 14.8],
    ["uadapollotwinx", 12.2],
    ["uadvolt", 12.5],
    ["fractalaxefx3", 16.0],
    ["fractalam4", 20.0],
];

function normalizeDeviceName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesPattern(normalizedName: string, pattern: string): boolean {
    let position = 0;
    for (const component of pattern.split("*")) {
        if (!component) {
            continue;
        }
        const match = normalizedName.indexOf(component, position);
        if (match === -1) {
            return false;
        }
        position = match + component.length;
    }
    return true;
}

export function findNamInputCalibrationDbu(deviceName: string): number | undefined {
    const normalizedName = normalizeDeviceName(deviceName);
    let bestMatchLength = 0;
    let result: number | undefined;
    for (const [pattern, calibration] of NAM_INPUT_CALIBRATION_PROFILES) {
        const specificity = pattern.replace(/\*/g, "").length;
        if (specificity > bestMatchLength && matchesPattern(normalizedName, pattern)) {
            bestMatchLength = specificity;
            result = calibration;
        }
    }
    return result;
}
