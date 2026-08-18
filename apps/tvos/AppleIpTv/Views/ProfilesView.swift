import SwiftUI

/// "Kim izliyor?" ekrani.
struct ProfilesView: View {
    @EnvironmentObject private var store: AppStore
    @State private var creating = false
    @State private var pendingProfile: Profile?

    private let avatars = ["🎬", "📺", "🍿", "⚽", "🎮", "🚀", "🐧", "🦊", "🌙", "⭐"]

    @State private var name = ""
    @State private var avatar = "🎬"
    @State private var kids = false
    @State private var pin = ""

    var body: some View {
        ZStack {
            VStack(spacing: 50) {
                Text("Kim izliyor?").font(.largeTitle)

                if creating || store.profiles.isEmpty {
                    createForm
                } else {
                    HStack(spacing: 50) {
                        ForEach(store.profiles) { profile in
                            VStack(spacing: 12) {
                                Button {
                                    if profile.pinHash != nil {
                                        pendingProfile = profile
                                    } else {
                                        store.selectProfile(profile.id)
                                    }
                                } label: {
                                    Text(profile.avatar).font(.system(size: 90))
                                        .frame(width: 200, height: 200)
                                }
                                .buttonStyle(.card)

                                Text(profile.name).font(.headline)
                                HStack(spacing: 8) {
                                    if profile.kids { Text("Cocuk").font(.caption).foregroundStyle(.secondary) }
                                    if profile.pinHash != nil { Image(systemName: "lock.fill").font(.caption) }
                                }
                            }
                        }

                        VStack(spacing: 12) {
                            Button {
                                creating = true
                            } label: {
                                Image(systemName: "plus").font(.system(size: 70))
                                    .frame(width: 200, height: 200)
                            }
                            .buttonStyle(.card)
                            Text("Profil ekle").font(.headline)
                        }
                    }
                }
            }
            .padding(60)

            if let profile = pendingProfile {
                Color.black.opacity(0.6).ignoresSafeArea()
                PinPrompt(title: "\(profile.name) icin PIN") { pin in
                    if store.verifyPin(pin, for: profile) {
                        pendingProfile = nil
                        store.selectProfile(profile.id)
                        return true
                    }
                    return false
                } onCancel: {
                    pendingProfile = nil
                }
            }
        }
    }

    private var createForm: some View {
        VStack(alignment: .leading, spacing: 24) {
            TextField("Profil adi", text: $name).frame(width: 700)

            HStack(spacing: 14) {
                ForEach(avatars, id: \.self) { item in
                    Button { avatar = item } label: {
                        Text(item).font(.system(size: 40)).frame(width: 90, height: 90)
                    }
                    .buttonStyle(.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(avatar == item ? Color.accentColor : .clear, lineWidth: 4)
                    )
                }
            }

            Toggle("Cocuk profili (yetiskin kategorileri gizle)", isOn: $kids).frame(width: 700)
            SecureField("PIN (istege bagli)", text: $pin).frame(width: 700)

            HStack(spacing: 20) {
                if !store.profiles.isEmpty {
                    Button("Vazgec") { creating = false }
                }
                Button("Olustur") {
                    let profile = store.addProfile(name: name, avatar: avatar, kids: kids, pin: pin.isEmpty ? nil : pin)
                    name = ""
                    pin = ""
                    creating = false
                    store.selectProfile(profile.id)
                }
                .buttonStyle(.borderedProminent)
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }
}
