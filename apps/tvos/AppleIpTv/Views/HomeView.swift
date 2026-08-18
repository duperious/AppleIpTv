import SwiftUI

/// Ana ekran: devam et, son kanallar, favoriler ve yeni icerikler.
struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.playbackAction) private var play

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 44) {
                if !store.continueWatching.isEmpty {
                    MediaRow(title: "Izlemeye devam et") {
                        ForEach(store.continueWatching) { entry in
                            resumeCard(entry)
                        }
                    }
                }

                if !store.recentChannels.isEmpty {
                    MediaRow(title: "Son izlenen kanallar") {
                        ForEach(store.recentChannels) { channel in
                            MediaCard(
                                title: channel.name,
                                subtitle: store.currentProgram(for: channel)?.title,
                                image: channel.logo,
                                wide: true
                            ) {
                                play(PlaybackItem(
                                    url: channel.url,
                                    title: channel.name,
                                    subtitle: store.currentProgram(for: channel)?.title,
                                    isLive: true,
                                    itemId: channel.id,
                                    kind: .live,
                                    poster: channel.logo
                                ))
                            }
                        }
                    }
                }

                let favoriteChannels = store.catalog.live.filter { store.isFavorite($0.id) }
                if !favoriteChannels.isEmpty {
                    MediaRow(title: "Favori kanallar") {
                        ForEach(favoriteChannels) { channel in
                            MediaCard(title: channel.name, image: channel.logo, wide: true) {
                                play(PlaybackItem(
                                    url: channel.url,
                                    title: channel.name,
                                    isLive: true,
                                    itemId: channel.id,
                                    kind: .live,
                                    poster: channel.logo
                                ))
                            }
                        }
                    }
                }

                let newMovies = Array(store.movies(in: nil).suffix(24).reversed())
                if !newMovies.isEmpty {
                    MediaRow(title: "Filmler") {
                        ForEach(newMovies) { movie in
                            NavigationLink {
                                MovieDetailView(movie: movie)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    PosterView(url: movie.logo, name: movie.name)
                                    Text(movie.name).font(.caption).lineLimit(1)
                                }
                                .frame(width: 220)
                            }
                            .buttonStyle(.card)
                        }
                    }
                }

                let newSeries = store.series(in: nil)
                    .sorted { ($0.lastModified ?? 0) > ($1.lastModified ?? 0) }
                    .prefix(24)
                if !newSeries.isEmpty {
                    MediaRow(title: "Diziler") {
                        ForEach(Array(newSeries)) { series in
                            NavigationLink {
                                SeriesDetailView(series: series)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    PosterView(url: series.logo, name: series.name)
                                    Text(series.name).font(.caption).lineLimit(1)
                                }
                                .frame(width: 220)
                            }
                            .buttonStyle(.card)
                        }
                    }
                }
            }
            .padding(.horizontal, 60)
            .padding(.vertical, 40)
        }
        .navigationTitle("AppleIpTv")
    }

    @ViewBuilder
    private func resumeCard(_ entry: WatchProgress) -> some View {
        if entry.kind == .movie, let movie = store.catalog.movies.first(where: { $0.id == entry.itemId }) {
            NavigationLink {
                MovieDetailView(movie: movie)
            } label: {
                resumeLabel(entry)
            }
            .buttonStyle(.card)
        } else if entry.kind == .series, let series = store.catalog.series.first(where: { $0.id == entry.itemId }) {
            NavigationLink {
                SeriesDetailView(series: series)
            } label: {
                resumeLabel(entry)
            }
            .buttonStyle(.card)
        }
    }

    private func resumeLabel(_ entry: WatchProgress) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .bottom) {
                PosterView(url: entry.poster, name: entry.title, wide: true)
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(.white.opacity(0.25))
                        Rectangle().fill(Color.accentColor)
                            .frame(width: geometry.size.width * entry.percent / 100)
                    }
                }
                .frame(height: 6)
            }
            Text(entry.title).font(.caption).lineLimit(1)
            Text("%\(Int(entry.percent)) izlendi").font(.caption2).foregroundStyle(.secondary)
        }
        .frame(width: 340)
    }
}
