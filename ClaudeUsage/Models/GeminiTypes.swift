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
        plan: GeminiPlanProfile?,
        confirmedAuthMode: GeminiAuthMode? = nil,
        wrapperEvents: [GeminiInvocationEvent] = []
    ) -> GeminiEstimate {
        let authMode: GeminiAuthMode?
        if let confirmedAuthMode {
            authMode = confirmedAuthMode
        } else if case .authenticated(let mode) = detection.authStatus {
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

        // Wrapper events with enough limit hits + plan → highConfidence
        let wrapperLimitHits = wrapperEvents.filter { $0.limitHitDetected }.count
        if wrapperLimitHits >= 3 && plan != nil {
            return GeminiEstimate(confidence: .highConfidence, ratePressure: ratePressure, authMode: authMode)
        }
        // Any wrapper events → at least estimated
        if !wrapperEvents.isEmpty {
            return GeminiEstimate(confidence: .estimated, ratePressure: ratePressure, authMode: authMode)
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

    func explanation(for confidence: GeminiConfidence) -> String {
        switch confidence {
        case .exact: return "Exact usage from API"
        case .highConfidence: return "High confidence from limit detection and plan profile"
        case .estimated: return "Estimated from wrapper events and plan profile"
        case .observedOnly: return "Observed activity only — configure a plan for better accuracy"
        }
    }
}

struct GeminiInvocationEvent: Codable, Equatable {
    let startTime: Date
    let endTime: Date
    let commandMode: String
    let model: String
    let limitHitDetected: Bool

    var duration: TimeInterval {
        endTime.timeIntervalSince(startTime)
    }
}
