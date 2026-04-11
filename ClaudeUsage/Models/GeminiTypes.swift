import Foundation

enum GeminiConfidence: Equatable {
    case exact, highConfidence, estimated, observedOnly
}

struct GeminiEstimate: Equatable {
    let confidence: GeminiConfidence
    let ratePressure: GeminiRatePressure?
    let authMode: GeminiAuthMode?
}

class GeminiConfidenceEngine {
    func evaluate(
        detection: GeminiDetectionResult,
        events: [GeminiRequestEvent],
        plan: GeminiPlanProfile?
    ) -> GeminiEstimate {
        let authMode: GeminiAuthMode?
        if case .authenticated(let mode) = detection.authStatus {
            authMode = mode
        } else {
            authMode = nil
        }

        let ratePressure: GeminiRatePressure?
        if !events.isEmpty {
            let now = Date()
            ratePressure = plan != nil
                ? GeminiRatePressure(events: events, plan: plan!, now: now)
                : GeminiRatePressure(events: events, now: now)
        } else {
            ratePressure = nil
        }

        let confidence: GeminiConfidence
        if authMode != nil && plan != nil && !events.isEmpty {
            confidence = .highConfidence
        } else if authMode != nil && !events.isEmpty {
            confidence = .estimated
        } else {
            confidence = .observedOnly
        }

        return GeminiEstimate(confidence: confidence, ratePressure: ratePressure, authMode: authMode)
    }
}
