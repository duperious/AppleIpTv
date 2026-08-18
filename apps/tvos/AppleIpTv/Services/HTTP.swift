import Compression
import Foundation

/// Kucuk bir ag katmani: zaman asimi, User-Agent iletimi ve gzip acma.
enum HTTP {
    static let timeout: TimeInterval = 60

    static func request(for url: URL, userAgent: String?) -> URLRequest {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.setValue(userAgent ?? "AppleIpTv/1.0 (tvOS)", forHTTPHeaderField: "User-Agent")
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        return request
    }

    static func data(from url: URL, userAgent: String? = nil) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request(for: url, userAgent: userAgent))
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw IPTVError.http(http.statusCode, url.absoluteString)
        }
        return data
    }

    static func text(from url: URL, userAgent: String? = nil) async throws -> String {
        let data = try await data(from: url, userAgent: userAgent)
        return String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
    }

    /// EPG dosyalari sikca .xml.gz olarak sunulur; gerekiyorsa acar.
    static func maybeGunzipped(_ data: Data) -> Data {
        guard data.count > 2, data[data.startIndex] == 0x1f, data[data.startIndex + 1] == 0x8b else { return data }
        return data.gunzipped() ?? data
    }
}

extension Data {
    /// gzip basligini atlayip ham DEFLATE akisini cozer.
    func gunzipped() -> Data? {
        var index = startIndex
        guard count > 18, self[index] == 0x1f, self[index + 1] == 0x8b, self[index + 2] == 0x08 else { return nil }
        let flags = self[index + 3]
        index += 10

        if flags & 0x04 != 0 { // FEXTRA
            guard index + 1 < endIndex else { return nil }
            let extraLength = Int(self[index]) | (Int(self[index + 1]) << 8)
            index += 2 + extraLength
        }
        if flags & 0x08 != 0 { // FNAME
            while index < endIndex, self[index] != 0 { index += 1 }
            index += 1
        }
        if flags & 0x10 != 0 { // FCOMMENT
            while index < endIndex, self[index] != 0 { index += 1 }
            index += 1
        }
        if flags & 0x02 != 0 { index += 2 } // FHCRC
        guard index < endIndex else { return nil }

        let payload = subdata(in: index..<endIndex)
        return payload.inflatedRawDeflate()
    }

    /// libcompression ile ham DEFLATE cozumu (parcali, sabit bellek kullanir).
    private func inflatedRawDeflate() -> Data? {
        let bufferSize = 512 * 1024
        var output = Data()
        let streamPointer = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        defer { streamPointer.deallocate() }

        guard compression_stream_init(streamPointer, COMPRESSION_STREAM_DECODE, COMPRESSION_ZLIB) == COMPRESSION_STATUS_OK else {
            return nil
        }
        defer { compression_stream_destroy(streamPointer) }

        let destination = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { destination.deallocate() }

        var result: Data?
        withUnsafeBytes { (rawBuffer: UnsafeRawBufferPointer) in
            guard let base = rawBuffer.bindMemory(to: UInt8.self).baseAddress else { return }
            streamPointer.pointee.src_ptr = base
            streamPointer.pointee.src_size = count

            repeat {
                streamPointer.pointee.dst_ptr = destination
                streamPointer.pointee.dst_size = bufferSize
                let status = compression_stream_process(streamPointer, 0)
                switch status {
                case COMPRESSION_STATUS_OK, COMPRESSION_STATUS_END:
                    output.append(destination, count: bufferSize - streamPointer.pointee.dst_size)
                    if status == COMPRESSION_STATUS_END {
                        result = output
                        return
                    }
                default:
                    return
                }
            } while streamPointer.pointee.src_size > 0 || streamPointer.pointee.dst_size == 0
            result = output
        }
        return result
    }
}
