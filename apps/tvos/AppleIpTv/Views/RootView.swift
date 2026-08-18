import SwiftUI

/// Profil secimi ve ana sekmeler.
struct RootView: View {
    @EnvironmentObject private var store: AppStore
    @State private var playbackItem: PlaybackItem?

    var body: some View {
        Group {
            if store.activeProfileId == nil {
                ProfilesView()
            } else if store.playlists.isEmpty {
                NavigationStack {
                    AddSourceView(isFirstRun: true)
                }
            } else {
                mainTabs
            }
        }
        .fullScreenCover(item: $playbackItem) { item in
            PlayerContainer(item: item) { playbackItem = nil }
        }
        .environment(\.playbackAction, PlaybackAction { playbackItem = $0 })
        .overlay(alignment: .top) {
            if let message = store.syncMessage {
                Label(message, systemImage: "arrow.triangle.2.circlepath")
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.top, 20)
            }
        }
        .alert("Hata", isPresented: Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            Button("Tamam", role: .cancel) { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }

    private var mainTabs: some View {
        TabView {
            NavigationStack { HomeView() }
                .tabItem { Label("Ana Sayfa", systemImage: "house") }
            NavigationStack { LiveTVView() }
                .tabItem { Label("Canli TV", systemImage: "tv") }
            NavigationStack { GuideView() }
                .tabItem { Label("Rehber", systemImage: "calendar") }
            NavigationStack { VODBrowseView(kind: .movie) }
                .tabItem { Label("Filmler", systemImage: "film") }
            NavigationStack { VODBrowseView(kind: .series) }
                .tabItem { Label("Diziler", systemImage: "rectangle.stack") }
            NavigationStack { SearchView() }
                .tabItem { Label("Ara", systemImage: "magnifyingglass") }
            NavigationStack { SettingsView() }
                .tabItem { Label("Ayarlar", systemImage: "gearshape") }
        }
    }
}

/// Herhangi bir ekrandan oynaticiyi acabilmek icin ortam degeri.
struct PlaybackAction {
    private let handler: (PlaybackItem) -> Void

    init(_ handler: @escaping (PlaybackItem) -> Void) {
        self.handler = handler
    }

    func callAsFunction(_ item: PlaybackItem) {
        handler(item)
    }
}

private struct PlaybackActionKey: EnvironmentKey {
    static let defaultValue = PlaybackAction { _ in }
}

extension EnvironmentValues {
    var playbackAction: PlaybackAction {
        get { self[PlaybackActionKey.self] }
        set { self[PlaybackActionKey.self] = newValue }
    }
}
