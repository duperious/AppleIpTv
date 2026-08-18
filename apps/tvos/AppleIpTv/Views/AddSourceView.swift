import SwiftUI

/// Xtream Codes veya M3U kaynagi ekleme ekrani.
struct AddSourceView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var isFirstRun = false

    private enum Mode: String, CaseIterable, Identifiable {
        case xtream = "Xtream Codes"
        case m3u = "M3U adresi"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .xtream
    @State private var name = ""
    @State private var host = ""
    @State private var username = ""
    @State private var password = ""
    @State private var m3uURL = ""
    @State private var epgURL = ""
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                Text(isFirstRun ? "Ilk kaynaginizi ekleyin" : "Kaynak ekle")
                    .font(.largeTitle)

                Picker("Tur", selection: $mode) {
                    ForEach(Mode.allCases) { item in Text(item.rawValue).tag(item) }
                }
                .pickerStyle(.segmented)
                .frame(width: 900)

                TextField("Kaynak adi (istege bagli)", text: $name).frame(width: 900)

                if mode == .xtream {
                    TextField("Sunucu adresi (http://sunucu.com:8080)", text: $host)
                        .frame(width: 900)
                    TextField("Kullanici adi", text: $username).frame(width: 900)
                    SecureField("Sifre", text: $password).frame(width: 900)
                } else {
                    TextField("M3U adresi", text: $m3uURL).frame(width: 900)
                }

                TextField("EPG adresi (istege bagli)", text: $epgURL).frame(width: 900)

                HStack(spacing: 20) {
                    Button(busy ? "Baglaniliyor..." : "Kaynagi ekle") {
                        Task { await submit() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || !isValid)

                    if !isFirstRun {
                        Button("Vazgec") { dismiss() }
                    }
                }

                if isFirstRun {
                    Text("""
                    Xtream Codes: saglayicinizin verdigi sunucu adresi, kullanici adi ve sifreyi girin.
                    M3U: "get.php?username=...&type=m3u_plus" bicimindeki adresi yapistirin.
                    EPG alani bos birakilirsa Xtream hesaplarinda rehber otomatik indirilir.
                    """)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(width: 900, alignment: .leading)
                }
            }
            .padding(60)
        }
    }

    private var isValid: Bool {
        switch mode {
        case .xtream:
            return !host.trimmingCharacters(in: .whitespaces).isEmpty && !username.isEmpty && !password.isEmpty
        case .m3u:
            return !m3uURL.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    private func submit() async {
        busy = true
        defer { busy = false }

        let source: Source
        var label = name.trimmingCharacters(in: .whitespaces)
        let epg = epgURL.trimmingCharacters(in: .whitespaces)

        switch mode {
        case .xtream:
            let trimmedHost = host.trimmingCharacters(in: .whitespaces)
            source = .xtream(
                host: trimmedHost,
                username: username.trimmingCharacters(in: .whitespaces),
                password: password,
                epgURL: epg.isEmpty ? nil : epg,
                userAgent: nil
            )
            if label.isEmpty {
                label = URL(string: trimmedHost.contains("://") ? trimmedHost : "http://\(trimmedHost)")?.host ?? "Xtream"
            }
        case .m3u:
            source = .m3u(
                url: m3uURL.trimmingCharacters(in: .whitespaces),
                inlineContent: nil,
                epgURL: epg.isEmpty ? nil : epg,
                userAgent: nil
            )
            if label.isEmpty { label = "M3U Playlist" }
        }

        if await store.addPlaylist(name: label, source: source) != nil, !isFirstRun {
            dismiss()
        }
    }
}
