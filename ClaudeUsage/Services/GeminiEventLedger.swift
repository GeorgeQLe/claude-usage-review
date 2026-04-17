import Foundation

class GeminiEventLedger {

    static var defaultDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ClaudeUsage")
    }

    let directory: URL
    private var fileURL: URL {
        directory.appendingPathComponent("gemini-events.jsonl")
    }

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init(directory: URL) {
        self.directory = directory
    }

    func append(_ event: GeminiInvocationEvent) throws {
        let data = try encoder.encode(event)
        let line = String(data: data, encoding: .utf8)! + "\n"

        if FileManager.default.fileExists(atPath: fileURL.path) {
            let handle = try FileHandle(forWritingTo: fileURL)
            handle.seekToEndOfFile()
            handle.write(line.data(using: .utf8)!)
            handle.closeFile()
        } else {
            try line.write(to: fileURL, atomically: true, encoding: .utf8)
        }
    }

    func readEvents() throws -> [GeminiInvocationEvent] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return []
        }
        let contents = try String(contentsOf: fileURL, encoding: .utf8)
        let lines = contents.split(separator: "\n", omittingEmptySubsequences: true)

        return lines.compactMap { line in
            guard let data = line.data(using: .utf8) else { return nil }
            return try? decoder.decode(GeminiInvocationEvent.self, from: data)
        }
    }

    func trim(retaining window: TimeInterval) throws {
        let events = try readEvents()
        let cutoff = Date().addingTimeInterval(-window)
        let kept = events.filter { $0.startTime > cutoff }

        // Rewrite file
        var output = ""
        for event in kept {
            let data = try encoder.encode(event)
            output += String(data: data, encoding: .utf8)! + "\n"
        }
        try output.write(to: fileURL, atomically: true, encoding: .utf8)
    }
}
