import Foundation

enum IPTVError: LocalizedError {
    case invalidURL(String)
    case http(Int, String)
    case notJSON(String)
    case auth(String)
    case notPlaylist

    var errorDescription: String? {
        switch self {
        case let .invalidURL(value): return "Gecersiz adres: \(value)"
        case let .http(code, url): return "Sunucu \(code) dondurdu (\(url))"
        case let .notJSON(preview): return "Sunucu gecerli JSON dondurmedi: \(preview)"
        case let .auth(status): return "Xtream girisi reddedildi (durum: \(status))."
        case .notPlaylist: return "Bu adres gecerli bir M3U playlist gibi gorunmuyor."
        }
    }
}

struct XtreamAccount {
    var username: String
    var status: String
    var expiresAt: Date?
    var isTrial: Bool
    var activeConnections: Int
    var maxConnections: Int
}

/// Xtream Codes uyumlu paneller icin istemci.
struct XtreamClient {
    let host: String
    let username: String
    let password: String
    let userAgent: String?

    init(host: String, username: String, password: String, userAgent: String? = nil) {
        var normalized = host.trimmingCharacters(in: .whitespaces)
        if !normalized.lowercased().hasPrefix("http://") && !normalized.lowercased().hasPrefix("https://") {
            normalized = "http://" + normalized
        }
        while normalized.hasSuffix("/") { normalized.removeLast() }
        self.host = normalized
        self.username = username
        self.password = password
        self.userAgent = userAgent
    }

    private var encodedUser: String {
        username.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? username
    }

    private var encodedPassword: String {
        password.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? password
    }

    private func apiURL(action: String? = nil, extra: [String: String] = [:]) throws -> URL {
        guard var components = URLComponents(string: "\(host)/player_api.php") else {
            throw IPTVError.invalidURL(host)
        }
        var items = [URLQueryItem(name: "username", value: username), URLQueryItem(name: "password", value: password)]
        if let action { items.append(URLQueryItem(name: "action", value: action)) }
        items += extra.map { URLQueryItem(name: $0.key, value: $0.value) }
        components.queryItems = items
        guard let url = components.url else { throw IPTVError.invalidURL(host) }
        return url
    }

    var epgURL: String {
        "\(host)/xmltv.php?username=\(encodedUser)&password=\(encodedPassword)"
    }

    /// tvOS'un AVPlayer'i MPEG-TS akislarini oynatmadigi icin canli
    /// yayinlarda daima HLS (.m3u8) ucunu kullaniyoruz.
    func liveURL(streamId: Int) -> String {
        "\(host)/live/\(encodedUser)/\(encodedPassword)/\(streamId).m3u8"
    }

    func movieURL(streamId: Int, extension ext: String) -> String {
        "\(host)/movie/\(encodedUser)/\(encodedPassword)/\(streamId).\(ext)"
    }

    func episodeURL(episodeId: String, extension ext: String) -> String {
        "\(host)/series/\(encodedUser)/\(encodedPassword)/\(episodeId).\(ext)"
    }

    /// Gecmise donuk yayin (catchup) adresi.
    func timeshiftURL(streamId: Int, start: Date, durationMinutes: Int) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd:HH-mm"
        let stamp = formatter.string(from: start)
        return "\(host)/streaming/timeshift.php?username=\(encodedUser)&password=\(encodedPassword)&stream=\(streamId)&start=\(stamp)&duration=\(max(1, durationMinutes))"
    }

    private func fetchJSON(_ url: URL) async throws -> JSONValue {
        let data = try await HTTP.data(from: url, userAgent: userAgent)
        do {
            return try JSONDecoder().decode(JSONValue.self, from: data)
        } catch {
            let preview = String(data: data.prefix(120), encoding: .utf8) ?? "?"
            throw IPTVError.notJSON(preview)
        }
    }

    func authenticate() async throws -> XtreamAccount {
        let raw = try await fetchJSON(try apiURL())
        guard let info = raw.objectValue?.object("user_info") else {
            throw IPTVError.auth("bilinmiyor")
        }
        let status = info.string("status") ?? ""
        if info.string("auth") == "0" || ["banned", "disabled", "expired"].contains(status.lowercased()) {
            throw IPTVError.auth(status.isEmpty ? "bilinmiyor" : status)
        }
        guard let username = info.string("username") else {
            throw IPTVError.auth("kullanici bilgisi yok")
        }
        return XtreamAccount(
            username: username,
            status: status.isEmpty ? "Active" : status,
            expiresAt: info.double("exp_date").map { Date(timeIntervalSince1970: $0) },
            isTrial: info.string("is_trial") == "1",
            activeConnections: info.int("active_cons") ?? 0,
            maxConnections: info.int("max_connections") ?? 0
        )
    }

    private func fetchCategories(action: String, kind: MediaKind, playlistId: String) async throws -> [Category] {
        let raw = try await fetchJSON(try apiURL(action: action))
        return (raw.arrayValue ?? []).compactMap { value in
            guard let object = value.objectValue, let id = object.string("category_id") else { return nil }
            let name = object.string("category_name") ?? "Diger"
            return Category(
                id: "\(playlistId):cat-\(kind.rawValue):\(id)",
                name: name.trimmingCharacters(in: .whitespaces).isEmpty ? "Diger" : name,
                kind: kind,
                playlistId: playlistId
            )
        }
    }

    private func categoryIds(_ object: [String: JSONValue], kind: MediaKind, playlistId: String) -> [String] {
        if let list = object.array("category_ids"), !list.isEmpty {
            return list.compactMap { $0.stringValue }.map { "\(playlistId):cat-\(kind.rawValue):\($0)" }
        }
        let single = object.string("category_id") ?? "0"
        return ["\(playlistId):cat-\(kind.rawValue):\(single)"]
    }

    /// Kategoriler, canli kanallar, filmler ve dizileri tek seferde ceker.
    func fetchCatalog(playlistId: String, progress: @Sendable (String) -> Void = { _ in }) async throws -> Catalog {
        progress("Kategoriler")
        async let liveCats = fetchCategories(action: "get_live_categories", kind: .live, playlistId: playlistId)
        async let vodCats = fetchCategories(action: "get_vod_categories", kind: .movie, playlistId: playlistId)
        async let seriesCats = fetchCategories(action: "get_series_categories", kind: .series, playlistId: playlistId)
        var catalog = Catalog(playlistId: playlistId)
        let (live, vod, series) = try await (liveCats, vodCats, seriesCats)
        catalog.categories = live + vod + series

        progress("Canli kanallar")
        let rawLive = try await fetchJSON(try apiURL(action: "get_live_streams"))
        catalog.live = (rawLive.arrayValue ?? []).enumerated().compactMap { index, value in
            guard let object = value.objectValue, let streamId = object.int("stream_id") else { return nil }
            let name = object.string("name") ?? "Isimsiz"
            return LiveChannel(
                id: "\(playlistId):live:\(streamId)",
                playlistId: playlistId,
                name: name,
                searchKey: TextUtils.normalize(name),
                logo: object.string("stream_icon"),
                categoryIds: categoryIds(object, kind: .live, playlistId: playlistId),
                order: object.int("num") ?? index,
                url: liveURL(streamId: streamId),
                tvgId: object.string("epg_channel_id"),
                streamId: streamId,
                catchupDays: object.string("tv_archive") == "1" ? object.int("tv_archive_duration") : nil,
                channelNumber: object.int("num")
            )
        }

        progress("Filmler")
        let rawVod = try await fetchJSON(try apiURL(action: "get_vod_streams"))
        catalog.movies = (rawVod.arrayValue ?? []).enumerated().compactMap { index, value in
            guard let object = value.objectValue, let streamId = object.int("stream_id") else { return nil }
            let name = object.string("name") ?? "Isimsiz"
            let ext = object.string("container_extension") ?? "mp4"
            return MovieItem(
                id: "\(playlistId):movie:\(streamId)",
                playlistId: playlistId,
                name: name,
                searchKey: TextUtils.normalize(name),
                logo: object.string("stream_icon") ?? object.string("cover"),
                categoryIds: categoryIds(object, kind: .movie, playlistId: playlistId),
                order: object.int("num") ?? index,
                url: movieURL(streamId: streamId, extension: ext),
                streamId: streamId,
                containerExtension: ext,
                year: object.int("year") ?? object.string("releasedate").flatMap { Int($0.prefix(4)) },
                rating: object.double("rating")
            )
        }

        progress("Diziler")
        let rawSeries = try await fetchJSON(try apiURL(action: "get_series"))
        catalog.series = (rawSeries.arrayValue ?? []).enumerated().compactMap { index, value in
            guard let object = value.objectValue, let seriesId = object.int("series_id") else { return nil }
            let name = object.string("name") ?? "Isimsiz"
            let release = object.string("releaseDate") ?? object.string("release_date")
            let backdrop = object.array("backdrop_path")?.first?.stringValue ?? object.string("backdrop_path")
            return SeriesItem(
                id: "\(playlistId):series:\(seriesId)",
                playlistId: playlistId,
                name: name,
                searchKey: TextUtils.normalize(name),
                logo: object.string("cover"),
                categoryIds: categoryIds(object, kind: .series, playlistId: playlistId),
                order: object.int("num") ?? index,
                seriesId: seriesId,
                year: release.flatMap { Int($0.prefix(4)) },
                rating: object.double("rating"),
                plot: object.string("plot"),
                genre: object.string("genre"),
                cast: object.string("cast"),
                director: object.string("director"),
                backdrop: backdrop,
                lastModified: object.double("last_modified")
            )
        }

        return catalog
    }

    /// Film detaylari (konu, sure, oyuncular).
    func fetchMovieDetails(_ movie: MovieItem) async throws -> MovieItem {
        guard let streamId = movie.streamId else { return movie }
        let raw = try await fetchJSON(try apiURL(action: "get_vod_info", extra: ["vod_id": String(streamId)]))
        guard let root = raw.objectValue else { return movie }
        let info = root.object("info") ?? [:]
        var updated = movie
        updated.plot = info.string("plot") ?? info.string("description") ?? movie.plot
        updated.cast = info.string("cast") ?? info.string("actors") ?? movie.cast
        updated.director = info.string("director") ?? movie.director
        updated.genre = info.string("genre") ?? movie.genre
        updated.rating = info.double("rating") ?? movie.rating
        updated.durationSecs = info.string("duration")?.durationSeconds ?? movie.durationSecs
        updated.backdrop = info.array("backdrop_path")?.first?.stringValue ?? info.string("backdrop_path") ?? movie.backdrop
        if let ext = root.object("movie_data")?.string("container_extension") {
            updated.containerExtension = ext
            updated.url = movieURL(streamId: streamId, extension: ext)
        }
        return updated
    }

    /// Dizinin sezon ve bolum listesi.
    func fetchSeriesDetails(_ series: SeriesItem) async throws -> SeriesItem {
        guard let seriesId = series.seriesId else { return series }
        let raw = try await fetchJSON(try apiURL(action: "get_series_info", extra: ["series_id": String(seriesId)]))
        guard let root = raw.objectValue else { return series }

        var seasonMeta: [Int: [String: JSONValue]] = [:]
        for value in root.array("seasons") ?? [] {
            if let object = value.objectValue, let number = object.int("season_number") {
                seasonMeta[number] = object
            }
        }

        var seasons: [Season] = []
        if let episodesBySeason = root.object("episodes") {
            for (key, value) in episodesBySeason {
                let seasonNumber = Int(key) ?? 1
                let episodes: [Episode] = (value.arrayValue ?? []).enumerated().compactMap { index, item in
                    guard let object = item.objectValue else { return nil }
                    let episodeId = object.string("id") ?? String(index)
                    let ext = object.string("container_extension") ?? "mp4"
                    let info = object.object("info") ?? [:]
                    return Episode(
                        id: "\(series.playlistId):ep:\(episodeId)",
                        seriesId: series.id,
                        seasonNumber: seasonNumber,
                        episodeNumber: object.int("episode_num") ?? (index + 1),
                        title: object.string("title") ?? "Bolum \(index + 1)",
                        url: episodeURL(episodeId: episodeId, extension: ext),
                        plot: info.string("plot"),
                        durationSecs: info.string("duration")?.durationSeconds,
                        still: info.string("movie_image")
                    )
                }.sorted { $0.episodeNumber < $1.episodeNumber }

                guard !episodes.isEmpty else { continue }
                let meta = seasonMeta[seasonNumber]
                seasons.append(Season(
                    seasonNumber: seasonNumber,
                    name: meta?.string("name") ?? "\(seasonNumber). Sezon",
                    cover: meta?.string("cover") ?? meta?.string("cover_big"),
                    episodes: episodes
                ))
            }
        }

        var updated = series
        let info = root.object("info") ?? [:]
        updated.plot = info.string("plot") ?? series.plot
        updated.cast = info.string("cast") ?? series.cast
        updated.director = info.string("director") ?? series.director
        updated.genre = info.string("genre") ?? series.genre
        updated.rating = info.double("rating") ?? series.rating
        updated.backdrop = info.array("backdrop_path")?.first?.stringValue ?? series.backdrop
        updated.seasons = seasons.sorted { $0.seasonNumber < $1.seasonNumber }
        return updated
    }
}
