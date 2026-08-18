import SwiftUI

/// Uzak gorsel; yuklenemezse isimden uretilen renkli bir zemin gosterir.
struct PosterView: View {
    let url: String?
    let name: String
    var wide: Bool = false

    private var gradient: LinearGradient {
        var hash = 0
        for scalar in name.unicodeScalars { hash = (hash &* 31 &+ Int(scalar.value)) & 0xFFFFFF }
        let hue = Double(abs(hash) % 360) / 360
        return LinearGradient(
            colors: [
                Color(hue: hue, saturation: 0.45, brightness: 0.32),
                Color(hue: (hue + 0.12).truncatingRemainder(dividingBy: 1), saturation: 0.4, brightness: 0.16)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    var body: some View {
        ZStack {
            gradient
            if let url, let parsed = URL(string: url) {
                AsyncImage(url: parsed) { phase in
                    switch phase {
                    case let .success(image):
                        image.resizable().aspectRatio(contentMode: wide ? .fit : .fill)
                    case .failure:
                        placeholder
                    default:
                        ProgressView()
                    }
                }
            } else {
                placeholder
            }
        }
        .aspectRatio(wide ? 16.0 / 9.0 : 2.0 / 3.0, contentMode: .fit)
        .clipped()
    }

    private var placeholder: some View {
        Text(name)
            .font(.caption)
            .multilineTextAlignment(.center)
            .padding(6)
            .foregroundStyle(.white.opacity(0.85))
    }
}

/// Odaklandiginda buyuyen icerik karti.
struct MediaCard: View {
    let title: String
    var subtitle: String?
    var image: String?
    var wide: Bool = false
    var progress: Double?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                ZStack(alignment: .bottom) {
                    PosterView(url: image, name: title, wide: wide)
                    if let progress, progress > 0 {
                        GeometryReader { geometry in
                            ZStack(alignment: .leading) {
                                Rectangle().fill(.white.opacity(0.25))
                                Rectangle().fill(Color.accentColor)
                                    .frame(width: geometry.size.width * min(1, progress / 100))
                            }
                        }
                        .frame(height: 6)
                    }
                }
                Text(title)
                    .font(.caption)
                    .lineLimit(1)
                if let subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(width: wide ? 340 : 220)
        }
        .buttonStyle(.card)
    }
}

/// Yatay kaydirilabilir icerik seridi.
struct MediaRow<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.title3.weight(.semibold))
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 30) {
                    content
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 12)
            }
        }
    }
}

struct EmptyStateView: View {
    let title: String
    var hint: String?

    var body: some View {
        VStack(spacing: 12) {
            Text(title).font(.title2)
            if let hint {
                Text(hint)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 700)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// 4 haneli PIN giris katmani.
struct PinPrompt: View {
    let title: String
    var onSubmit: (String) -> Bool
    var onCancel: () -> Void

    @State private var pin = ""
    @State private var error = false

    var body: some View {
        VStack(spacing: 24) {
            Text(title).font(.title2)
            SecureField("PIN", text: $pin)
                .frame(width: 360)
            if error {
                Text("PIN hatali.").foregroundStyle(.red)
            }
            HStack(spacing: 20) {
                Button("Vazgec", action: onCancel)
                Button("Onayla") {
                    if onSubmit(pin) {
                        pin = ""
                        error = false
                    } else {
                        error = true
                        pin = ""
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(60)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
    }
}

extension Date {
    var clockText: String {
        formatted(date: .omitted, time: .shortened)
    }

    var dayText: String {
        formatted(date: .abbreviated, time: .omitted)
    }
}

extension Double {
    /// Saniyeyi "1 sa 45 dk" bicimine cevirir.
    var runtimeText: String {
        guard self > 0 else { return "" }
        let hours = Int(self) / 3600
        let minutes = (Int(self) % 3600) / 60
        return hours > 0 ? "\(hours) sa \(minutes) dk" : "\(minutes) dk"
    }
}
