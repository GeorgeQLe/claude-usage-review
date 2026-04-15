import Foundation

struct CodexPlanProfile: Equatable {
    let name: String
    let dailyTokenLimit: Int

    static let presets: [CodexPlanProfile] = [
        CodexPlanProfile(name: "Plus", dailyTokenLimit: 50_000),
        CodexPlanProfile(name: "Pro", dailyTokenLimit: 100_000),
        CodexPlanProfile(name: "Business", dailyTokenLimit: 200_000),
    ]

    static func preset(named name: String) -> CodexPlanProfile? {
        presets.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }
}

enum CodexConfidence: Equatable {
    case exact, highConfidence, estimated, observedOnly
}

struct CodexEstimate {
    let confidence: CodexConfidence
}

struct CooldownStatus {
    let cooldownActive: Bool
}

struct CodexInvocationEvent: Codable, Equatable {
    let startTime: Date
    let endTime: Date
    let commandMode: String
    let model: String
    let limitHitDetected: Bool

    var duration: TimeInterval {
        endTime.timeIntervalSince(startTime)
    }
}

class CodexConfidenceEngine {
    private let cooldownThreshold: TimeInterval = 300

    func evaluate(
        detection: CodexDetectionResult,
        events: [CodexActivityEvent],
        plan: CodexPlanProfile?,
        recentResets: Int,
        wrapperEvents: [CodexInvocationEvent] = []
    ) -> CodexEstimate {
        // Wrapper events with enough limit hits + plan → highConfidence
        let wrapperLimitHits = wrapperEvents.filter { $0.limitHitDetected }.count
        if wrapperLimitHits >= 3 && plan != nil {
            return CodexEstimate(confidence: .highConfidence)
        }
        // Any wrapper events → at least estimated
        if !wrapperEvents.isEmpty {
            return CodexEstimate(confidence: .estimated)
        }
        if recentResets >= 3 && plan != nil {
            return CodexEstimate(confidence: .highConfidence)
        }
        if !events.isEmpty && plan != nil {
            return CodexEstimate(confidence: .estimated)
        }
        return CodexEstimate(confidence: .observedOnly)
    }

    func explanation(for confidence: CodexConfidence) -> String {
        switch confidence {
        case .exact: return "Exact usage from API"
        case .highConfidence: return "High confidence from limit detection and plan profile"
        case .estimated: return "Estimated from wrapper events and plan profile"
        case .observedOnly: return "Observed activity only — configure a plan for better accuracy"
        }
    }

    func cooldownStatus(from events: [CodexActivityEvent]) -> CooldownStatus {
        let limitHits = events.filter { $0.eventType == .limitHit }
        guard let mostRecent = limitHits.max(by: { $0.timestamp < $1.timestamp }) else {
            return CooldownStatus(cooldownActive: false)
        }
        let elapsed = Date().timeIntervalSince(mostRecent.timestamp)
        return CooldownStatus(cooldownActive: elapsed < cooldownThreshold)
    }
}
