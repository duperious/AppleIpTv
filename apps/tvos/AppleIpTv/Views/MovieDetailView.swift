import SwiftUI

struct MovieDetailView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.playbackAction) private var play

    let movie: MovieItem
    @State private var detailed: MovieItem?
    @State private var loading = false

    private var current: MovieItem { detailed ?? movie }
    private var watched: WatchProgress? { store.watchProgress(for: current.id) }

    var body: some View {
        ScrollView {
            HStack(alignment: .top, spacing: 50) {
                PosterView(url: current.logo, name: current.name)
                    .frame(width: 420)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 18) {
                    Text(current.name).font(.largeTitle)

                    HStack(spacing: 20) {
                        if let year = current.year { Text(String(year)) }
                        if let rating = current.rating, rating > 0 { Text(String(format: "★ %.1f", rating)) }
                        if let duration = current.durationSecs, duration > 0 { Text(duration.runtimeText) }
                        if let genre = current.genre { Text(genre).lineLimit(1) }
                    }
                    .font(.callout)
                    .foregroundStyle(.secondary)

                    if loading { ProgressView() }

                    if let plot = current.plot {
                        Text(plot).font(.body).frame(maxWidth: 900, alignment: .leading)
                    }
                    if let cast = current.cast {
                        Text("Oyuncular: \(cast)").font(.caption).foregroundStyle(.secondary)
                    }
                    if let director = current.director {
                        Text("Yonetmen: \(director)").font(.caption).foregroundStyle(.secondary)
                    }

                    if let watched, !watched.completed {
                        ProgressView(value: watched.percent, total: 100)
                            .frame(width: 520)
                        Text("%\(Int(watched.percent)) izlendi").font(.caption).foregroundStyle(.secondary)
                    }

                    HStack(spacing: 20) {
                        Button {
                            start(from: watched?.completed == false ? watched?.positionSecs : nil)
                        } label: {
                            Label(watched?.completed == false ? "Devam et" : "Oynat", systemImage: "play.fill")
                        }
                        .buttonStyle(.borderedProminent)

                        if watched != nil {
                            Button("Bastan oynat") {
                                store.clearProgress(itemId: current.id)
                                start(from: nil)
                            }
                        }

                        Button {
                            store.toggleFavorite(id: current.id, kind: .movie)
                        } label: {
                            Label(
                                store.isFavorite(current.id) ? "Favorilerden cikar" : "Favorilere ekle",
                                systemImage: store.isFavorite(current.id) ? "star.fill" : "star"
                            )
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(60)
        }
        .task { await loadDetails() }
    }

    private func start(from position: Double?) {
        play(PlaybackItem(
            url: current.url,
            title: current.name,
            subtitle: current.genre,
            isLive: false,
            itemId: current.id,
            kind: .movie,
            poster: current.logo,
            startPositionSecs: position
        ))
    }

    /// Xtream kaynaklarinda konu/sure gibi alanlar ayri bir cagriyla gelir.
    private func loadDetails() async {
        guard current.plot == nil,
              let playlist = store.playlists.first(where: { $0.id == movie.playlistId }),
              case let .xtream(host, username, password, _, userAgent) = playlist.source else { return }
        loading = true
        defer { loading = false }
        let client = XtreamClient(host: host, username: username, password: password, userAgent: userAgent)
        detailed = try? await client.fetchMovieDetails(movie)
    }
}
