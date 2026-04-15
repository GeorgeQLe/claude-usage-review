import Foundation

enum CodexEventType: Equatable {
    case prompt, completion, sessionStart, sessionEnd, limitHit, error
}

struct CodexActivityEvent {
    let eventType: CodexEventType
    let timestamp: Date
    let tokens: Int?
    let duration: TimeInterval?
}

struct ParseBookmark {
    let byteOffset: UInt64
}

struct ActivityWindow {
    let startDate: Date
    let endDate: Date
    let eventCount: Int
}

class CodexActivityParser {
    let codexHome: URL

    private let dateFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    init(codexHome: URL) {
        self.codexHome = codexHome
    }

    func parseHistory() throws -> [CodexActivityEvent] {
        let (events, _) = try parseHistory(from: nil)
        return events
    }

    func parseHistory(from bookmark: ParseBookmark?) throws -> ([CodexActivityEvent], ParseBookmark?) {
        let historyFile = codexHome.appendingPathComponent("history.jsonl")
        let handle = try FileHandle(forReadingFrom: historyFile)
        defer { handle.closeFile() }

        if let bookmark = bookmark {
            handle.seek(toFileOffset: bookmark.byteOffset)
        }

        let data = handle.readDataToEndOfFile()
        let newOffset = handle.offsetInFile
        let events = parseJsonlData(data)
        return (events, ParseBookmark(byteOffset: newOffset))
    }

    func parseSessions() throws -> [CodexActivityEvent] {
        let sessionsDir = codexHome.appendingPathComponent("sessions")
        guard FileManager.default.fileExists(atPath: sessionsDir.path) else {
            return []
        }

        var allEvents: [CodexActivityEvent] = []
        for file in sessionJsonlFiles(in: sessionsDir) {
            let data = try Data(contentsOf: file)
            let fileEvents = parseJsonlData(data)

            let sessionStartTime = fileEvents.first { $0.eventType == .sessionStart }?.timestamp

            let enriched = fileEvents.map { event -> CodexActivityEvent in
                if event.eventType == .sessionEnd, let start = sessionStartTime {
                    let dur = event.timestamp.timeIntervalSince(start)
                    return CodexActivityEvent(
                        eventType: event.eventType, timestamp: event.timestamp,
                        tokens: event.tokens, duration: dur)
                }
                return event
            }
            allEvents.append(contentsOf: enriched)
        }
        return allEvents
    }

    func parseLogLine(_ line: String) -> CodexActivityEvent? {
        guard let data = line.data(using: .utf8) else { return nil }
        return parseSingleLine(data)
    }

    func activityWindows(from events: [CodexActivityEvent], windowHours: Int) -> [ActivityWindow] {
        guard !events.isEmpty else { return [] }
        let sorted = events.sorted { $0.timestamp < $1.timestamp }
        let windowInterval = TimeInterval(windowHours * 3600)
        let earliest = sorted.first!.timestamp

        var windows: [ActivityWindow] = []
        var windowStart = earliest

        while windowStart <= sorted.last!.timestamp {
            let windowEnd = windowStart.addingTimeInterval(windowInterval)
            let count = sorted.filter { $0.timestamp >= windowStart && $0.timestamp < windowEnd }.count
            if count > 0 {
                windows.append(ActivityWindow(
                    startDate: windowStart, endDate: windowEnd, eventCount: count))
            }
            windowStart = windowEnd
        }
        return windows
    }

    // MARK: - Private

    private func sessionJsonlFiles(in sessionsDir: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: sessionsDir,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        let files = enumerator.compactMap { item -> URL? in
            guard let file = item as? URL, file.pathExtension == "jsonl" else { return nil }
            if file.deletingLastPathComponent().standardizedFileURL.path
                == sessionsDir.standardizedFileURL.path {
                return file
            }
            return file.lastPathComponent.hasPrefix("rollout-") ? file : nil
        }
        return files.sorted { $0.path < $1.path }
    }

    private func parseJsonlData(_ data: Data) -> [CodexActivityEvent] {
        guard let text = String(data: data, encoding: .utf8) else { return [] }
        return text.components(separatedBy: "\n").compactMap { line -> CodexActivityEvent? in
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            guard let lineData = trimmed.data(using: .utf8) else { return nil }
            return parseSingleLine(lineData)
        }
    }

    private func parseSingleLine(_ data: Data) -> CodexActivityEvent? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let typeStr = json["type"] as? String,
              let tsStr = json["timestamp"] as? String,
              let timestamp = dateFormatter.date(from: tsStr)
        else { return nil }

        let eventType: CodexEventType
        switch typeStr {
        case "prompt": eventType = .prompt
        case "completion": eventType = .completion
        case "session_start": eventType = .sessionStart
        case "session_end": eventType = .sessionEnd
        case "error":
            if let msg = json["message"] as? String,
               msg.contains("rate limit") || msg.contains("usage limit") {
                eventType = .limitHit
            } else {
                eventType = .error
            }
        default: eventType = .error
        }

        let tokens = json["tokens"] as? Int
        return CodexActivityEvent(
            eventType: eventType, timestamp: timestamp, tokens: tokens, duration: nil)
    }
}
