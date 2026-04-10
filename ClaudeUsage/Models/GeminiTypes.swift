import Foundation

enum GeminiConfidence: Equatable {
    case exact, highConfidence, estimated, observedOnly
}

struct GeminiEstimate {
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
        fatalError("GeminiConfidenceEngine.evaluate stub — not yet implemented")
    }
}
