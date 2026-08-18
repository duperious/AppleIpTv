import SwiftUI

/// Katalog genelinde arama.
struct SearchView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.playbackAction) private var play

    @State private var query = ""
    @State private var kinds: Set<MediaKind> = [.live, .movie, .series]

    private let columns = [GridItem(.adaptive(minimum: 220, maximum: 260), spacing: 40)]

    private var results: [SearchResult] {
        store.search(query, kinds: kinds, limit: 300)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            TextField("Kanal, film veya dizi ara", text: $query)
                .frame(maxWidth: 900)

            HStack(spacing: 16) {
                toggle(.live, label: "Canli")
                toggle(.movie, label: "Film")
                toggle(.series, label: "Dizi")
                Spacer()
                Text("\(results.count) sonuc").foregroundStyle(.secondary)
            }

            if query.isEmpty {
                EmptyStateView(title: "Arama yapin", hint: "Kanal adi, film veya dizi basligi yazin.")
            } else if results.isEmpty {
                EmptyStateView(title: "Sonuc yok", hint: "Farkli bir anahtar kelime deneyin.")
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 40) {
                        ForEach(results) { result in
                            resultCard(result)
                        }
                    }
                    .padding(.vertical, 20)
                }
            }
        }
        .padding(40)
        .navigationTitle("Ara")
    }

    private func toggle(_ kind: MediaKind, label: String) -> some View {
        Button {
            if kinds.contains(kind) { kinds.remove(kind) } else { kinds.insert(kind) }
        } label: {
            Label(label, systemImage: kinds.contains(kind) ? "checkmark.circle.fill" : "circle")
        }
    }

    @ViewBuilder
    private func resultCard(_ result: SearchResult) -> some View {
        switch result {
        case let .live(channel):
            MediaCard(title: channel.name, subtitle: "Canli", image: channel.logo, wide: true) {
                play(PlaybackItem(
                    url: channel.url,
                    title: channel.name,
                    isLive: true,
                    itemId: channel.id,
                    kind: .live,
                    poster: channel.logo
                ))
            }
        case let .movie(movie):
            NavigationLink {
                MovieDetailView(movie: movie)
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    PosterView(url: movie.logo, name: movie.name)
                    Text(movie.name).font(.caption).lineLimit(1)
                    Text("Film").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.card)
        case let .series(series):
            NavigationLink {
                SeriesDetailView(series: series)
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    PosterView(url: series.logo, name: series.name)
                    Text(series.name).font(.caption).lineLimit(1)
                    Text("Dizi").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.card)
        }
    }
}
