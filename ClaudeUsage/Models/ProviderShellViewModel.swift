import Foundation
import Combine

class ProviderShellViewModel: ObservableObject {
    @Published var shellState: ShellState
    @Published var traySnapshot: ProviderSnapshot?
    @Published var trayText: String = ""

    private let coordinator: ProviderCoordinator
    private let settingsStore: ProviderSettingsStore
    private let codexAdapter: CodexAdapter?
    private let geminiAdapter: GeminiAdapter?
    private let codexSnapshotProvider: (Bool) -> ProviderSnapshot
    private let geminiSnapshotProvider: (Bool) -> ProviderSnapshot
    private let codexLastRefreshTimeProvider: () -> Date?
    private let geminiLastRefreshTimeProvider: () -> Date?
    private let providerTelemetryCoordinator: ProviderTelemetryCoordinator?
    private let nowProvider: () -> Date
    private var codexTimer: Timer?
    private var geminiTimer: Timer?
    private var rotationTimer: Timer?
    private var telemetryTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    init(usageViewModel: UsageViewModel, settingsStore: ProviderSettingsStore) {
        let policy = ProviderShellViewModel.loadPolicy()
        self.coordinator = ProviderCoordinator(trayPolicy: policy)
        self.settingsStore = settingsStore
        let plan = settingsStore.codexPlan()
        let codexAdapter = CodexAdapter(planProfile: plan)
        self.codexAdapter = codexAdapter
        let geminiPlan = settingsStore.geminiPlan()
        let geminiAdapter = GeminiAdapter(
            planProfile: geminiPlan,
            confirmedAuthMode: settingsStore.geminiAuthMode()
        )
        self.geminiAdapter = geminiAdapter
        self.codexSnapshotProvider = { codexAdapter.toProviderSnapshot(isEnabled: $0) }
        self.geminiSnapshotProvider = { geminiAdapter.toProviderSnapshot(isEnabled: $0) }
        self.codexLastRefreshTimeProvider = { codexAdapter.lastRefreshTime }
        self.geminiLastRefreshTimeProvider = { geminiAdapter.lastRefreshTime }
        let telemetryHTTPClient = URLSessionProviderTelemetryHTTPClient()
        self.providerTelemetryCoordinator = ProviderTelemetryCoordinator(
            clients: [
                .codex: CodexTelemetryClient(
                    authProvider: CodexTelemetryAuthProvider(),
                    httpClient: telemetryHTTPClient
                ),
                .gemini: GeminiTelemetryClient(
                    authProvider: GeminiTelemetryAuthProvider(),
                    httpClient: telemetryHTTPClient
                ),
            ],
            store: UserDefaultsProviderTelemetryStore()
        )
        self.nowProvider = Date.init
        self.shellState = ShellState(providers: [])

        usageViewModel.$usageData
            .combineLatest(usageViewModel.$authStatus, settingsStore.$enabledProviders)
            .receive(on: RunLoop.main)
            .sink { [weak self] usageData, authStatus, _ in
                self?.rebuildShellState(usageData: usageData, authStatus: authStatus)
            }
            .store(in: &cancellables)

        settingsStore.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                DispatchQueue.main.async {
                    self?.rebuildFromCurrent()
                    self?.refreshProviderTelemetry(reason: .scheduled)
                }
            }
            .store(in: &cancellables)

        codexAdapter.$state
            .sink { [weak self] _ in self?.rebuildFromCurrent() }
            .store(in: &cancellables)
        codexAdapter.refresh()
        codexTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            self?.codexAdapter?.refresh()
        }

        geminiAdapter.$state
            .sink { [weak self] _ in self?.rebuildFromCurrent() }
            .store(in: &cancellables)
        geminiAdapter.refresh()
        geminiTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            self?.geminiAdapter?.refresh()
        }
        rotationTimer = Timer.scheduledTimer(withTimeInterval: 7, repeats: true) { [weak self] _ in
            self?.rebuildFromCurrent()
        }
        telemetryTimer = Timer.scheduledTimer(
            withTimeInterval: ProviderTelemetryCoordinator.refreshCadence,
            repeats: true
        ) { [weak self] _ in
            self?.refreshProviderTelemetry(reason: .scheduled)
        }
        refreshProviderTelemetry(reason: .scheduled)
    }

    init(
        settingsStore: ProviderSettingsStore,
        trayPolicy: ProviderTrayPolicy = ProviderTrayPolicy(),
        codexSnapshot: ProviderSnapshot,
        codexLastRefreshTime: Date?,
        geminiSnapshot: ProviderSnapshot,
        geminiLastRefreshTime: Date?,
        nowProvider: @escaping () -> Date,
        providerTelemetryCoordinator: ProviderTelemetryCoordinator? = nil
    ) {
        self.coordinator = ProviderCoordinator(trayPolicy: trayPolicy)
        self.settingsStore = settingsStore
        self.codexAdapter = nil
        self.geminiAdapter = nil
        self.codexSnapshotProvider = { _ in codexSnapshot }
        self.geminiSnapshotProvider = { _ in geminiSnapshot }
        self.codexLastRefreshTimeProvider = { codexLastRefreshTime }
        self.geminiLastRefreshTimeProvider = { geminiLastRefreshTime }
        self.providerTelemetryCoordinator = providerTelemetryCoordinator
        self.nowProvider = nowProvider
        self.shellState = ShellState(providers: [])

        rebuildShellState(usageData: nil, authStatus: .notConfigured)
    }

    deinit {
        codexTimer?.invalidate()
        geminiTimer?.invalidate()
        rotationTimer?.invalidate()
        telemetryTimer?.invalidate()
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

    func updateCodexPlan(_ plan: CodexPlanProfile?) {
        codexAdapter?.planProfile = plan
        codexAdapter?.refresh()
        rebuildFromCurrent()
    }

    func updateGeminiSettings(plan: GeminiPlanProfile?, authMode: GeminiAuthMode?) {
        geminiAdapter?.planProfile = plan
        geminiAdapter?.confirmedAuthMode = authMode
        geminiAdapter?.refresh()
        rebuildFromCurrent()
    }

    @discardableResult
    func refreshProviderTelemetry(_ providerId: ProviderId) async -> ProviderTelemetrySnapshot? {
        await refreshProviderTelemetry(providerId, reason: .manual)
    }

    var codexDetected: Bool {
        guard let codexAdapter else { return false }
        if case .installed = codexAdapter.state { return true }
        return false
    }

    var geminiDetected: Bool {
        guard let geminiAdapter else { return false }
        if case .installed = geminiAdapter.state { return true }
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

        snapshots.append(codexSnapshotProvider(settingsStore.isEnabled(.codex)))
        snapshots.append(geminiSnapshotProvider(settingsStore.isEnabled(.gemini)))
        snapshots = attachProviderTelemetry(to: snapshots)

        let now = nowProvider()
        let refreshTimes = providerRefreshTimes()
        shellState = shellStateWithTelemetryRefreshSupport(
            coordinator.makeShellState(providers: snapshots, now: now, refreshTimes: refreshTimes)
        )
        traySnapshot = coordinator.selectedTrayProvider(from: snapshots, now: now)
        if let snap = traySnapshot {
            let selectedCard = shellState.providers.first { $0.id == snap.id }
            trayText = formatTrayText(from: snap, cardState: selectedCard?.cardState)
        } else {
            trayText = ""
        }
    }

    static func formatDegradedTrayText(from snapshot: ProviderSnapshot) -> String {
        let name: String
        switch snapshot.id {
        case .claude: name = "Claude"
        case .codex: name = "Codex"
        case .gemini: name = "Gemini"
        }
        return "\(name) · Degraded"
    }

    static func formatStaleText(from snapshot: ProviderSnapshot) -> String {
        let name: String
        switch snapshot.id {
        case .claude: name = "Claude"
        case .codex: name = "Codex"
        case .gemini: name = "Gemini"
        }
        return "\(name) · Stale"
    }

    func formatTrayText(from snapshot: ProviderSnapshot) -> String {
        formatTrayText(from: snapshot, cardState: nil)
    }

    private func formatTrayText(from snapshot: ProviderSnapshot, cardState: CardState?) -> String {
        if cardState == .stale {
            return Self.formatStaleText(from: snapshot)
        }

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
            if case .degraded = status {
                return "Codex · Degraded"
            }
            return "Codex"
        case let .gemini(status, _):
            if case .missingConfiguration = status {
                return "Gemini · Not configured"
            }
            if case .degraded = status {
                return "Gemini · Degraded"
            }
            return "Gemini"
        case let .geminiRich(estimate, _):
            switch estimate.confidence {
            case .exact:
                return "Gemini Exact"
            case .highConfidence:
                return "Gemini High"
            case .estimated:
                return "Gemini Est. only"
            case .observedOnly:
                return "Gemini Observed"
            }
        }
    }

    private func providerRefreshTimes() -> [ProviderId: Date] {
        var refreshTimes: [ProviderId: Date] = [:]
        if let codexLastRefreshTime = codexLastRefreshTimeProvider() {
            refreshTimes[.codex] = codexLastRefreshTime
        }
        if let geminiLastRefreshTime = geminiLastRefreshTimeProvider() {
            refreshTimes[.gemini] = geminiLastRefreshTime
        }
        return refreshTimes
    }

    private func rebuildFromCurrent() {
        rebuildShellState(usageData: lastUsageData, authStatus: lastAuthStatus)
    }

    private func attachProviderTelemetry(to snapshots: [ProviderSnapshot]) -> [ProviderSnapshot] {
        snapshots.map { snapshot in
            guard snapshot.id != .claude else {
                return snapshot
            }

            guard settingsStore.providerTelemetryEnabled(for: snapshot.id),
                  let telemetry = try? providerTelemetryCoordinator?.snapshot(for: snapshot.id) else {
                ProviderTelemetryAttachmentRegistry.detach(snapshot.id)
                return snapshot
            }

            return ProviderTelemetryAdapterBridge.merge(
                passiveSnapshot: snapshot,
                telemetrySnapshot: telemetry
            )
        }
    }

    private func refreshProviderTelemetry(reason: ProviderTelemetryRefreshReason) {
        guard providerTelemetryCoordinator != nil else {
            return
        }

        for providerId in [ProviderId.codex, ProviderId.gemini] {
            Task { [weak self] in
                _ = await self?.refreshProviderTelemetry(providerId, reason: reason)
            }
        }
    }

    private func refreshProviderTelemetry(
        _ providerId: ProviderId,
        reason: ProviderTelemetryRefreshReason
    ) async -> ProviderTelemetrySnapshot? {
        guard let providerTelemetryCoordinator,
              let passiveSnapshot = passiveProviderSnapshot(for: providerId) else {
            return nil
        }

        let telemetryEnabled = settingsStore.isEnabled(providerId)
            && settingsStore.providerTelemetryEnabled(for: providerId)

        guard telemetryEnabled else {
            ProviderTelemetryAttachmentRegistry.detach(providerId)
            await MainActor.run {
                self.rebuildFromCurrent()
            }
            return nil
        }

        let snapshot = try? await providerTelemetryCoordinator.refreshIfEnabled(
            providerId,
            telemetryEnabled: true,
            reason: reason,
            passiveSnapshot: passiveSnapshot
        )

        await MainActor.run {
            if let snapshot {
                _ = ProviderTelemetryAdapterBridge.merge(
                    passiveSnapshot: passiveSnapshot,
                    telemetrySnapshot: snapshot
                )
            }
            self.rebuildFromCurrent()
        }

        return snapshot
    }

    private func passiveProviderSnapshot(for providerId: ProviderId) -> ProviderSnapshot? {
        switch providerId {
        case .codex:
            return codexSnapshotProvider(settingsStore.isEnabled(.codex))
        case .gemini:
            return geminiSnapshotProvider(settingsStore.isEnabled(.gemini))
        case .claude:
            return nil
        }
    }

    private func shellStateWithTelemetryRefreshSupport(_ shellState: ShellState) -> ShellState {
        ShellState(
            providers: shellState.providers.map { card in
                let supportsRefresh = card.id != .claude
                    && settingsStore.isEnabled(card.id)
                    && settingsStore.providerTelemetryEnabled(for: card.id)
                return card.withProviderTelemetryRefreshSupport(supportsRefresh)
            }
        )
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
