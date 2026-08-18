import Foundation

/// XMLTV (EPG) ayristirici. Foundation'in olay tabanli XMLParser'ini kullanir,
/// boylece yuzlerce megabaytlik rehber dosyalari da bellege sigar.
final class XMLTVParser: NSObject, XMLParserDelegate {
    struct Channel {
        var id: String
        var displayNames: [String]
        var icon: String?
    }

    private(set) var channels: [Channel] = []
    private(set) var programsByChannel: [String: [EpgProgram]] = [:]

    private var currentChannel: Channel?
    private var currentProgram: (channelId: String, start: Date, stop: Date)?
    private var currentTitle = ""
    private var currentDesc = ""
    private var textBuffer = ""
    private var elementStack: [String] = []

    private let minStop: Date
    private let maxStart: Date

    /// - Parameters:
    ///   - minStop: bu andan once biten yayinlar atlanir
    ///   - maxStart: bu andan sonra baslayan yayinlar atlanir
    init(minStop: Date = Date().addingTimeInterval(-6 * 3600),
         maxStart: Date = Date().addingTimeInterval(7 * 86400)) {
        self.minStop = minStop
        self.maxStart = maxStart
    }

    /// XMLTV zaman damgasi: "20250101235900 +0300".
    static func parseTime(_ value: String) -> Date? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        let digits = trimmed.prefix(while: { $0.isNumber })
        guard digits.count >= 12 else { return nil }
        let chars = Array(digits)
        func number(_ from: Int, _ length: Int) -> Int {
            Int(String(chars[from..<min(from + length, chars.count)])) ?? 0
        }
        var components = DateComponents()
        components.year = number(0, 4)
        components.month = number(4, 2)
        components.day = number(6, 2)
        components.hour = number(8, 2)
        components.minute = number(10, 2)
        components.second = chars.count >= 14 ? number(12, 2) : 0

        var offsetSeconds = 0
        let rest = trimmed.dropFirst(digits.count).trimmingCharacters(in: .whitespaces)
        if rest.count >= 5, let sign = rest.first, sign == "+" || sign == "-" {
            let body = Array(rest.dropFirst())
            let hours = Int(String(body[0..<2])) ?? 0
            let minutes = Int(String(body[2..<4])) ?? 0
            offsetSeconds = (hours * 3600 + minutes * 60) * (sign == "-" ? -1 : 1)
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let utc = calendar.date(from: components) else { return nil }
        return utc.addingTimeInterval(TimeInterval(-offsetSeconds))
    }

    func parse(data: Data) -> Bool {
        let parser = XMLParser(data: data)
        parser.delegate = self
        let ok = parser.parse()
        for key in programsByChannel.keys {
            programsByChannel[key]?.sort { $0.start < $1.start }
        }
        return ok
    }

    // MARK: XMLParserDelegate

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        elementStack.append(elementName)
        textBuffer = ""

        switch elementName {
        case "channel":
            if let id = attributeDict["id"] {
                currentChannel = Channel(id: id, displayNames: [], icon: nil)
            }
        case "programme":
            guard let channelId = attributeDict["channel"],
                  let start = Self.parseTime(attributeDict["start"] ?? "") else { return }
            let stop = Self.parseTime(attributeDict["stop"] ?? "") ?? start.addingTimeInterval(3600)
            guard stop >= minStop, start <= maxStart else { return }
            currentProgram = (channelId, start, stop)
            currentTitle = ""
            currentDesc = ""
        case "icon":
            if currentChannel != nil, let src = attributeDict["src"] {
                currentChannel?.icon = src
            }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        textBuffer += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        textBuffer += String(data: CDATABlock, encoding: .utf8) ?? ""
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?) {
        let text = textBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
        textBuffer = ""
        if !elementStack.isEmpty { elementStack.removeLast() }

        switch elementName {
        case "display-name":
            if !text.isEmpty { currentChannel?.displayNames.append(text) }
        case "title":
            if currentProgram != nil, currentTitle.isEmpty { currentTitle = text }
        case "desc":
            if currentProgram != nil, currentDesc.isEmpty { currentDesc = text }
        case "channel":
            if let channel = currentChannel { channels.append(channel) }
            currentChannel = nil
        case "programme":
            if let program = currentProgram {
                let entry = EpgProgram(
                    channelId: program.channelId,
                    title: currentTitle.isEmpty ? "Program" : currentTitle,
                    desc: currentDesc.isEmpty ? nil : currentDesc,
                    start: program.start,
                    stop: program.stop
                )
                programsByChannel[program.channelId, default: []].append(entry)
            }
            currentProgram = nil
        default:
            break
        }
    }

    /// Kanal adlarindan XMLTV kimligine kaba eslesme tablosu.
    func nameToIdMap() -> [String: String] {
        var map: [String: String] = [:]
        for channel in channels {
            for name in channel.displayNames {
                let exact = TextUtils.normalize(name)
                if !exact.isEmpty, map[exact] == nil { map[exact] = channel.id }
                let loose = TextUtils.channelMatchKey(name)
                if !loose.isEmpty, map[loose] == nil { map[loose] = channel.id }
            }
            let idKey = TextUtils.normalize(channel.id)
            if !idKey.isEmpty, map[idKey] == nil { map[idKey] = channel.id }
        }
        return map
    }

    /// Kataloktaki kanallari EPG kimlikleriyle eslestirip paket olusturur.
    func makeBundle(channels appChannels: [LiveChannel]) -> EpgBundle {
        var bundle = EpgBundle(programsByChannel: programsByChannel, channelIdMap: [:], fetchedAt: .now)
        let knownIds = Set(channels.map(\.id))
        let nameMap = nameToIdMap()
        for channel in appChannels {
            if let tvgId = channel.tvgId, knownIds.contains(tvgId) {
                bundle.channelIdMap[channel.id] = tvgId
            } else if let exact = nameMap[TextUtils.normalize(channel.name)] {
                bundle.channelIdMap[channel.id] = exact
            } else if let loose = nameMap[TextUtils.channelMatchKey(channel.name)] {
                bundle.channelIdMap[channel.id] = loose
            }
        }
        return bundle
    }
}
