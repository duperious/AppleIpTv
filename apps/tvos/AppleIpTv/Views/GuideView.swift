import SwiftUI

/// Zaman cizelgeli TV rehberi.
struct GuideView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.playbackAction) private var play

    private let hourWidth: CGFloat = 420
    private let windowHours = 6
    private let maxRows = 60

    @State private var categoryId: String?
    @State private var offsetHours = 0

    private var windowStart: Date {
        let calendar = Calendar.current
        let hour = calendar.dateInterval(of: .hour, for: .now)?.start ?? .now
        return hour.addingTimeInterval(TimeInterval(offsetHours * 3600))
    }

    private var windowEnd: Date {
        windowStart.addingTimeInterval(TimeInterval(windowHours * 3600))
    }

    private var channels: [LiveChannel] {
        Array(store.channels(in: categoryId).prefix(maxRows))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 20) {
                Picker("Kategori", selection: $categoryId) {
                    Text("Tum kanallar").tag(String?.none)
                    ForEach(store.categories(of: .live)) { category in
                        Text(category.name).tag(String?.some(category.id))
                    }
                }
                .frame(width: 500)

                Button("◀ 2 sa") { offsetHours -= 2 }
                Button("Simdi") { offsetHours = 0 }
                Button("2 sa ▶") { offsetHours += 2 }
                Spacer()
                Text(windowStart.dayText).foregroundStyle(.secondary)
            }

            if channels.isEmpty {
                EmptyStateView(title: "Kanal yok")
            } else {
                ScrollView([.horizontal, .vertical]) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 0) {
                            Color.clear.frame(width: 360, height: 30)
                            ForEach(0..<windowHours, id: \.self) { index in
                                Text(windowStart.addingTimeInterval(TimeInterval(index * 3600)).clockText)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .frame(width: hourWidth, alignment: .leading)
                            }
                        }

                        ForEach(channels) { channel in
                            HStack(alignment: .center, spacing: 0) {
                                Text(channel.name)
                                    .font(.caption)
                                    .lineLimit(1)
                                    .frame(width: 360, alignment: .leading)

                                let programs = programs(for: channel)
                                if programs.isEmpty {
                                    Text("Rehber bilgisi yok")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .frame(width: hourWidth * CGFloat(windowHours), alignment: .leading)
                                } else {
                                    HStack(spacing: 6) {
                                        ForEach(programs) { program in
                                            Button {
                                                play(PlaybackItem(
                                                    url: channel.url,
                                                    title: channel.name,
                                                    subtitle: program.title,
                                                    isLive: true,
                                                    itemId: channel.id,
                                                    kind: .live,
                                                    poster: channel.logo
                                                ))
                                            } label: {
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(program.title).font(.caption).lineLimit(1)
                                                    Text(program.start.clockText)
                                                        .font(.caption2)
                                                        .foregroundStyle(.secondary)
                                                }
                                                .padding(8)
                                                .frame(width: width(for: program), alignment: .leading)
                                            }
                                            .buttonStyle(.card)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.vertical, 10)
                }
            }
        }
        .padding(40)
        .navigationTitle("Rehber")
    }

    private func programs(for channel: LiveChannel) -> [EpgProgram] {
        let offset = TimeInterval((store.activeProfile?.settings.epgOffsetMinutes ?? 0) * 60)
        return store.epgBundle(for: channel)?
            .programs(for: channel, from: windowStart.addingTimeInterval(-offset), to: windowEnd.addingTimeInterval(-offset))
            ?? []
    }

    /// Yayin suresini piksel genisligine cevirir (en az okunabilir genislik).
    private func width(for program: EpgProgram) -> CGFloat {
        let seconds = program.stop.timeIntervalSince(program.start)
        return max(180, CGFloat(seconds / 3600) * hourWidth)
    }
}
