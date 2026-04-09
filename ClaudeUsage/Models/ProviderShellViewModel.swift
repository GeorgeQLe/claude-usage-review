import Foundation
import Combine

class ProviderShellViewModel: ObservableObject {
    @Published var shellState: ShellState
    @Published var traySnapshot: ProviderSnapshot?
    @Published var trayText: String = ""

    private let coordinator: ProviderCoordinator
    private let settingsStore: ProviderSettingsStore
    private let codexAdapter: CodexAdapter
    private var codexTimer: Timer?
    private var rotationTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    init(usageViewModel: UsageViewModel, settingsStore: ProviderSettingsStore) {
        let policy = ProviderShellViewModel.loadPolicy()
        self.coordinator = ProviderCoordinator(trayPolicy: policy)
        self.settingsStore = settingsStore
        let plan = settingsStore.codexPlan()
        self.codexAdapter = CodexAdapter(planProfile: plan)
        self.shellState = ShellState(providers: [])

        usageViewModel.$usageData
            .combineLatest(usageViewModel.$authStatus, settingsStore.$enabledProviders)
            .receive(on: RunLoop.main)
            .sink { [weak self] usageData, authStatus, _ in
                self?.rebuildShellState(usageData: usageData, authStatus: authStatus)
            }
            .store(in: &cancellables)

        codexAdapter.$state
            .sink { [weak self] _ in self?.rebuildFromCurrent() }
            .store(in: &cancellables)
        codexAdapter.refresh()
        codexTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            self?.codexAdapter.refresh()
        }
        rotationTimer = Timer.scheduledTimer(withTimeInterval: 7, repeats: true) { [weak self] _ in
            self?.rebuildFromCurrent()
        }
    }

    deinit {
        codexTimer?.invalidate()
        rotationTimer?.invalidate()
    }

    // MARK: - Public

    func setManualOverride(_ id: ProviderId?) {
        coordinator.trayPolicy = ProviderTrayPolicy(
            rotationInterval: coordinator.trayPolicy.rotationInterval,
            manualOverride: id,
            pinnedProvider: coordinator.trayPolicy.pinnedProvider
        )
        persistPolicy()
        rebuildFromCurrent()
    }

    func setPinnedProvider(_ id: ProviderId?) {
        coordinator.trayPolicy = ProviderTrayPolicy(
            rotationInterval: coordinator.trayPolicy.rotationInterval,
            manualOverride: coordinator.trayPolicy.manualOverride,
            pinnedProvider: id
        )
        persistPolicy()
        rebuildFromCurrent()
    }

    func clearOverrides() {
        coordinator.trayPolicy = ProviderTrayPolicy(
            rotationInterval: coordinator.trayPolicy.rotationInterval,
            manualOverride: nil,
            pinnedProvider: nil
        )
        persistPolicy()
        rebuildFromCurrent()
    }

    var codexDetected: Bool {
        if case .installed = codexAdapter.state { return true }
        return false
    }

    // MARK: - Private

    private var lastUsageData: UsageData?
    private var lastAuthStatus: UsageViewModel.AuthStatus = .notConfigured

    private func rebuildShellState(usageData: UsageData?, authStatus: UsageViewModel.AuthStatus) {
        lastUsageData = usageData
        lastAuthStatus = authStatus

        var snapshots: [ProviderSnapshot] = []

        switch authStatus {
        case .connected:
            if let usage = usageData {
                snapshots.append(.claude(usage: usage, authStatus: .connected, isEnabled: true))
            } else {
                snapshots.append(.claude(status: .missingConfiguration, isEnabled: true))
            }
        case .expired, .notConfigured:
            snapshots.append(.claude(status: .missingConfiguration, isEnabled: true))
        }

        snapshots.append(codexAdapter.toProviderSnapshot(isEnabled: settingsStore.isEnabled(.codex)))
        snapshots.append(.gemini(status: .missingConfiguration, isEnabled: settingsStore.isEnabled(.gemini)))

        let now = Date()
        shellState = coordinator.makeShellState(providers: snapshots, now: now)
        traySnapshot = coordinator.selectedTrayProvider(from: snapshots, now: now)
        if let snap = traySnapshot {
            trayText = formatTrayText(from: snap)
        }
    }

    func formatTrayText(from snapshot: ProviderSnapshot) -> String {
        switch snapshot {
        case let .claudeRich(usage, _, _):
            let pct = Int(usage.fiveHour.utilization)
            return "Claude \(pct)%"
        case let .claudeSimple(status, _):
            if case .missingConfiguration = status {
                return "Claude · Not configured"
            }
            return "Claude"
        case let .codexRich(estimate, _):
            switch estimate.confidence {
            case .exact:
                return "Codex Exact"
            case .highConfidence:
                return "Codex High"
            case .estimated:
                return "Codex Est. only"
            case .observedOnly:
                return "Codex Observed"
            }
        case let .codex(status, _):
            if case .missingConfiguration = status {
                return "Codex · Not configured"
            }
            return "Codex"
        case let .gemini(status, _):
            if case .missingConfiguration = status {
                return "Gemini · Not configured"
            }
            return "Gemini"
        }
    }

    private func rebuildFromCurrent() {
        rebuildShellState(usageData: lastUsageData, authStatus: lastAuthStatus)
    }

    // MARK: - Persistence

    private static let rotationIntervalKey = "provider_rotation_interval"
    private static let pinnedKey = "provider_pinned"
    private static let manualOverrideKey = "provider_manual_override"

    private static func loadPolicy() -> ProviderTrayPolicy {
        let defaults = UserDefaults.standard
        let interval = defaults.double(forKey: rotationIntervalKey)
        let pinned = defaults.string(forKey: pinnedKey).flatMap(providerIdFromString)
        let override = defaults.string(forKey: manualOverrideKey).flatMap(providerIdFromString)
        return ProviderTrayPolicy(
            rotationInterval: interval > 0 ? interval : 7,
            manualOverride: override,
            pinnedProvider: pinned
        )
    }

    private func persistPolicy() {
        let defaults = UserDefaults.standard
        let policy = coordinator.trayPolicy
        defaults.set(policy.rotationInterval, forKey: Self.rotationIntervalKey)
        defaults.set(policy.pinnedProvider.map(stringFromProviderId), forKey: Self.pinnedKey)
        defaults.set(policy.manualOverride.map(stringFromProviderId), forKey: Self.manualOverrideKey)
    }

    private static func providerIdFromString(_ s: String) -> ProviderId? {
        switch s {
        case "claude": return .claude
        case "codex": return .codex
        case "gemini": return .gemini
        default: return nil
        }
    }
}

private func stringFromProviderId(_ id: ProviderId) -> String {
    switch id {
    case .claude: return "claude"
    case .codex: return "codex"
    case .gemini: return "gemini"
    }
}
