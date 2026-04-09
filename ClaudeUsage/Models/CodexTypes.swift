import Foundation

struct CodexPlanProfile {
    let name: String
    let dailyTokenLimit: Int
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

class CodexConfidenceEngine {
    private let cooldownThreshold: TimeInterval = 300

    func evaluate(
        detection: CodexDetectionResult,
        events: [CodexActivityEvent],
        plan: CodexPlanProfile?,
        recentResets: Int
    ) -> CodexEstimate {
        if recentResets >= 3 && plan != nil {
            return CodexEstimate(confidence: .highConfidence)
        }
        if !events.isEmpty && plan != nil {
            return CodexEstimate(confidence: .estimated)
        }
        return CodexEstimate(confidence: .observedOnly)
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
