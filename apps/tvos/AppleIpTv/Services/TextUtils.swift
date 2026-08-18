import CryptoKit
import Foundation

enum TextUtils {
    /// Arama icin metni sadelestirir: kucuk harf, Turkce karakter ve aksan
    /// sadelestirmesi, alfanumerik disi karakterlerin tek bosluga indirgenmesi.
    static func normalize(_ input: String) -> String {
        let lowered = input.lowercased(with: Locale(identifier: "tr_TR"))
        let replaced = lowered
            .replacingOccurrences(of: "ı", with: "i")
            .replacingOccurrences(of: "ş", with: "s")
            .replacingOccurrences(of: "ğ", with: "g")
            .replacingOccurrences(of: "ü", with: "u")
            .replacingOccurrences(of: "ö", with: "o")
            .replacingOccurrences(of: "ç", with: "c")
        let folded = replaced.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en_US"))
        var output = ""
        var lastWasSpace = true
        for character in folded {
            if character.isLetter || character.isNumber {
                output.append(character)
                lastWasSpace = false
            } else if !lastWasSpace {
                output.append(" ")
                lastWasSpace = true
            }
        }
        return output.trimmingCharacters(in: .whitespaces)
    }

    private static let qualityTokens: Set<String> = [
        "fhd", "uhd", "hd", "sd", "4k", "8k", "hevc", "h265", "h264",
        "raw", "backup", "vip", "multi", "tr", "turk", "turkiye"
    ]

    /// EPG eslestirmesi icin kanal adindan kalite/ulke etiketlerini atar.
    static func channelMatchKey(_ name: String) -> String {
        normalize(name)
            .split(separator: " ")
            .filter { !qualityTokens.contains(String($0)) }
            .joined(separator: " ")
    }

    static func sha256Hex(_ value: String) -> String {
        let digest = SHA256.hash(data: Data("appleiptv:\(value)".utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

extension String {
    /// "01:23:45" veya "83" bicimindeki degerleri saniyeye cevirir.
    var durationSeconds: Double? {
        if let direct = Double(self) { return direct }
        let parts = split(separator: ":").compactMap { Double($0) }
        switch parts.count {
        case 3: return parts[0] * 3600 + parts[1] * 60 + parts[2]
        case 2: return parts[0] * 60 + parts[1]
        default: return nil
        }
    }
}
