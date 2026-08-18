import Foundation

/// Xtream panelleri ayni alani kimi zaman metin kimi zaman sayi olarak
/// dondurdugu icin gevsek bir JSON degeri kullaniyoruz.
enum JSONValue: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .null
        }
    }

    var stringValue: String? {
        switch self {
        case let .string(value): return value.isEmpty ? nil : value
        case let .number(value): return value == value.rounded() ? String(Int(value)) : String(value)
        case let .bool(value): return value ? "1" : "0"
        default: return nil
        }
    }

    var doubleValue: Double? {
        switch self {
        case let .number(value): return value
        case let .string(value): return Double(value.replacingOccurrences(of: ",", with: "."))
        case let .bool(value): return value ? 1 : 0
        default: return nil
        }
    }

    var intValue: Int? {
        doubleValue.map { Int($0) }
    }

    var objectValue: [String: JSONValue]? {
        if case let .object(value) = self { return value }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case let .array(value) = self { return value }
        return nil
    }
}

extension Dictionary where Key == String, Value == JSONValue {
    func string(_ key: String) -> String? { self[key]?.stringValue }
    func int(_ key: String) -> Int? { self[key]?.intValue }
    func double(_ key: String) -> Double? { self[key]?.doubleValue }
    func object(_ key: String) -> [String: JSONValue]? { self[key]?.objectValue }
    func array(_ key: String) -> [JSONValue]? { self[key]?.arrayValue }
}
