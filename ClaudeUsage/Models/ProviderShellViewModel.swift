import Foundation
import Combine

class ProviderShellViewModel: ObservableObject {
    @Published var shellState: ShellState
    @Published var traySnapshot: ProviderSnapshot?

    private let coordinator: ProviderCoordinator
    private var cancellables = Set<AnyCancellable>()

    init(usageViewModel: UsageViewModel) {
        let policy = ProviderShellViewModel.loadPolicy()
        self.coordinator = ProviderCoordinator(trayPolicy: policy)
        self.shellState = ShellState(providers: [])

        usageViewModel.$usageData
            .combineLatest(usageViewModel.$authStatus)
            .receive(on: RunLoop.main)
            .sink { [weak self] usageData, authStatus in
                self?.rebuildShellState(usageData: usageData, authStatus: authStatus)
            }
            .store(in: &cancellables)
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

        snapshots.append(.codex(status: .missingConfiguration, isEnabled: false))
        snapshots.append(.gemini(status: .missingConfiguration, isEnabled: false))

        let now = Date()
        shellState = coordinator.makeShellState(providers: snapshots, now: now)
        traySnapshot = coordinator.selectedTrayProvider(from: snapshots, now: now)
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
            rotationInterval: interval > 0 ? interval : 300,
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
