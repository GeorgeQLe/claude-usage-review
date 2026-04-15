import Foundation

struct GeminiRequestEvent {
    let timestamp: Date
    let inputTokens: Int
    let outputTokens: Int
    let totalTokens: Int
    let model: String
}

struct GeminiPlanProfile: Equatable {
    let name: String
    let dailyRequestLimit: Int
    let requestsPerMinuteLimit: Int

    static let presets: [GeminiPlanProfile] = [
        GeminiPlanProfile(name: "Personal", dailyRequestLimit: 1000, requestsPerMinuteLimit: 60),
        GeminiPlanProfile(name: "API Key", dailyRequestLimit: 1500, requestsPerMinuteLimit: 120),
        GeminiPlanProfile(name: "Vertex AI", dailyRequestLimit: 3000, requestsPerMinuteLimit: 300),
    ]

    static func preset(named name: String) -> GeminiPlanProfile? {
        presets.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }
}

struct GeminiRatePressure: Equatable {
    let dailyRequestCount: Int
    let requestsPerMinute: Double
    let remainingDailyHeadroom: Int?

    init(events: [GeminiRequestEvent], now: Date) {
        let oneDayAgo = now.addingTimeInterval(-86400)
        let fiveMinAgo = now.addingTimeInterval(-300)

        self.dailyRequestCount = events.filter { $0.timestamp > oneDayAgo }.count
        self.requestsPerMinute = Double(events.filter { $0.timestamp > fiveMinAgo }.count) / 5.0
        self.remainingDailyHeadroom = nil
    }

    init(events: [GeminiRequestEvent], plan: GeminiPlanProfile, now: Date) {
        let oneDayAgo = now.addingTimeInterval(-86400)
        let fiveMinAgo = now.addingTimeInterval(-300)

        let daily = events.filter { $0.timestamp > oneDayAgo }.count
        self.dailyRequestCount = daily
        self.requestsPerMinute = Double(events.filter { $0.timestamp > fiveMinAgo }.count) / 5.0
        self.remainingDailyHeadroom = plan.dailyRequestLimit - daily
    }
}

class GeminiActivityParser {
    let geminiHome: URL
    let fileManager: FileManager

    init(geminiHome: URL, fileManager: FileManager = .default) {
        self.geminiHome = geminiHome
        self.fileManager = fileManager
    }

    func parseSessionFiles() -> [GeminiRequestEvent] {
        let tmpDir = geminiHome.appendingPathComponent("tmp")
        guard let projectDirs = try? fileManager.contentsOfDirectory(
            at: tmpDir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        var events: [GeminiRequestEvent] = []
        let iso8601 = ISO8601DateFormatter()

        for projectDir in projectDirs {
            let chatsDir = projectDir.appendingPathComponent("chats")
            guard let sessionFiles = try? fileManager.contentsOfDirectory(
                at: chatsDir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
            ) else {
                continue
            }

            for sessionFile in sessionFiles where sessionFile.pathExtension == "json" {
                guard let data = try? Data(contentsOf: sessionFile),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let messages = json["messages"] as? [[String: Any]] else {
                    continue
                }

                for message in messages {
                    guard let type = message["type"] as? String, type == "gemini",
                          let timestampStr = message["timestamp"] as? String,
                          let timestamp = iso8601.date(from: timestampStr),
                          let tokens = message["tokens"] as? [String: Any],
                          let input = tokens["input"] as? Int,
                          let output = tokens["output"] as? Int,
                          let total = tokens["total"] as? Int,
                          let model = message["model"] as? String else {
                        continue
                    }

                    events.append(GeminiRequestEvent(
                        timestamp: timestamp,
                        inputTokens: input,
                        outputTokens: output,
                        totalTokens: total,
                        model: model
                    ))
                }
            }
        }

        return events
    }
}
