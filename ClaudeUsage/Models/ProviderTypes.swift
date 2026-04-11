import Foundation

// MARK: - Enums

enum ProviderId: Hashable {
    case claude
    case codex
    case gemini
}

enum ProviderStatus: Equatable {
    case configured
    case missingConfiguration
    case degraded(reason: String)
}

enum AuthStatus {
    case connected
}

enum CardState: Equatable {
    case configured
    case missingConfiguration
    case degraded
    case stale
}

// MARK: - ProviderSnapshot

enum ProviderSnapshot {
    case claudeRich(usage: UsageData, authStatus: AuthStatus, isEnabled: Bool)
    case claudeSimple(status: ProviderStatus, isEnabled: Bool)
    case codex(status: ProviderStatus, isEnabled: Bool)
    case codexRich(estimate: CodexEstimate, isEnabled: Bool)
    case gemini(status: ProviderStatus, isEnabled: Bool)
    case geminiRich(estimate: GeminiEstimate, isEnabled: Bool)

    // Static factory methods matching test API
    static func claude(usage: UsageData, authStatus: AuthStatus, isEnabled: Bool) -> ProviderSnapshot {
        .claudeRich(usage: usage, authStatus: authStatus, isEnabled: isEnabled)
    }

    static func claude(status: ProviderStatus, isEnabled: Bool) -> ProviderSnapshot {
        .claudeSimple(status: status, isEnabled: isEnabled)
    }

    var id: ProviderId {
        switch self {
        case .claudeRich, .claudeSimple: return .claude
        case .codex, .codexRich: return .codex
        case .gemini, .geminiRich: return .gemini
        }
    }

    var isDegraded: Bool {
        switch self {
        case .claudeSimple(let status, _), .codex(let status, _), .gemini(let status, _):
            if case .degraded = status { return true }
            return false
        default:
            return false
        }
    }

    var isEnabled: Bool {
        switch self {
        case .claudeRich(_, _, let enabled): return enabled
        case .claudeSimple(_, let enabled): return enabled
        case .codex(_, let enabled): return enabled
        case .codexRich(_, let enabled): return enabled
        case .gemini(_, let enabled): return enabled
        case .geminiRich(_, let enabled): return enabled
        }
    }
}

// MARK: - ProviderCard

struct ProviderCard: Equatable {
    let id: ProviderId
    let cardState: CardState
    let headline: String
    let detailText: String?
    let sessionUtilization: Double?
    let weeklyUtilization: Double?
    let confidenceExplanation: String?
}

// MARK: - ShellState

struct ShellState {
    let providers: [ProviderCard]
    var trayProvider: ProviderCard? {
        providers.first { $0.cardState == .configured }
    }
}

// MARK: - ProviderTrayPolicy

struct ProviderTrayPolicy {
    let rotationInterval: TimeInterval
    let manualOverride: ProviderId?
    let pinnedProvider: ProviderId?

    init(
        rotationInterval: TimeInterval = 7,
        manualOverride: ProviderId? = nil,
        pinnedProvider: ProviderId? = nil
    ) {
        self.rotationInterval = rotationInterval
        self.manualOverride = manualOverride
        self.pinnedProvider = pinnedProvider
    }
}

// MARK: - ProviderCoordinator

class ProviderCoordinator {
    static let staleThreshold: TimeInterval = 300

    var trayPolicy: ProviderTrayPolicy

    init(trayPolicy: ProviderTrayPolicy = ProviderTrayPolicy()) {
        self.trayPolicy = trayPolicy
    }

    func makeShellState(providers: [ProviderSnapshot], now: Date) -> ShellState {
        let cards = providers.map { snapshot -> ProviderCard in
            switch snapshot {
            case let .claudeRich(usage, _, _):
                return ProviderCard(
                    id: .claude,
                    cardState: .configured,
                    headline: "Claude \(Int(usage.fiveHour.utilization))% session",
                    detailText: nil,
                    sessionUtilization: usage.fiveHour.utilization,
                    weeklyUtilization: usage.sevenDay.utilization,
                    confidenceExplanation: nil
                )
            case let .claudeSimple(status, _):
                return ProviderCard(
                    id: .claude,
                    cardState: cardState(from: status),
                    headline: "Claude",
                    detailText: degradedReason(from: status),
                    sessionUtilization: nil,
                    weeklyUtilization: nil,
                    confidenceExplanation: nil
                )
            case let .codex(status, _):
                return ProviderCard(
                    id: .codex,
                    cardState: cardState(from: status),
                    headline: "Codex",
                    detailText: degradedReason(from: status),
                    sessionUtilization: nil,
                    weeklyUtilization: nil,
                    confidenceExplanation: nil
                )
            case let .codexRich(estimate, _):
                let headline: String
                switch estimate.confidence {
                case .exact: headline = "Codex — Exact"
                case .highConfidence: headline = "Codex — High Confidence"
                case .estimated: headline = "Codex — Estimated"
                case .observedOnly: headline = "Codex — Observed Only"
                }
                return ProviderCard(
                    id: .codex, cardState: .configured,
                    headline: headline,
                    detailText: "Confidence: \(estimate.confidence)",
                    sessionUtilization: nil, weeklyUtilization: nil,
                    confidenceExplanation: CodexConfidenceEngine().explanation(for: estimate.confidence)
                )
            case let .gemini(status, _):
                return ProviderCard(
                    id: .gemini,
                    cardState: cardState(from: status),
                    headline: "Gemini",
                    detailText: degradedReason(from: status),
                    sessionUtilization: nil,
                    weeklyUtilization: nil,
                    confidenceExplanation: nil
                )
            case let .geminiRich(estimate, _):
                let headline: String
                switch estimate.confidence {
                case .exact: headline = "Gemini — Exact"
                case .highConfidence: headline = "Gemini — High Confidence"
                case .estimated: headline = "Gemini — Estimated"
                case .observedOnly: headline = "Gemini — Observed Only"
                }
                return ProviderCard(
                    id: .gemini, cardState: .configured,
                    headline: headline,
                    detailText: "Confidence: \(estimate.confidence)",
                    sessionUtilization: nil, weeklyUtilization: nil,
                    confidenceExplanation: GeminiConfidenceEngine().explanation(for: estimate.confidence)
                )
            }
        }
        return ShellState(providers: cards)
    }

    func makeShellState(providers: [ProviderSnapshot], now: Date, refreshTimes: [ProviderId: Date]) -> ShellState {
        let base = makeShellState(providers: providers, now: now)
        let updatedCards = base.providers.map { card -> ProviderCard in
            if let lastRefresh = refreshTimes[card.id],
               now.timeIntervalSince(lastRefresh) > Self.staleThreshold,
               card.cardState == .configured {
                return ProviderCard(
                    id: card.id,
                    cardState: .stale,
                    headline: card.headline,
                    detailText: card.detailText,
                    sessionUtilization: card.sessionUtilization,
                    weeklyUtilization: card.weeklyUtilization,
                    confidenceExplanation: card.confidenceExplanation
                )
            }
            return card
        }
        return ShellState(providers: updatedCards)
    }

    func selectedTrayProvider(from providers: [ProviderSnapshot], now: Date) -> ProviderSnapshot? {
        let enabled = providers.filter(\.isEnabled)
        guard !enabled.isEmpty else { return nil }

        // Filter out degraded providers, fall back to all enabled if none are non-degraded
        let nonDegraded = enabled.filter { !$0.isDegraded }
        let candidates = nonDegraded.isEmpty ? enabled : nonDegraded

        // Priority: pinned > manualOverride > rotation
        if let pinned = trayPolicy.pinnedProvider {
            return candidates.first { $0.id == pinned }
        }

        if let override = trayPolicy.manualOverride {
            return candidates.first { $0.id == override }
        }

        // Rotation: cycle through candidates based on time
        let index = Int(floor(now.timeIntervalSince1970 / trayPolicy.rotationInterval)) % candidates.count
        return candidates[index]
    }

    // MARK: - Private helpers

    private func cardState(from status: ProviderStatus) -> CardState {
        switch status {
        case .configured: return .configured
        case .missingConfiguration: return .missingConfiguration
        case .degraded: return .degraded
        }
    }

    private func degradedReason(from status: ProviderStatus) -> String? {
        if case .degraded(let reason) = status { return reason }
        return nil
    }
}
