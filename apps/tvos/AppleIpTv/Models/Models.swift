import Foundation

// MARK: - Kaynaklar

/// Bir aboneligin baglanti bilgileri. M3U playlist veya Xtream Codes paneli.
enum Source: Codable, Hashable {
    case m3u(url: String?, inlineContent: String?, epgURL: String?, userAgent: String?)
    case xtream(host: String, username: String, password: String, epgURL: String?, userAgent: String?)

    var isXtream: Bool {
        if case .xtream = self { return true }
        return false
    }

    var epgURL: String? {
        switch self {
        case let .m3u(_, _, epgURL, _): return epgURL
        case let .xtream(_, _, _, epgURL, _): return epgURL
        }
    }

    var userAgent: String? {
        switch self {
        case let .m3u(_, _, _, agent): return agent
        case let .xtream(_, _, _, _, agent): return agent
        }
    }
}

struct Playlist: Codable, Identifiable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var source: Source
    var createdAt: Date = .now
    var lastSyncAt: Date?
    var expiresAt: Date?
    var enabled: Bool = true
}

// MARK: - Icerik

enum MediaKind: String, Codable, Hashable {
    case live, movie, series
}

struct Category: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let kind: MediaKind
    let playlistId: String
}

struct LiveChannel: Codable, Identifiable, Hashable {
    let id: String
    let playlistId: String
    var name: String
    var searchKey: String
    var logo: String?
    var categoryIds: [String]
    var order: Int
    var url: String
    var tvgId: String?
    var streamId: Int?
    var catchupDays: Int?
    var channelNumber: Int?
}

struct MovieItem: Codable, Identifiable, Hashable {
    let id: String
    let playlistId: String
    var name: String
    var searchKey: String
    var logo: String?
    var categoryIds: [String]
    var order: Int
    var url: String
    var streamId: Int?
    var containerExtension: String?
    var year: Int?
    var rating: Double?
    var plot: String?
    var durationSecs: Double?
    var genre: String?
    var cast: String?
    var director: String?
    var backdrop: String?
}

struct Episode: Codable, Identifiable, Hashable {
    let id: String
    let seriesId: String
    var seasonNumber: Int
    var episodeNumber: Int
    var title: String
    var url: String
    var plot: String?
    var durationSecs: Double?
    var still: String?
}

struct Season: Codable, Identifiable, Hashable {
    var id: Int { seasonNumber }
    var seasonNumber: Int
    var name: String?
    var cover: String?
    var episodes: [Episode]
}

struct SeriesItem: Codable, Identifiable, Hashable {
    let id: String
    let playlistId: String
    var name: String
    var searchKey: String
    var logo: String?
    var categoryIds: [String]
    var order: Int
    var seriesId: Int?
    var year: Int?
    var rating: Double?
    var plot: String?
    var genre: String?
    var cast: String?
    var director: String?
    var backdrop: String?
    var lastModified: Double?
    var seasons: [Season]?
}

/// Bir kaynagin tum icerigi.
struct Catalog: Codable, Hashable {
    var playlistId: String
    var live: [LiveChannel] = []
    var movies: [MovieItem] = []
    var series: [SeriesItem] = []
    var categories: [Category] = []
    var fetchedAt: Date = .now

    static func merged(_ catalogs: [Catalog]) -> Catalog {
        var result = Catalog(playlistId: "*")
        for catalog in catalogs {
            result.live += catalog.live
            result.movies += catalog.movies
            result.series += catalog.series
            result.categories += catalog.categories
        }
        return result
    }
}

// MARK: - EPG

struct EpgProgram: Codable, Hashable, Identifiable {
    var id: String { "\(channelId)-\(start.timeIntervalSince1970)" }
    let channelId: String
    var title: String
    var desc: String?
    var start: Date
    var stop: Date
}

/// Kanal kimligine gore gruplanmis, baslangica gore sirali program tablosu.
struct EpgBundle: Codable {
    var programsByChannel: [String: [EpgProgram]] = [:]
    /// Uygulama kanal kimligi -> XMLTV kanal kimligi.
    var channelIdMap: [String: String] = [:]
    var fetchedAt: Date = .now

    func program(for channel: LiveChannel, at date: Date = .now) -> EpgProgram? {
        guard let xmltvId = channelIdMap[channel.id] ?? channel.tvgId,
              let list = programsByChannel[xmltvId] else { return nil }
        return list.first { $0.start <= date && $0.stop > date }
    }

    func upcoming(for channel: LiveChannel, at date: Date = .now, limit: Int = 5) -> [EpgProgram] {
        guard let xmltvId = channelIdMap[channel.id] ?? channel.tvgId,
              let list = programsByChannel[xmltvId] else { return [] }
        return Array(list.filter { $0.stop > date }.prefix(limit))
    }

    func programs(for channel: LiveChannel, from: Date, to: Date) -> [EpgProgram] {
        guard let xmltvId = channelIdMap[channel.id] ?? channel.tvgId,
              let list = programsByChannel[xmltvId] else { return [] }
        return list.filter { $0.stop > from && $0.start < to }
    }
}

// MARK: - Profiller

struct ProfileSettings: Codable, Hashable {
    var resumeThresholdSecs: Double = 30
    var completedAtPercent: Double = 95
    var startTab: String = "home"
    var lockedCategoryIds: [String] = []
    var hiddenCategoryIds: [String] = []
    var liveBufferSecs: Double = 6
    var epgOffsetMinutes: Int = 0
}

struct Profile: Codable, Identifiable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var avatar: String
    var createdAt: Date = .now
    var kids: Bool = false
    /// SHA-256 hex; bos ise kilit yok.
    var pinHash: String?
    var settings: ProfileSettings = ProfileSettings()
}

struct FavoriteEntry: Codable, Hashable, Identifiable {
    var id: String { itemId }
    let itemId: String
    let kind: MediaKind
    var addedAt: Date = .now
}

struct WatchProgress: Codable, Hashable, Identifiable {
    var id: String { episodeId ?? itemId }
    let itemId: String
    let kind: MediaKind
    var episodeId: String?
    var positionSecs: Double
    var durationSecs: Double
    var updatedAt: Date = .now
    var completed: Bool = false
    var title: String
    var poster: String?

    var percent: Double {
        durationSecs > 0 ? min(100, max(0, positionSecs / durationSecs * 100)) : 0
    }
}
