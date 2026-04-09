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
}

// MARK: - ProviderSnapshot

enum ProviderSnapshot {
    case claudeRich(usage: UsageData, authStatus: AuthStatus, isEnabled: Bool)
    case claudeSimple(status: ProviderStatus, isEnabled: Bool)
    case codex(status: ProviderStatus, isEnabled: Bool)
    case codexRich(estimate: CodexEstimate, isEnabled: Bool)
    case gemini(status: ProviderStatus, isEnabled: Bool)

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
        case .gemini: return .gemini
        }
    }

    var isEnabled: Bool {
        switch self {
        case .claudeRich(_, _, let enabled): return enabled
        case .claudeSimple(_, let enabled): return enabled
        case .codex(_, let enabled): return enabled
        case .codexRich(_, let enabled): return enabled
        case .gemini(_, let enabled): return enabled
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
        rotationInterval: TimeInterval = 300,
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
                    weeklyUtilization: usage.sevenDay.utilization
                )
            case let .claudeSimple(status, _):
                return ProviderCard(
                    id: .claude,
                    cardState: cardState(from: status),
                    headline: "Claude",
                    detailText: degradedReason(from: status),
                    sessionUtilization: nil,
                    weeklyUtilization: nil
                )
            case let .codex(status, _):
                return ProviderCard(
                    id: .codex,
                    cardState: cardState(from: status),
                    headline: "Codex",
                    detailText: degradedReason(from: status),
                    sessionUtilization: nil,
                    weeklyUtilization: nil
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
                    sessionUtilization: nil, weeklyUtilization: nil
                )
            case let .gemini(status, _):
                return ProviderCard(
                    id: .gemini,
                    cardState: cardState(from: status),
                    headline: "Gemini",
                    detailText: degradedReason(from: status),
                    sessionUtilization: nil,
                    weeklyUtilization: nil
                )
            }
        }
        return ShellState(providers: cards)
    }

    func selectedTrayProvider(from providers: [ProviderSnapshot], now: Date) -> ProviderSnapshot? {
        let enabled = providers.filter(\.isEnabled)
        guard !enabled.isEmpty else { return nil }

        // Priority: pinned > manualOverride > rotation
        if let pinned = trayPolicy.pinnedProvider {
            return enabled.first { $0.id == pinned }
        }

        if let override = trayPolicy.manualOverride {
            return enabled.first { $0.id == override }
        }

        // Rotation: cycle through enabled providers based on time
        let index = Int(floor(now.timeIntervalSince1970 / trayPolicy.rotationInterval)) % enabled.count
        return enabled[index]
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
