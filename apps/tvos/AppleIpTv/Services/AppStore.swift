import Foundation
import SwiftUI

/// Uygulamanin tek merkezli durumu: profiller, kaynaklar, katalog, EPG,
/// favoriler ve izleme gecmisi.
@MainActor
final class AppStore: ObservableObject {
    private struct StringBox: Codable { var value: String }

    @Published private(set) var profiles: [Profile] = []
    @Published private(set) var activeProfileId: String?
    @Published private(set) var playlists: [Playlist] = []
    @Published private(set) var catalogs: [String: Catalog] = [:]
    @Published private(set) var epgBundles: [String: EpgBundle] = [:]
    @Published private(set) var favorites: [FavoriteEntry] = []
    @Published private(set) var progress: [WatchProgress] = []
    @Published private(set) var recentChannelIds: [String] = []

    @Published var syncMessage: String?
    @Published var errorMessage: String?
    /// Bu oturumda PIN ile acilmis kilitli kategoriler.
    @Published private(set) var unlockedCategoryIds: Set<String> = []

    private let store = Persistence.shared

    // MARK: - Turetilmis veriler

    var activeProfile: Profile? {
        profiles.first { $0.id == activeProfileId }
    }

    /// Etkin kaynaklarin birlesik katalogu.
    var catalog: Catalog {
        Catalog.merged(playlists.filter(\.enabled).compactMap { catalogs[$0.id] })
    }

    /// Cocuk profilinde yetiskin kategorileri de gizlenir.
    var hiddenCategoryIds: Set<String> {
        var hidden = Set(activeProfile?.settings.hiddenCategoryIds ?? [])
        if activeProfile?.kids == true {
            let keywords = ["adult", "xxx", "+18", "18+", "erotic", "porn", "yetiskin"]
            for category in catalog.categories where keywords.contains(where: { category.name.lowercased().contains($0) }) {
                hidden.insert(category.id)
            }
        }
        return hidden
    }

    var lockedCategoryIds: Set<String> {
        Set(activeProfile?.settings.lockedCategoryIds ?? []).subtracting(unlockedCategoryIds)
    }

    func categories(of kind: MediaKind) -> [Category] {
        let hidden = hiddenCategoryIds
        return catalog.categories
            .filter { $0.kind == kind && !hidden.contains($0.id) }
            .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    func channels(in categoryId: String?) -> [LiveChannel] {
        let hidden = hiddenCategoryIds
        let locked = lockedCategoryIds
        let list: [LiveChannel]
        if let categoryId {
            list = catalog.live.filter { $0.categoryIds.contains(categoryId) }
        } else {
            list = catalog.live.filter { channel in
                !channel.categoryIds.contains(where: { hidden.contains($0) || locked.contains($0) })
            }
        }
        return list.sorted { $0.order < $1.order }
    }

    func movies(in categoryId: String?) -> [MovieItem] {
        let hidden = hiddenCategoryIds
        let list = categoryId.map { id in catalog.movies.filter { $0.categoryIds.contains(id) } }
            ?? catalog.movies.filter { movie in !movie.categoryIds.contains(where: { hidden.contains($0) }) }
        return list.sorted { $0.order < $1.order }
    }

    func series(in categoryId: String?) -> [SeriesItem] {
        let hidden = hiddenCategoryIds
        let list = categoryId.map { id in catalog.series.filter { $0.categoryIds.contains(id) } }
            ?? catalog.series.filter { series in !series.categoryIds.contains(where: { hidden.contains($0) }) }
        return list.sorted { $0.order < $1.order }
    }

    func epgBundle(for channel: LiveChannel) -> EpgBundle? {
        epgBundles[channel.playlistId]
    }

    func currentProgram(for channel: LiveChannel) -> EpgProgram? {
        let offset = TimeInterval((activeProfile?.settings.epgOffsetMinutes ?? 0) * 60)
        return epgBundle(for: channel)?.program(for: channel, at: Date().addingTimeInterval(-offset))
    }

    func upcomingPrograms(for channel: LiveChannel, limit: Int = 5) -> [EpgProgram] {
        let offset = TimeInterval((activeProfile?.settings.epgOffsetMinutes ?? 0) * 60)
        return epgBundle(for: channel)?.upcoming(for: channel, at: Date().addingTimeInterval(-offset), limit: limit) ?? []
    }

    /// Katalog genelinde arama. Tam eslesme ve bas eslesmesi one alinir.
    func search(_ query: String, kinds: Set<MediaKind> = [.live, .movie, .series], limit: Int = 200) -> [SearchResult] {
        let needle = TextUtils.normalize(query)
        guard !needle.isEmpty else { return [] }
        let terms = needle.split(separator: " ").map(String.init)
        let hidden = hiddenCategoryIds
        var scored: [(SearchResult, Int)] = []

        func score(_ key: String) -> Int? {
            guard terms.allSatisfy({ key.contains($0) }) else { return nil }
            if key == needle { return 1000 }
            if key.hasPrefix(needle) { return 500 }
            if key.contains(" " + needle) { return 250 }
            return 100
        }

        if kinds.contains(.live) {
            for channel in catalog.live where !channel.categoryIds.contains(where: { hidden.contains($0) }) {
                if let value = score(channel.searchKey) { scored.append((.live(channel), value)) }
            }
        }
        if kinds.contains(.movie) {
            for movie in catalog.movies where !movie.categoryIds.contains(where: { hidden.contains($0) }) {
                if let value = score(movie.searchKey) { scored.append((.movie(movie), value)) }
            }
        }
        if kinds.contains(.series) {
            for series in catalog.series where !series.categoryIds.contains(where: { hidden.contains($0) }) {
                if let value = score(series.searchKey) { scored.append((.series(series), value)) }
            }
        }

        return scored.sorted { $0.1 > $1.1 }.prefix(limit).map { $0.0 }
    }

    // MARK: - Yukleme

    func load() {
        profiles = store.load([Profile].self, key: Persistence.Keys.profiles) ?? []
        let storedId = store.load(StringBox.self, key: Persistence.Keys.activeProfile)?.value
        activeProfileId = profiles.contains(where: { $0.id == storedId }) ? storedId : nil
        playlists = store.load([Playlist].self, key: Persistence.Keys.playlists) ?? []

        for playlist in playlists {
            if let catalog = store.load(Catalog.self, key: Persistence.Keys.catalog(playlist.id)) {
                catalogs[playlist.id] = catalog
            }
            if let bundle = store.load(EpgBundle.self, key: Persistence.Keys.epg(playlist.id)) {
                epgBundles[playlist.id] = bundle
            }
        }
        if let id = activeProfileId { loadProfileData(id) }
    }

    private func loadProfileData(_ profileId: String) {
        favorites = store.load([FavoriteEntry].self, key: Persistence.Keys.favorites(profileId)) ?? []
        progress = store.load([WatchProgress].self, key: Persistence.Keys.progress(profileId)) ?? []
        recentChannelIds = store.load([String].self, key: Persistence.Keys.recent(profileId)) ?? []
    }

    // MARK: - Profiller

    @discardableResult
    func addProfile(name: String, avatar: String, kids: Bool, pin: String?) -> Profile {
        let profile = Profile(
            name: name.trimmingCharacters(in: .whitespaces).isEmpty ? "Profil" : name,
            avatar: avatar,
            kids: kids,
            pinHash: pin.flatMap { $0.isEmpty ? nil : TextUtils.sha256Hex($0) }
        )
        profiles.append(profile)
        store.save(profiles, key: Persistence.Keys.profiles)
        return profile
    }

    func selectProfile(_ profileId: String) {
        activeProfileId = profileId
        unlockedCategoryIds = []
        store.save(StringBox(value: profileId), key: Persistence.Keys.activeProfile)
        loadProfileData(profileId)
    }

    func signOut() {
        activeProfileId = nil
        favorites = []
        progress = []
        recentChannelIds = []
        store.remove(key: Persistence.Keys.activeProfile)
    }

    func updateProfile(_ profile: Profile) {
        guard let index = profiles.firstIndex(where: { $0.id == profile.id }) else { return }
        profiles[index] = profile
        store.save(profiles, key: Persistence.Keys.profiles)
    }

    func updateActiveSettings(_ transform: (inout ProfileSettings) -> Void) {
        guard var profile = activeProfile else { return }
        transform(&profile.settings)
        updateProfile(profile)
    }

    func removeProfile(_ profileId: String) {
        profiles.removeAll { $0.id == profileId }
        store.save(profiles, key: Persistence.Keys.profiles)
        store.remove(key: Persistence.Keys.favorites(profileId))
        store.remove(key: Persistence.Keys.progress(profileId))
        store.remove(key: Persistence.Keys.recent(profileId))
        if activeProfileId == profileId { signOut() }
    }

    func verifyPin(_ pin: String, for profile: Profile) -> Bool {
        guard let hash = profile.pinHash else { return true }
        return TextUtils.sha256Hex(pin) == hash
    }

    func setPin(_ pin: String?, for profile: Profile) {
        var updated = profile
        updated.pinHash = (pin?.isEmpty ?? true) ? nil : TextUtils.sha256Hex(pin!)
        updateProfile(updated)
    }

    func unlockCategory(_ categoryId: String) {
        unlockedCategoryIds.insert(categoryId)
    }

    // MARK: - Kaynaklar

    @discardableResult
    func addPlaylist(name: String, source: Source) async -> Playlist? {
        var uniqueName = name.trimmingCharacters(in: .whitespaces).isEmpty ? "Kaynak" : name
        var counter = 2
        while playlists.contains(where: { $0.name.lowercased() == uniqueName.lowercased() }) {
            uniqueName = "\(name) \(counter)"
            counter += 1
        }
        let playlist = Playlist(name: uniqueName, source: source)
        playlists.append(playlist)
        store.save(playlists, key: Persistence.Keys.playlists)
        do {
            try await sync(playlistId: playlist.id, force: true)
            return playlist
        } catch {
            errorMessage = error.localizedDescription
            playlists.removeAll { $0.id == playlist.id }
            store.save(playlists, key: Persistence.Keys.playlists)
            return nil
        }
    }

    func removePlaylist(_ playlistId: String) {
        playlists.removeAll { $0.id == playlistId }
        catalogs[playlistId] = nil
        epgBundles[playlistId] = nil
        store.save(playlists, key: Persistence.Keys.playlists)
        store.remove(key: Persistence.Keys.catalog(playlistId))
        store.remove(key: Persistence.Keys.epg(playlistId))
    }

    func setPlaylistEnabled(_ playlistId: String, enabled: Bool) {
        guard let index = playlists.firstIndex(where: { $0.id == playlistId }) else { return }
        playlists[index].enabled = enabled
        store.save(playlists, key: Persistence.Keys.playlists)
    }

    /// Bir kaynagin katalogunu (ve varsa EPG'sini) yeniler.
    func sync(playlistId: String, force: Bool = false) async throws {
        guard let index = playlists.firstIndex(where: { $0.id == playlistId }) else { return }
        let playlist = playlists[index]
        if !force, let last = playlist.lastSyncAt, Date().timeIntervalSince(last) < 24 * 3600 { return }

        syncMessage = "\(playlist.name): baglaniliyor"
        defer { syncMessage = nil }

        var epgURL = playlist.source.epgURL
        let catalog: Catalog

        switch playlist.source {
        case let .xtream(host, username, password, _, userAgent):
            let client = XtreamClient(host: host, username: username, password: password, userAgent: userAgent)
            let account = try await client.authenticate()
            playlists[index].expiresAt = account.expiresAt
            catalog = try await client.fetchCatalog(playlistId: playlistId) { [weak self] stage in
                Task { @MainActor in self?.syncMessage = "\(playlist.name): \(stage)" }
            }
            if epgURL == nil { epgURL = client.epgURL }

        case let .m3u(url, inlineContent, _, userAgent):
            let text: String
            if let inlineContent {
                text = inlineContent
            } else {
                guard let url, let parsed = URL(string: url) else { throw IPTVError.invalidURL(url ?? "") }
                syncMessage = "\(playlist.name): playlist indiriliyor"
                text = try await HTTP.text(from: parsed, userAgent: userAgent)
            }
            guard text.contains("#EXTINF") || text.contains("#EXTM3U") else { throw IPTVError.notPlaylist }
            syncMessage = "\(playlist.name): ayristiriliyor"
            let built = M3UParser.buildCatalog(playlistId: playlistId, text: text)
            catalog = built.catalog
            if epgURL == nil { epgURL = built.epgURL }
        }

        catalogs[playlistId] = catalog
        playlists[index].lastSyncAt = .now
        store.save(catalog, key: Persistence.Keys.catalog(playlistId))
        store.save(playlists, key: Persistence.Keys.playlists)

        if let epgURL, let url = URL(string: epgURL) {
            syncMessage = "\(playlist.name): EPG indiriliyor"
            // EPG basarisiz olsa da katalog kullanilabilir kalmali.
            if let bundle = try? await loadEpg(url: url, channels: catalog.live, userAgent: playlist.source.userAgent) {
                epgBundles[playlistId] = bundle
                store.save(bundle, key: Persistence.Keys.epg(playlistId))
            }
        }
    }

    func syncAll(force: Bool = false) async {
        for playlist in playlists where playlist.enabled {
            do {
                try await sync(playlistId: playlist.id, force: force)
            } catch {
                errorMessage = "\(playlist.name): \(error.localizedDescription)"
            }
        }
    }

    private func loadEpg(url: URL, channels: [LiveChannel], userAgent: String?) async throws -> EpgBundle {
        let raw = try await HTTP.data(from: url, userAgent: userAgent)
        let data = HTTP.maybeGunzipped(raw)
        return try await Task.detached(priority: .utility) {
            let parser = XMLTVParser()
            _ = parser.parse(data: data)
            return parser.makeBundle(channels: channels)
        }.value
    }

    // MARK: - Favoriler ve gecmis

    func isFavorite(_ id: String) -> Bool {
        favorites.contains { $0.itemId == id }
    }

    func toggleFavorite(id: String, kind: MediaKind) {
        guard let profileId = activeProfileId else { return }
        if let index = favorites.firstIndex(where: { $0.itemId == id }) {
            favorites.remove(at: index)
        } else {
            favorites.append(FavoriteEntry(itemId: id, kind: kind))
        }
        store.save(favorites, key: Persistence.Keys.favorites(profileId))
    }

    func watchProgress(for itemId: String, episodeId: String? = nil) -> WatchProgress? {
        let key = episodeId ?? itemId
        return progress.first { ($0.episodeId ?? $0.itemId) == key }
    }

    func saveProgress(itemId: String, kind: MediaKind, episodeId: String?, position: Double,
                      duration: Double, title: String, poster: String?) {
        guard let profileId = activeProfileId, duration > 0 else { return }
        let settings = activeProfile?.settings ?? ProfileSettings()
        let key = episodeId ?? itemId
        var entry = WatchProgress(
            itemId: itemId,
            kind: kind,
            episodeId: episodeId,
            positionSecs: position,
            durationSecs: duration,
            title: title,
            poster: poster
        )
        entry.completed = position / duration * 100 >= settings.completedAtPercent
        progress.removeAll { ($0.episodeId ?? $0.itemId) == key }
        progress.insert(entry, at: 0)
        if progress.count > 200 { progress = Array(progress.prefix(200)) }
        store.save(progress, key: Persistence.Keys.progress(profileId))
    }

    func clearProgress(itemId: String) {
        guard let profileId = activeProfileId else { return }
        progress.removeAll { $0.itemId == itemId }
        store.save(progress, key: Persistence.Keys.progress(profileId))
    }

    /// Ana ekrandaki "izlemeye devam et" seridi.
    var continueWatching: [WatchProgress] {
        let settings = activeProfile?.settings ?? ProfileSettings()
        return progress
            .filter { !$0.completed && $0.positionSecs >= settings.resumeThresholdSecs && $0.kind != .live }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func pushRecentChannel(_ channelId: String) {
        guard let profileId = activeProfileId else { return }
        recentChannelIds.removeAll { $0 == channelId }
        recentChannelIds.insert(channelId, at: 0)
        if recentChannelIds.count > 30 { recentChannelIds = Array(recentChannelIds.prefix(30)) }
        store.save(recentChannelIds, key: Persistence.Keys.recent(profileId))
    }

    var recentChannels: [LiveChannel] {
        let byId = Dictionary(catalog.live.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return recentChannelIds.compactMap { byId[$0] }
    }

    func eraseAllData() {
        store.clearAll()
        profiles = []
        activeProfileId = nil
        playlists = []
        catalogs = [:]
        epgBundles = [:]
        favorites = []
        progress = []
        recentChannelIds = []
    }
}

/// Arama sonuclarini tek listede tasiyabilmek icin.
enum SearchResult: Identifiable, Hashable {
    case live(LiveChannel)
    case movie(MovieItem)
    case series(SeriesItem)

    var id: String {
        switch self {
        case let .live(channel): return channel.id
        case let .movie(movie): return movie.id
        case let .series(series): return series.id
        }
    }

    var name: String {
        switch self {
        case let .live(channel): return channel.name
        case let .movie(movie): return movie.name
        case let .series(series): return series.name
        }
    }

    var image: String? {
        switch self {
        case let .live(channel): return channel.logo
        case let .movie(movie): return movie.logo
        case let .series(series): return series.logo
        }
    }

    var kindLabel: String {
        switch self {
        case .live: return "Canli"
        case .movie: return "Film"
        case .series: return "Dizi"
        }
    }
}
