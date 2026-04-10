import Foundation

struct GeminiRequestEvent {
    let timestamp: Date
    let inputTokens: Int
    let outputTokens: Int
    let totalTokens: Int
    let model: String
}

struct GeminiPlanProfile {
    let name: String
    let dailyRequestLimit: Int
    let requestsPerMinuteLimit: Int
}

struct GeminiRatePressure {
    let dailyRequestCount: Int
    let requestsPerMinute: Double
    let remainingDailyHeadroom: Int?

    init(events: [GeminiRequestEvent], now: Date) {
        fatalError("GeminiRatePressure stub — not yet implemented")
    }

    init(events: [GeminiRequestEvent], plan: GeminiPlanProfile, now: Date) {
        fatalError("GeminiRatePressure stub — not yet implemented")
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
        fatalError("GeminiActivityParser.parseSessionFiles stub — not yet implemented")
    }
}
