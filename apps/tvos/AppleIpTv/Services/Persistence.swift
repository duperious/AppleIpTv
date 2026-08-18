import Foundation

/// JSON dosyalari uzerinden basit, kalici depolama.
/// Katalog ve EPG dosyalari onlarca megabayt olabildigi icin
/// UserDefaults yerine Application Support dizini kullanilir.
struct Persistence {
    static let shared = Persistence()

    private let directory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        directory = base.appendingPathComponent("AppleIpTv", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
    }

    private func url(for key: String) -> URL {
        let safe = key.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
        return directory.appendingPathComponent("\(safe).json")
    }

    func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = try? Data(contentsOf: url(for: key)) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    func save<T: Encodable>(_ value: T, key: String) {
        guard let data = try? encoder.encode(value) else { return }
        try? data.write(to: url(for: key), options: .atomic)
    }

    func remove(key: String) {
        try? FileManager.default.removeItem(at: url(for: key))
    }

    func clearAll() {
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return }
        for file in files { try? FileManager.default.removeItem(at: file) }
    }

    enum Keys {
        static let profiles = "profiles"
        static let activeProfile = "active-profile"
        static let playlists = "playlists"
        static func catalog(_ id: String) -> String { "catalog-\(id)" }
        static func epg(_ id: String) -> String { "epg-\(id)" }
        static func favorites(_ id: String) -> String { "favorites-\(id)" }
        static func progress(_ id: String) -> String { "progress-\(id)" }
        static func recent(_ id: String) -> String { "recent-\(id)" }
    }
}
