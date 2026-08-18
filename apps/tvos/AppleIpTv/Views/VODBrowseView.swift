import SwiftUI

/// Film ve dizi listeleri icin ortak izgara ekrani.
struct VODBrowseView: View {
    @EnvironmentObject private var store: AppStore
    let kind: MediaKind

    private enum SortMode: String, CaseIterable, Identifiable {
        case natural = "Varsayilan"
        case name = "Ada gore"
        case year = "Yila gore"
        case rating = "Puana gore"
        var id: String { rawValue }
    }

    @State private var categoryId: String?
    @State private var sort: SortMode = .natural

    private let columns = [GridItem(.adaptive(minimum: 220, maximum: 260), spacing: 40)]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 24) {
                Picker("Kategori", selection: $categoryId) {
                    Text("Tum kategoriler").tag(String?.none)
                    ForEach(store.categories(of: kind)) { category in
                        Text(category.name).tag(String?.some(category.id))
                    }
                }
                .frame(width: 520)

                Picker("Sirala", selection: $sort) {
                    ForEach(SortMode.allCases) { mode in Text(mode.rawValue).tag(mode) }
                }
                .frame(width: 420)

                Spacer()
                Text("\(itemCount) kayit").foregroundStyle(.secondary)
            }

            ScrollView {
                LazyVGrid(columns: columns, spacing: 40) {
                    if kind == .movie {
                        ForEach(sortedMovies) { movie in
                            NavigationLink {
                                MovieDetailView(movie: movie)
                            } label: {
                                cardLabel(title: movie.name, image: movie.logo, subtitle: subtitle(movie.year, movie.rating))
                            }
                            .buttonStyle(.card)
                        }
                    } else {
                        ForEach(sortedSeries) { series in
                            NavigationLink {
                                SeriesDetailView(series: series)
                            } label: {
                                cardLabel(title: series.name, image: series.logo, subtitle: subtitle(series.year, series.rating))
                            }
                            .buttonStyle(.card)
                        }
                    }
                }
                .padding(.vertical, 20)
            }
        }
        .padding(40)
        .navigationTitle(kind == .movie ? "Filmler" : "Diziler")
    }

    private var itemCount: Int {
        kind == .movie ? sortedMovies.count : sortedSeries.count
    }

    private var sortedMovies: [MovieItem] {
        let list = store.movies(in: categoryId)
        switch sort {
        case .natural: return list
        case .name: return list.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .year: return list.sorted { ($0.year ?? 0) > ($1.year ?? 0) }
        case .rating: return list.sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }
        }
    }

    private var sortedSeries: [SeriesItem] {
        let list = store.series(in: categoryId)
        switch sort {
        case .natural: return list
        case .name: return list.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .year: return list.sorted { ($0.year ?? 0) > ($1.year ?? 0) }
        case .rating: return list.sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }
        }
    }

    private func subtitle(_ year: Int?, _ rating: Double?) -> String? {
        var parts: [String] = []
        if let year { parts.append(String(year)) }
        if let rating, rating > 0 { parts.append(String(format: "★ %.1f", rating)) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func cardLabel(title: String, image: String?, subtitle: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            PosterView(url: image, name: title)
            Text(title).font(.caption).lineLimit(1)
            if let subtitle {
                Text(subtitle).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}
