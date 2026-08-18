import Foundation

/// M3U / M3U8 playlist ayristirici.
///
/// Canli kanal, film ve dizi bolumlerini adrese ve grup adina bakarak
/// ayirir; dizi bolumlerini "Ad S01 E02" kalibindan sezonlara gruplar.
enum M3UParser {
    struct Entry {
        var duration: Double
        var title: String
        var url: String
        var attributes: [String: String]
    }

    private static let attributeRegex = try! NSRegularExpression(pattern: "([\\w-]+)=\"([^\"]*)\"")
    private static let episodeRegex = try! NSRegularExpression(
        pattern: "^(.*?)[\\s._-]*[sS](\\d{1,2})[\\s._-]*[eE](\\d{1,3})\\b(.*)$"
    )
    private static let altEpisodeRegex = try! NSRegularExpression(
        pattern: "^(.*?)[\\s._-]+(\\d{1,2})x(\\d{1,3})\\b(.*)$"
    )
    private static let yearRegex = try! NSRegularExpression(pattern: "\\((\\d{4})\\)")

    private static func attributes(in line: String) -> [String: String] {
        var result: [String: String] = [:]
        let range = NSRange(line.startIndex..<line.endIndex, in: line)
        for match in attributeRegex.matches(in: line, range: range) {
            guard let keyRange = Range(match.range(at: 1), in: line),
                  let valueRange = Range(match.range(at: 2), in: line) else { continue }
            result[line[keyRange].lowercased()] = String(line[valueRange])
        }
        return result
    }

    /// Ham metni girdilere ayirir; ayrica #EXTM3U satirindaki EPG adresini dondurur.
    static func parse(_ text: String) -> (entries: [Entry], epgURL: String?) {
        var entries: [Entry] = []
        var epgURL: String?
        var pending: (duration: Double, title: String, attributes: [String: String])?
        var groupOverride: String?

        for rawLine in text.split(whereSeparator: { $0 == "\n" || $0 == "\r" }) {
            let line = rawLine.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "\u{FEFF}", with: "")
            if line.isEmpty { continue }

            if line.hasPrefix("#EXTM3U") {
                let attrs = attributes(in: line)
                epgURL = attrs["url-tvg"] ?? attrs["x-tvg-url"] ?? attrs["tvg-url"]
                continue
            }

            if line.hasPrefix("#EXTINF") {
                let head: String
                let title: String
                if let commaIndex = line.firstIndex(of: ",") {
                    head = String(line[line.startIndex..<commaIndex])
                    title = String(line[line.index(after: commaIndex)...]).trimmingCharacters(in: .whitespaces)
                } else {
                    head = line
                    title = ""
                }
                let durationText = head
                    .replacingOccurrences(of: "#EXTINF:", with: "")
                    .split(separator: " ").first.map(String.init) ?? "-1"
                let attrs = attributes(in: head)
                pending = (Double(durationText) ?? -1, title.isEmpty ? (attrs["tvg-name"] ?? "Isimsiz") : title, attrs)
                groupOverride = nil
                continue
            }

            if line.hasPrefix("#EXTGRP:") {
                groupOverride = String(line.dropFirst("#EXTGRP:".count)).trimmingCharacters(in: .whitespaces)
                continue
            }

            if line.hasPrefix("#") { continue }
            guard var current = pending else { continue }

            if let group = groupOverride, current.attributes["group-title"] == nil {
                current.attributes["group-title"] = group
            }
            // Adres sonundaki "|User-Agent=..." bicimindeki basliklari at.
            let url = line.split(separator: "|", maxSplits: 1).first.map(String.init) ?? line
            entries.append(Entry(duration: current.duration, title: current.title, url: url, attributes: current.attributes))
            pending = nil
            groupOverride = nil
        }

        return (entries, epgURL)
    }

    private enum Kind { case live, movie, series }

    private static func classify(_ entry: Entry) -> Kind {
        let path = (URL(string: entry.url)?.path ?? entry.url).lowercased()
        if path.contains("/series/") { return .series }
        if path.contains("/movie/") || path.contains("/movies/") || path.contains("/vod/") { return .movie }

        let group = TextUtils.normalize(entry.attributes["group-title"] ?? "")
        if group.contains("dizi") || group.contains("series") {
            if episodeInfo(from: entry.title) != nil { return .series }
        }
        if group.contains("film") || group.contains("movie") || group.contains("vod") || group.contains("sinema") {
            return .movie
        }
        return entry.duration > 0 ? .movie : .live
    }

    struct EpisodeInfo {
        var seriesName: String
        var season: Int
        var episode: Int
        var title: String
    }

    /// "Dizi Adi S01 E05 - Bolum" gibi basliklardan sezon/bolum cikarir.
    static func episodeInfo(from title: String) -> EpisodeInfo? {
        let range = NSRange(title.startIndex..<title.endIndex, in: title)
        let match = episodeRegex.firstMatch(in: title, range: range) ?? altEpisodeRegex.firstMatch(in: title, range: range)
        guard let match,
              let nameRange = Range(match.range(at: 1), in: title),
              let seasonRange = Range(match.range(at: 2), in: title),
              let episodeRange = Range(match.range(at: 3), in: title),
              let season = Int(title[seasonRange]),
              let episode = Int(title[episodeRange]) else { return nil }

        let name = title[nameRange].trimmingCharacters(in: CharacterSet(charactersIn: " ._-"))
        guard !name.isEmpty else { return nil }
        var rest = ""
        if let restRange = Range(match.range(at: 4), in: title) {
            rest = title[restRange].trimmingCharacters(in: CharacterSet(charactersIn: " ._-:"))
        }
        return EpisodeInfo(seriesName: name, season: season, episode: episode, title: rest.isEmpty ? "Bolum \(episode)" : rest)
    }

    /// Playlist metnini uygulamanin katalog modeline cevirir.
    static func buildCatalog(playlistId: String, text: String) -> (catalog: Catalog, epgURL: String?) {
        let parsed = parse(text)
        var catalog = Catalog(playlistId: playlistId)
        var categories: [String: Category] = [:]
        var seriesById: [String: SeriesItem] = [:]

        func ensureCategory(_ kind: MediaKind, _ rawName: String) -> String {
            let name = rawName.trimmingCharacters(in: .whitespaces).isEmpty ? "Diger" : rawName
            let id = "\(playlistId):cat-\(kind.rawValue):\(TextUtils.normalize(name))"
            if categories[id] == nil {
                categories[id] = Category(id: id, name: name, kind: kind, playlistId: playlistId)
            }
            return id
        }

        for (index, entry) in parsed.entries.enumerated() {
            let group = entry.attributes["group-title"] ?? "Diger"
            let logo = entry.attributes["tvg-logo"]

            switch classify(entry) {
            case .live:
                let categoryId = ensureCategory(.live, group)
                catalog.live.append(LiveChannel(
                    id: "\(playlistId):live:\(entry.attributes["tvg-id"] ?? entry.url)",
                    playlistId: playlistId,
                    name: entry.title,
                    searchKey: TextUtils.normalize(entry.title),
                    logo: logo,
                    categoryIds: [categoryId],
                    order: index,
                    url: entry.url,
                    tvgId: entry.attributes["tvg-id"],
                    streamId: nil,
                    catchupDays: entry.attributes["catchup-days"].flatMap { Int($0) },
                    channelNumber: entry.attributes["tvg-chno"].flatMap { Int($0) }
                ))

            case .movie:
                let categoryId = ensureCategory(.movie, group)
                var year: Int?
                let range = NSRange(entry.title.startIndex..<entry.title.endIndex, in: entry.title)
                if let match = yearRegex.firstMatch(in: entry.title, range: range),
                   let yearRange = Range(match.range(at: 1), in: entry.title) {
                    year = Int(entry.title[yearRange])
                }
                catalog.movies.append(MovieItem(
                    id: "\(playlistId):movie:\(entry.url)",
                    playlistId: playlistId,
                    name: entry.title,
                    searchKey: TextUtils.normalize(entry.title),
                    logo: logo,
                    categoryIds: [categoryId],
                    order: index,
                    url: entry.url,
                    streamId: nil,
                    containerExtension: URL(string: entry.url)?.pathExtension,
                    year: year,
                    durationSecs: entry.duration > 0 ? entry.duration : nil
                ))

            case .series:
                let categoryId = ensureCategory(.series, group)
                let info = episodeInfo(from: entry.title)
                let seriesName = info?.seriesName ?? entry.title
                let seriesId = "\(playlistId):series:\(TextUtils.normalize(seriesName))"

                var series = seriesById[seriesId] ?? SeriesItem(
                    id: seriesId,
                    playlistId: playlistId,
                    name: seriesName,
                    searchKey: TextUtils.normalize(seriesName),
                    logo: logo,
                    categoryIds: [categoryId],
                    order: index,
                    seasons: []
                )
                if !series.categoryIds.contains(categoryId) { series.categoryIds.append(categoryId) }

                let seasonNumber = info?.season ?? 1
                var seasons = series.seasons ?? []
                let existingCount = seasons.first { $0.seasonNumber == seasonNumber }?.episodes.count ?? 0
                let episode = Episode(
                    id: "\(playlistId):ep:\(entry.url)",
                    seriesId: seriesId,
                    seasonNumber: seasonNumber,
                    episodeNumber: info?.episode ?? (existingCount + 1),
                    title: info?.title ?? entry.title,
                    url: entry.url,
                    durationSecs: entry.duration > 0 ? entry.duration : nil,
                    still: logo
                )
                if let position = seasons.firstIndex(where: { $0.seasonNumber == seasonNumber }) {
                    seasons[position].episodes.append(episode)
                } else {
                    seasons.append(Season(seasonNumber: seasonNumber, name: "\(seasonNumber). Sezon", episodes: [episode]))
                }
                series.seasons = seasons
                seriesById[seriesId] = series
            }
        }

        catalog.series = seriesById.values.map { series in
            var copy = series
            copy.seasons = (series.seasons ?? [])
                .sorted { $0.seasonNumber < $1.seasonNumber }
                .map { season in
                    var seasonCopy = season
                    seasonCopy.episodes.sort { $0.episodeNumber < $1.episodeNumber }
                    return seasonCopy
                }
            return copy
        }.sorted { $0.order < $1.order }

        catalog.categories = Array(categories.values)
        return (catalog, parsed.epgURL)
    }
}
