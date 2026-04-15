import Foundation
import Combine

enum GeminiAdapterState {
    case notInstalled
    case installed(estimate: GeminiEstimate)
    case degraded(reason: String)
}

class GeminiAdapter: ObservableObject {
    @Published var state: GeminiAdapterState = .notInstalled

    let detector: GeminiDetector
    let parser: GeminiActivityParser
    let confidenceEngine: GeminiConfidenceEngine
    let ledger: GeminiEventLedger
    var planProfile: GeminiPlanProfile?
    var confirmedAuthMode: GeminiAuthMode?
    private(set) var lastRefreshTime: Date?
    private(set) var consecutiveFailures: Int = 0

    init(geminiHome: URL = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".gemini"),
         planProfile: GeminiPlanProfile? = nil,
         confirmedAuthMode: GeminiAuthMode? = nil,
         ledgerDirectory: URL = GeminiEventLedger.defaultDirectory) {
        self.detector = GeminiDetector(geminiHome: geminiHome)
        self.parser = GeminiActivityParser(geminiHome: geminiHome)
        self.confidenceEngine = GeminiConfidenceEngine()
        self.ledger = GeminiEventLedger(directory: ledgerDirectory)
        self.planProfile = planProfile
        self.confirmedAuthMode = confirmedAuthMode
    }

    func refresh() {
        let detection = detector.detect()
        guard detection.installStatus == .installed else {
            state = .notInstalled
            return
        }
        let events = parser.parseSessionFiles()
        consecutiveFailures = 0
        lastRefreshTime = Date()
        let wrapperEvents = (try? ledger.readEvents()) ?? []
        let estimate = confidenceEngine.evaluate(
            detection: detection, events: events, plan: planProfile,
            confirmedAuthMode: confirmedAuthMode,
            wrapperEvents: wrapperEvents
        )
        state = .installed(estimate: estimate)
        try? ledger.trim(retaining: 48 * 3600)
    }

    func toProviderSnapshot(isEnabled: Bool) -> ProviderSnapshot {
        switch state {
        case .notInstalled:
            return .gemini(status: .missingConfiguration, isEnabled: isEnabled)
        case let .installed(estimate):
            return .geminiRich(estimate: estimate, isEnabled: isEnabled)
        case let .degraded(reason):
            return .gemini(status: .degraded(reason: reason), isEnabled: isEnabled)
        }
    }
}
