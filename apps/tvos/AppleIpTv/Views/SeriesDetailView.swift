import SwiftUI

struct SeriesDetailView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.playbackAction) private var play

    let series: SeriesItem
    @State private var detailed: SeriesItem?
    @State private var loading = false
    @State private var seasonNumber: Int?

    private var current: SeriesItem { detailed ?? series }
    private var seasons: [Season] { current.seasons ?? [] }
    private var activeSeason: Season? {
        seasons.first { $0.seasonNumber == seasonNumber } ?? seasons.first
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                HStack(alignment: .top, spacing: 50) {
                    PosterView(url: current.logo, name: current.name)
                        .frame(width: 360)
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    VStack(alignment: .leading, spacing: 16) {
                        Text(current.name).font(.largeTitle)
                        HStack(spacing: 20) {
                            if let year = current.year { Text(String(year)) }
                            if let rating = current.rating, rating > 0 { Text(String(format: "★ %.1f", rating)) }
                            if let genre = current.genre { Text(genre).lineLimit(1) }
                            if !seasons.isEmpty { Text("\(seasons.count) sezon") }
                        }
                        .font(.callout)
                        .foregroundStyle(.secondary)

                        if let plot = current.plot {
                            Text(plot).frame(maxWidth: 900, alignment: .leading)
                        }
                        if let cast = current.cast {
                            Text("Oyuncular: \(cast)").font(.caption).foregroundStyle(.secondary)
                        }

                        Button {
                            store.toggleFavorite(id: current.id, kind: .series)
                        } label: {
                            Label(
                                store.isFavorite(current.id) ? "Favorilerden cikar" : "Favorilere ekle",
                                systemImage: store.isFavorite(current.id) ? "star.fill" : "star"
                            )
                        }
                    }
                    Spacer(minLength: 0)
                }

                if loading { ProgressView("Bolumler yukleniyor") }

                if !seasons.isEmpty {
                    Picker("Sezon", selection: Binding(
                        get: { activeSeason?.seasonNumber ?? 1 },
                        set: { seasonNumber = $0 }
                    )) {
                        ForEach(seasons) { season in
                            Text(season.name ?? "\(season.seasonNumber). Sezon").tag(season.seasonNumber)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 1200)

                    VStack(spacing: 16) {
                        ForEach(activeSeason?.episodes ?? []) { episode in
                            episodeRow(episode)
                        }
                    }
                } else if !loading {
                    Text("Bu dizi icin bolum bilgisi bulunamadi.")
                        .foregroundStyle(.secondary)
                }
            }
            .padding(60)
        }
        .task { await loadDetails() }
    }

    private func episodeRow(_ episode: Episode) -> some View {
        let watched = store.watchProgress(for: current.id, episodeId: episode.id)
        return Button {
            play(PlaybackItem(
                url: episode.url,
                title: "\(current.name) · S\(episode.seasonNumber)B\(episode.episodeNumber)",
                subtitle: episode.title,
                isLive: false,
                itemId: current.id,
                kind: .series,
                episodeId: episode.id,
                poster: current.logo,
                startPositionSecs: watched?.completed == false ? watched?.positionSecs : nil
            ))
        } label: {
            HStack(alignment: .top, spacing: 24) {
                PosterView(url: episode.still ?? current.logo, name: episode.title, wide: true)
                    .frame(width: 300)
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(episode.episodeNumber). \(episode.title)").font(.headline).lineLimit(1)
                    if let duration = episode.durationSecs, duration > 0 {
                        Text(duration.runtimeText).font(.caption).foregroundStyle(.secondary)
                    }
                    if let plot = episode.plot {
                        Text(plot).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                    }
                    if let watched, !watched.completed {
                        ProgressView(value: watched.percent, total: 100).frame(width: 400)
                    }
                }
                Spacer()
            }
            .padding(12)
        }
        .buttonStyle(.card)
    }

    private func loadDetails() async {
        guard (current.seasons ?? []).isEmpty,
              let playlist = store.playlists.first(where: { $0.id == series.playlistId }),
              case let .xtream(host, username, password, _, userAgent) = playlist.source else { return }
        loading = true
        defer { loading = false }
        let client = XtreamClient(host: host, username: username, password: password, userAgent: userAgent)
        detailed = try? await client.fetchSeriesDetails(series)
    }
}
