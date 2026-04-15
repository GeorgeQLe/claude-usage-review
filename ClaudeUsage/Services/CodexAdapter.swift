import Foundation
import Combine

enum CodexAdapterState {
    case notInstalled
    case installed(estimate: CodexEstimate, cooldown: CooldownStatus)
    case degraded(reason: String)
}

class CodexAdapter: ObservableObject {
    @Published var state: CodexAdapterState = .notInstalled

    let detector: CodexDetector
    let parser: CodexActivityParser
    let confidenceEngine: CodexConfidenceEngine
    let ledger: CodexEventLedger
    var planProfile: CodexPlanProfile?
    private(set) var wrapperEventCount: Int = 0
    private(set) var lastRefreshTime: Date?
    private(set) var consecutiveFailures: Int = 0

    init(codexHome: URL = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".codex"),
         planProfile: CodexPlanProfile? = nil,
         ledgerDirectory: URL = CodexEventLedger.defaultDirectory) {
        self.detector = CodexDetector(codexHome: codexHome)
        self.parser = CodexActivityParser(codexHome: codexHome)
        self.confidenceEngine = CodexConfidenceEngine()
        self.ledger = CodexEventLedger(directory: ledgerDirectory)
        self.planProfile = planProfile
    }

    init(detector: CodexDetector,
         parser: CodexActivityParser,
         confidenceEngine: CodexConfidenceEngine = CodexConfidenceEngine(),
         ledger: CodexEventLedger,
         planProfile: CodexPlanProfile? = nil) {
        self.detector = detector
        self.parser = parser
        self.confidenceEngine = confidenceEngine
        self.ledger = ledger
        self.planProfile = planProfile
    }

    func refresh() {
        let detection = detector.detect()
        guard detection.installStatus == .installed else {
            state = .notInstalled
            return
        }

        let historyFile = parser.codexHome.appendingPathComponent("history.jsonl")
        let events: [CodexActivityEvent]
        if FileManager.default.fileExists(atPath: historyFile.path) {
            do {
                events = try parser.parseHistory()
            } catch {
                consecutiveFailures += 1
                if consecutiveFailures >= 3 {
                    state = .degraded(reason: "Parse error: \(error.localizedDescription)")
                }
                return
            }
        } else {
            events = []
        }

        consecutiveFailures = 0
        lastRefreshTime = Date()

        let wrapperEvents = (try? ledger.readEvents()) ?? []
        wrapperEventCount = wrapperEvents.count
        let recentResets = events.filter {
            $0.eventType == .limitHit && $0.timestamp > Date().addingTimeInterval(-86400)
        }.count
        let estimate = confidenceEngine.evaluate(
            detection: detection, events: events,
            plan: planProfile, recentResets: recentResets,
            wrapperEvents: wrapperEvents
        )
        let cooldown = confidenceEngine.cooldownStatus(from: events)
        state = .installed(estimate: estimate, cooldown: cooldown)
        try? ledger.trim(retaining: 48 * 3600)
    }

    func toProviderSnapshot(isEnabled: Bool) -> ProviderSnapshot {
        switch state {
        case .notInstalled:
            return .codex(status: .missingConfiguration, isEnabled: isEnabled)
        case let .installed(estimate, _):
            return .codexRich(estimate: estimate, isEnabled: isEnabled)
        case let .degraded(reason):
            return .codex(status: .degraded(reason: reason), isEnabled: isEnabled)
        }
    }
}
