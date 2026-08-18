import SwiftUI

/// Canli TV: kategori listesi, kanal listesi ve secili kanalin EPG onizlemesi.
struct LiveTVView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.playbackAction) private var play

    private enum Selection: Hashable {
        case all
        case favorites
        case category(String)
    }

    @State private var selection: Selection = .all
    @State private var selectedChannelId: String?
    @State private var pendingLock: Category?

    private var channels: [LiveChannel] {
        switch selection {
        case .all:
            return store.channels(in: nil)
        case .favorites:
            return store.catalog.live.filter { store.isFavorite($0.id) }
        case let .category(id):
            return store.channels(in: id)
        }
    }

    private var selectedChannel: LiveChannel? {
        channels.first { $0.id == selectedChannelId } ?? channels.first
    }

    var body: some View {
        ZStack {
            HStack(alignment: .top, spacing: 30) {
                categoryList
                channelList
                detailPanel
            }
            .padding(40)

            if let category = pendingLock, let profile = store.activeProfile {
                Color.black.opacity(0.6).ignoresSafeArea()
                PinPrompt(title: "\(category.name) kilitli") { pin in
                    if store.verifyPin(pin, for: profile) {
                        store.unlockCategory(category.id)
                        selection = .category(category.id)
                        pendingLock = nil
                        return true
                    }
                    return false
                } onCancel: {
                    pendingLock = nil
                }
            }
        }
        .navigationTitle("Canli TV")
    }

    private var categoryList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 6) {
                Button("Tum kanallar") { selection = .all; selectedChannelId = nil }
                Button("Favoriler") { selection = .favorites; selectedChannelId = nil }
                ForEach(store.categories(of: .live)) { category in
                    Button {
                        if store.lockedCategoryIds.contains(category.id) {
                            pendingLock = category
                        } else {
                            selection = .category(category.id)
                            selectedChannelId = nil
                        }
                    } label: {
                        HStack {
                            Text(category.name).lineLimit(1)
                            if store.lockedCategoryIds.contains(category.id) {
                                Image(systemName: "lock.fill").font(.caption)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 10)
        }
        .frame(width: 420)
    }

    private var channelList: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(channels) { channel in
                    Button {
                        if selectedChannelId == channel.id {
                            startPlayback(channel)
                        } else {
                            selectedChannelId = channel.id
                        }
                    } label: {
                        HStack(spacing: 16) {
                            PosterView(url: channel.logo, name: channel.name, wide: true)
                                .frame(width: 110)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(channel.channelNumber.map { "\($0) · \(channel.name)" } ?? channel.name)
                                    .lineLimit(1)
                                if let program = store.currentProgram(for: channel) {
                                    Text("\(program.start.clockText)  \(program.title)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                            }
                            Spacer()
                            if store.isFavorite(channel.id) {
                                Image(systemName: "star.fill").foregroundStyle(.yellow)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.card)
                }
            }
            .padding(.vertical, 10)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var detailPanel: some View {
        if let channel = selectedChannel {
            VStack(alignment: .leading, spacing: 18) {
                PosterView(url: channel.logo, name: channel.name, wide: true)
                    .frame(width: 420)
                Text(channel.name).font(.title3)

                if let program = store.currentProgram(for: channel) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(program.title).font(.headline)
                        Text("\(program.start.clockText) - \(program.stop.clockText)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let desc = program.desc {
                            Text(desc).font(.caption).foregroundStyle(.secondary).lineLimit(6)
                        }
                    }
                } else {
                    Text("Bu kanal icin rehber bilgisi yok.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Button {
                    startPlayback(channel)
                } label: {
                    Label("Izle", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    store.toggleFavorite(id: channel.id, kind: .live)
                } label: {
                    Label(
                        store.isFavorite(channel.id) ? "Favorilerden cikar" : "Favorilere ekle",
                        systemImage: store.isFavorite(channel.id) ? "star.fill" : "star"
                    )
                }

                let upcoming = store.upcomingPrograms(for: channel, limit: 5).dropFirst()
                if !upcoming.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Sirada").font(.headline)
                        ForEach(Array(upcoming)) { program in
                            HStack(alignment: .top, spacing: 10) {
                                Text(program.start.clockText)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .frame(width: 80, alignment: .leading)
                                Text(program.title).font(.caption).lineLimit(2)
                            }
                        }
                    }
                }
                Spacer()
            }
            .frame(width: 460)
        }
    }

    private func startPlayback(_ channel: LiveChannel) {
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
