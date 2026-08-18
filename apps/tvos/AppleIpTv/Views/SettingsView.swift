import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showAddSource = false
    @State private var newPin = ""
    @State private var pinMessage: String?
    @State private var categoryKind: MediaKind = .live

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 40) {
                sourcesSection
                if store.activeProfile != nil {
                    profileSection
                    pinSection
                    categorySection
                }
                dangerSection
            }
            .padding(60)
        }
        .navigationTitle("Ayarlar")
        .sheet(isPresented: $showAddSource) {
            NavigationStack { AddSourceView() }
        }
    }

    private var sourcesSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Kaynaklar").font(.title2)

            ForEach(store.playlists) { playlist in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(playlist.name).font(.headline)
                        Spacer()
                        Toggle("Etkin", isOn: Binding(
                            get: { playlist.enabled },
                            set: { store.setPlaylistEnabled(playlist.id, enabled: $0) }
                        ))
                        .frame(width: 260)
                    }
                    if let catalog = store.catalogs[playlist.id] {
                        Text("\(catalog.live.count) kanal · \(catalog.movies.count) film · \(catalog.series.count) dizi")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let expires = playlist.expiresAt {
                        Text("Abonelik bitisi: \(expires.dayText)").font(.caption).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 20) {
                        Button("Yenile") {
                            Task { try? await store.sync(playlistId: playlist.id, force: true) }
                        }
                        Button("Sil", role: .destructive) {
                            store.removePlaylist(playlist.id)
                        }
                    }
                }
                .padding(20)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
            }

            HStack(spacing: 20) {
                Button("Kaynak ekle") { showAddSource = true }
                    .buttonStyle(.borderedProminent)
                Button("Tumunu yenile") {
                    Task { await store.syncAll(force: true) }
                }
            }
        }
    }

    @ViewBuilder
    private var profileSection: some View {
        if let profile = store.activeProfile {
            VStack(alignment: .leading, spacing: 16) {
                Text("Profil: \(profile.name)").font(.title2)

                Toggle("Cocuk profili (yetiskin kategorileri gizle)", isOn: Binding(
                    get: { profile.kids },
                    set: { value in
                        var updated = profile
                        updated.kids = value
                        store.updateProfile(updated)
                    }
                ))
                .frame(maxWidth: 900)

                // tvOS'ta Slider bulunmadigi icin ayrik degerli bir secici kullaniyoruz.
                Picker("EPG saat kaymasi", selection: Binding(
                    get: { profile.settings.epgOffsetMinutes },
                    set: { value in store.updateActiveSettings { $0.epgOffsetMinutes = value } }
                )) {
                    ForEach(Array(stride(from: -720, through: 720, by: 30)), id: \.self) { minutes in
                        Text(minutes == 0 ? "Kayma yok" : "\(minutes > 0 ? "+" : "")\(minutes / 60) sa \(abs(minutes % 60)) dk")
                            .tag(minutes)
                    }
                }
                .frame(maxWidth: 900)

                Button("Profil degistir") { store.signOut() }
            }
        }
    }

    @ViewBuilder
    private var pinSection: some View {
        if let profile = store.activeProfile {
            VStack(alignment: .leading, spacing: 16) {
                Text("PIN").font(.title2)
                Text(profile.pinHash == nil ? "Bu profilde PIN tanimli degil." : "Bu profil PIN ile korunuyor.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                SecureField("Yeni PIN (bos birakirsaniz kaldirilir)", text: $newPin)
                    .frame(maxWidth: 700)
                Button("PIN'i kaydet") {
                    store.setPin(newPin.isEmpty ? nil : newPin, for: profile)
                    pinMessage = newPin.isEmpty ? "PIN kaldirildi." : "PIN guncellendi."
                    newPin = ""
                }
                if let pinMessage {
                    Text(pinMessage).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private var categorySection: some View {
        if let profile = store.activeProfile {
            VStack(alignment: .leading, spacing: 16) {
                Text("Kategori gorunurlugu").font(.title2)
                Picker("Tur", selection: $categoryKind) {
                    Text("Canli").tag(MediaKind.live)
                    Text("Film").tag(MediaKind.movie)
                    Text("Dizi").tag(MediaKind.series)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 700)

                Text("Gizlenen kategoriler hic gorunmez, kilitli kategoriler PIN ister.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                ForEach(allCategories(of: categoryKind)) { category in
                    HStack {
                        Text(category.name).lineLimit(1)
                        Spacer()
                        Button(profile.settings.hiddenCategoryIds.contains(category.id) ? "Gosterilsin" : "Gizle") {
                            store.updateActiveSettings { settings in
                                toggle(&settings.hiddenCategoryIds, category.id)
                            }
                        }
                        Button(profile.settings.lockedCategoryIds.contains(category.id) ? "Kilidi kaldir" : "Kilitle") {
                            store.updateActiveSettings { settings in
                                toggle(&settings.lockedCategoryIds, category.id)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private var dangerSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Veri").font(.title2)
            Button("Tum verileri sil", role: .destructive) {
                store.eraseAllData()
            }
            Text("Profiller, kaynaklar, favoriler ve izleme gecmisi bu cihazdan silinir.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    /// Ayarlar ekraninda gizlenmis kategoriler de listelenmeli.
    private func allCategories(of kind: MediaKind) -> [Category] {
        store.catalog.categories
            .filter { $0.kind == kind }
            .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    private func toggle(_ list: inout [String], _ id: String) {
        if let index = list.firstIndex(of: id) { list.remove(at: index) } else { list.append(id) }
    }
}
