import SwiftUI
import Combine
import UserNotifications
import os.log

private let logger = Logger(subsystem: "com.claudeusage", category: "ViewModel")

enum TimeDisplayFormat: String, CaseIterable {
    case resetTime = "reset_time"
    case remainingTime = "remaining_time"

    var displayName: String {
        switch self {
        case .resetTime:
            return "Reset Time"
        case .remainingTime:
            return "Time Until Reset"
        }
    }
}

enum PaceStatus {
    case unknown
    case onTrack
    case warning
    case critical
    case limitHit
    case behindPace   // underutilizing (pace-aware mode only)
    case wayBehind    // severely underutilizing (pace-aware mode only)
}

enum PaceTheme: String, CaseIterable {
    case running = "running"
    case racecar = "racecar"
    case f1Quali = "f1_quali"

    var displayName: String {
        switch self {
        case .running: return "Running 🚶"
        case .racecar: return "Racecar 🏎️"
        case .f1Quali: return "F1 Quali 🟣"
        }
    }

    func emoji(for status: PaceStatus) -> String {
        switch self {
        case .running:
            switch status {
            case .unknown, .onTrack: return "🚶"
            case .behindPace: return "🦥"
            case .wayBehind: return "🛌"
            case .warning: return "🏃"
            case .critical: return "🔥"
            case .limitHit: return "💀"
            }
        case .racecar:
            switch status {
            case .unknown, .onTrack: return "🏎️"
            case .behindPace: return "🚗"
            case .wayBehind: return "🅿️"
            case .warning: return "🟡"
            case .critical: return "🚨"
            case .limitHit: return "🔴"
            }
        case .f1Quali:
            switch status {
            case .unknown, .onTrack: return "🟣"
            case .behindPace: return "🔵"
            case .wayBehind: return "⚪"
            case .warning: return "🟢"
            case .critical: return "🟡"
            case .limitHit: return "🔴"
            }
        }
    }

    var targetEmoji: String {
        switch self {
        case .running: return "🎯"
        case .racecar: return "🏁"
        case .f1Quali: return "🎯"
        }
    }

    var weeklyEmoji: String {
        switch self {
        case .running: return "📊"
        case .racecar: return "📊"
        case .f1Quali: return "📊"
        }
    }
}

class UsageViewModel: ObservableObject {
    @Published var usageData: UsageData?
    @Published var lastUpdated: Date?
    @Published var errorState: ErrorState?
    @Published var refreshRequested = false
    @Published var authStatus: AuthStatus = .notConfigured
    @Published var timeDisplayFormat = TimeDisplayFormat.resetTime
    @Published var paceTheme = PaceTheme.running
    @Published var weeklyColorMode = WeeklyColorMode.paceAware

    enum ErrorState: Equatable {
        case authExpired
        case networkError(detail: String)
    }

    enum AuthStatus {
        case connected
        case expired
        case notConfigured
    }

    let accountStore: AccountStore
    let historyStore = HistoryStore()
    @Published var historySnapshots: [UsageSnapshot] = []

    @Published var tick: UInt = 0

    private let pollingInterval: TimeInterval = 300 // 5 minutes
    private var pollingTask: Task<Void, Never>?
    private var resetTask: Task<Void, Never>?
    private var tickTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    /// The email of the currently active account.
    var activeEmail: String? {
        accountStore.activeAccount?.email
    }

    init(accountStore: AccountStore) {
        self.accountStore = accountStore

        // Initialize time display preference from UserDefaults
        let savedFormat = UserDefaults.standard.string(forKey: "claude_time_display_format") ?? TimeDisplayFormat.remainingTime.rawValue
        timeDisplayFormat = TimeDisplayFormat(rawValue: savedFormat) ?? .remainingTime

        let savedTheme = UserDefaults.standard.string(forKey: "claude_pace_theme") ?? PaceTheme.running.rawValue
        paceTheme = PaceTheme(rawValue: savedTheme) ?? .running

        let savedColorMode = UserDefaults.standard.string(forKey: WeeklyColorMode.defaultsKey) ?? WeeklyColorMode.paceAware.rawValue
        weeklyColorMode = WeeklyColorMode(rawValue: savedColorMode) ?? .paceAware

        updateAuthStatus()

        // Watch for refresh requests
        $refreshRequested
            .filter { $0 }
            .sink { [weak self] _ in
                self?.refreshRequested = false
                self?.fetchNow()
            }
            .store(in: &cancellables)

        // Watch for UserDefaults changes to update timeDisplayFormat and paceTheme
        NotificationCenter.default
            .publisher(for: UserDefaults.didChangeNotification)
            .sink { [weak self] _ in
                DispatchQueue.main.async {
                    let savedFormat = UserDefaults.standard.string(forKey: "claude_time_display_format") ?? TimeDisplayFormat.resetTime.rawValue
                    self?.timeDisplayFormat = TimeDisplayFormat(rawValue: savedFormat) ?? .resetTime

                    let savedTheme = UserDefaults.standard.string(forKey: "claude_pace_theme") ?? PaceTheme.running.rawValue
                    self?.paceTheme = PaceTheme(rawValue: savedTheme) ?? .running

                    let savedColorMode = UserDefaults.standard.string(forKey: WeeklyColorMode.defaultsKey) ?? WeeklyColorMode.paceAware.rawValue
                    self?.weeklyColorMode = WeeklyColorMode(rawValue: savedColorMode) ?? .paceAware
                }
            }
            .store(in: &cancellables)

        // Start a 1-second tick timer to drive the live countdown
        tickTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            DispatchQueue.main.async { self?.tick &+= 1 }
        }

        // Request notification permission for session-reset alerts
        requestNotificationPermission()

        // Watch for active account changes and restart polling
        // Note: @Published fires on willSet, so we receive on next runloop tick
        // to ensure activeAccountId is already updated when we read it.
        accountStore.$activeAccountId
            .removeDuplicates()
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                guard let self = self else { return }
                // Cancel existing polling and reset task FIRST to prevent stale fetches
                self.pollingTask?.cancel()
                self.pollingTask = nil
                self.resetTask?.cancel()
                self.resetTask = nil
                self.usageData = nil
                self.lastUpdated = nil
                self.errorState = nil
                self.updateAuthStatus()
                // Reload history for new account
                if let newId = self.accountStore.activeAccountId {
                    self.historySnapshots = self.historyStore.snapshots(for: newId, lastHours: 24)
                } else {
                    self.historySnapshots = []
                }
                self.startPollingIfConfigured()
            }
            .store(in: &cancellables)
    }

    deinit {
        pollingTask?.cancel()
        resetTask?.cancel()
        tickTimer?.invalidate()
    }

    func updateAuthStatus() {
        guard let account = accountStore.activeAccount else {
            authStatus = .notConfigured
            return
        }
        // Check both in-memory model and Keychain for credentials
        let hasKey: Bool = {
            if let key = account.sessionKey, !key.isEmpty { return true }
            if let key = accountStore.sessionKey(for: account.id), !key.isEmpty { return true }
            return false
        }()
        let hasOrg: Bool = {
            if let org = account.orgId, !org.isEmpty { return true }
            if let org = accountStore.orgId(for: account.id), !org.isEmpty { return true }
            return false
        }()
        if hasKey && hasOrg {
            if errorState == .authExpired {
                authStatus = .expired
            } else {
                // Credentials exist — treat as connected (data fetch in progress or complete)
                authStatus = .connected
            }
        } else {
            authStatus = .notConfigured
        }
    }

    /// Starts polling if credentials are available. Call after saving new credentials.
    func startPollingIfConfigured() {
        pollingTask?.cancel()

        guard let accountId = accountStore.activeAccountId,
              let sessionKey = accountStore.sessionKey(for: accountId),
              let orgId = accountStore.orgId(for: accountId),
              !sessionKey.isEmpty, !orgId.isEmpty else {
            return
        }

        pollingTask = Task { [weak self] in
            guard let self = self else { return }
            // Initial fetch
            guard !Task.isCancelled, self.accountStore.activeAccountId == accountId else { return }
            await self.performFetch(sessionKey: sessionKey, orgId: orgId, accountId: accountId)

            // Polling loop
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.pollingInterval * 1_000_000_000))
                if Task.isCancelled { break }
                // Verify this is still the active account
                guard self.accountStore.activeAccountId == accountId else { break }
                // Re-read credentials in case they were updated
                guard let currentKey = self.accountStore.sessionKey(for: accountId),
                      let currentOrg = self.accountStore.orgId(for: accountId) else {
                    break
                }
                await self.performFetch(sessionKey: currentKey, orgId: currentOrg, accountId: accountId)
            }
        }
    }

    /// Triggers an immediate fetch outside the polling cycle.
    func fetchNow() {
        guard let accountId = accountStore.activeAccountId,
              let sessionKey = accountStore.sessionKey(for: accountId),
              let orgId = accountStore.orgId(for: accountId),
              !sessionKey.isEmpty, !orgId.isEmpty else {
            return
        }

        Task { [weak self] in
            await self?.performFetch(sessionKey: sessionKey, orgId: orgId, accountId: accountId)
        }
    }

    @MainActor
    private func performFetch(sessionKey: String, orgId: String, accountId: UUID) async {
        let service = UsageService(sessionKey: sessionKey, orgId: orgId)
        do {
            let (data, newKey) = try await service.fetchUsage()

            // Update Keychain if a new session key was returned via Set-Cookie
            if let newKey = newKey {
                accountStore.saveSessionKey(newKey, for: accountId)
            }

            usageData = data
            lastUpdated = Date()
            errorState = nil
            authStatus = .connected

            // Schedule auto-fetch at session reset time
            if let resetsAt = data.fiveHour.resetsAt {
                scheduleResetFetch(resetsAt: resetsAt, accountId: accountId)
            }

            // Record history snapshot
            let snapshot = UsageSnapshot(
                timestamp: Date(),
                sessionUtilization: data.fiveHour.utilization,
                weeklyUtilization: data.sevenDay.utilization
            )
            historyStore.append(snapshot, for: accountId)
            historySnapshots = historyStore.snapshots(for: accountId, lastHours: 24)
        } catch let error as UsageServiceError {
            switch error {
            case .authError(let code):
                errorState = .authExpired
                authStatus = .expired
                logger.error("Auth error: HTTP \(code)")
            case .httpError(let code):
                errorState = .networkError(detail: "HTTP \(code)")
                logger.error("HTTP error: \(code)")
            case .invalidResponse:
                errorState = .networkError(detail: "Invalid response")
                logger.error("Invalid response (not HTTP)")
            case .missingCredentials:
                errorState = .networkError(detail: "Missing credentials")
                logger.error("Missing credentials")
            }
        } catch let error as DecodingError {
            errorState = .networkError(detail: "Parse error")
            logger.error("JSON decoding error: \(String(describing: error))")
        } catch {
            errorState = .networkError(detail: "Connection failed")
            logger.error("Network error: \(error.localizedDescription)")
        }
    }

    // MARK: - Reset Scheduling & Notifications

    private func scheduleResetFetch(resetsAt: Date, accountId: UUID) {
        resetTask?.cancel()
        let delay = resetsAt.timeIntervalSinceNow
        guard delay > 0 else { return }

        resetTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            guard let self = self,
                  self.accountStore.activeAccountId == accountId,
                  let sessionKey = self.accountStore.sessionKey(for: accountId),
                  let orgId = self.accountStore.orgId(for: accountId) else { return }
            await self.performFetch(sessionKey: sessionKey, orgId: orgId, accountId: accountId)
            self.postResetNotification()
        }
    }

    private func postResetNotification() {
        let content = UNMutableNotificationContent()
        content.title = "Session Reset"
        content.body = "Your Claude session limit has reset"
        content.sound = .default

        let request = UNNotificationRequest(identifier: "session-reset", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    /// Returns the highest utilization percentage across all non-nil limits.
    var highestUtilization: Double {
        guard let data = usageData else { return 0 }
        var limits: [UsageLimit] = [data.fiveHour, data.sevenDay]
        if let s = data.sevenDaySonnet { limits.append(s) }
        if let o = data.sevenDayOpus { limits.append(o) }
        if let oa = data.sevenDayOauthApps { limits.append(oa) }
        if let c = data.sevenDayCowork { limits.append(c) }
        if let i = data.iguanaNecktie { limits.append(i) }
        if let e = data.extraUsage { limits.append(e) }
        return limits.map(\.utilization).max() ?? 0
    }

    /// Returns a human-readable string for how long ago data was last updated.
    var lastUpdatedString: String {
        _ = tick // Access tick so SwiftUI re-evaluates when it changes
        guard let lastUpdated = lastUpdated else { return "Never" }
        let seconds = Int(Date().timeIntervalSince(lastUpdated))
        if seconds < 60 {
            return "Just now"
        } else if seconds < 3600 {
            let minutes = seconds / 60
            return "\(minutes)m ago"
        } else {
            let hours = seconds / 3600
            return "\(hours)h ago"
        }
    }

    /// Collects all non-nil limits with display names for use in the popover.
    var displayLimits: [(name: String, limit: UsageLimit)] {
        guard let data = usageData else { return [] }
        var results: [(name: String, limit: UsageLimit)] = [
            ("Session", data.fiveHour),
            ("Weekly", data.sevenDay),
        ]
        if let s = data.sevenDaySonnet { results.append(("Sonnet", s)) }
        if let o = data.sevenDayOpus { results.append(("Opus", o)) }
        if let oa = data.sevenDayOauthApps { results.append(("OAuth Apps", oa)) }
        if let c = data.sevenDayCowork { results.append(("Cowork", c)) }
        if let i = data.iguanaNecktie { results.append(("Other", i)) }
        if let e = data.extraUsage { results.append(("Extra Usage", e)) }
        return results
    }

    /// Returns a formatted string showing time remaining until the 5-hour limit resets.
    var remainingTimeString: String {
        _ = tick // Access tick so SwiftUI re-evaluates when it changes
        guard let resetDate = usageData?.fiveHour.resetsAt else { return "" }

        let remaining = Int(resetDate.timeIntervalSinceNow)
        if remaining <= 0 { return "0:00:00" }

        let hours = remaining / 3600
        let minutes = (remaining % 3600) / 60
        let seconds = remaining % 60
        return String(format: "%d:%02d:%02d", hours, minutes, seconds)
    }

    /// Returns the formatted reset time string (existing behavior).
    var resetTimeString: String {
        _ = tick // Access tick so SwiftUI re-evaluates when it changes
        guard let resetDate = usageData?.fiveHour.resetsAt else { return "" }
        let fmt = DateFormatter()
        fmt.dateFormat = "h:mm a"
        return fmt.string(from: resetDate)
    }

    /// Returns the appropriate time string based on user preference.
    var menuBarTimeString: String {
        switch timeDisplayFormat {
        case .resetTime:
            return resetTimeString
        case .remainingTime:
            return remainingTimeString
        }
    }

    // MARK: - Weekly Pace

    /// Returns actual/expected ratio, or nil if too early/late in the window.
    private func paceRatio(for limit: UsageLimit, windowSeconds: TimeInterval) -> Double? {
        guard let resetsAt = limit.resetsAt else { return nil }
        let now = Date()
        let timeRemaining = resetsAt.timeIntervalSince(now)
        let timeElapsed = windowSeconds - timeRemaining

        // Ratio is unstable in the first 6 hours or last hour
        guard timeElapsed >= 6 * 3600, timeRemaining >= 3600 else { return nil }

        let expected = (timeElapsed / windowSeconds) * 100
        guard expected > 0 else { return nil }
        return limit.utilization / expected
    }

    /// Arrow indicator for the menu bar: ▲ (ahead), ▼ (behind), or "" (on pace).
    var weeklyPaceIndicator: String {
        guard let ratio = paceRatio(for: usageData?.sevenDay ?? UsageLimit(utilization: 0, resetsAt: nil),
                                     windowSeconds: 7 * 86400) else {
            return ""
        }
        if ratio > 1.15 { return "▲" }
        if ratio < 0.85 { return "▼" }
        return ""
    }

    /// Session pace ratio: actual/expected usage within the 5-hour window.
    /// Uses shorter stability guards than weekly (15 min elapsed, 5 min remaining).
    private func sessionPaceRatio() -> Double? {
        guard let fiveHour = usageData?.fiveHour,
              let resetsAt = fiveHour.resetsAt else { return nil }
        let windowSeconds: TimeInterval = 5 * 3600
        let timeRemaining = resetsAt.timeIntervalSince(Date())
        let timeElapsed = windowSeconds - timeRemaining

        // Ratio is unstable in the first 15 min or last 5 min
        guard timeElapsed >= 15 * 60, timeRemaining >= 5 * 60 else { return nil }

        let expected = (timeElapsed / windowSeconds) * 100
        guard expected > 0 else { return nil }
        return fiveHour.utilization / expected
    }

    /// Pace status derived from session (5-hour) utilization and pace ratio.
    var sessionPaceStatus: PaceStatus {
        guard let fiveHour = usageData?.fiveHour else { return .unknown }
        if fiveHour.utilization >= 100 { return .limitHit }

        guard let ratio = sessionPaceRatio() else {
            // Before stability window, fall back to raw thresholds
            if fiveHour.utilization >= 80 { return .critical }
            if fiveHour.utilization >= 60 { return .warning }
            return .unknown
        }
        // Same thresholds as weekly pace
        if ratio > 1.4 { return .critical }
        if ratio > 1.15 { return .warning }
        if ratio < 0.6 { return .wayBehind }
        if ratio < 0.85 { return .behindPace }
        return .onTrack
    }

    /// Pace status derived from weekly utilization and pace ratio.
    /// In pace-aware mode, also flags being behind pace (underutilizing).
    var paceStatus: PaceStatus {
        guard let sevenDay = usageData?.sevenDay else { return .unknown }
        if sevenDay.utilization >= 100 { return .limitHit }

        guard let ratio = paceRatio(for: sevenDay, windowSeconds: 7 * 86400) else {
            return .unknown
        }
        // Ahead of pace (overusing)
        if ratio > 1.4 { return .critical }
        if ratio > 1.15 { return .warning }
        // Behind pace (underutilizing) — only in pace-aware mode
        if weeklyColorMode == .paceAware {
            if ratio < 0.6 { return .wayBehind }
            if ratio < 0.85 { return .behindPace }
        }
        return .onTrack
    }

    /// Estimated usage today: delta in weekly utilization since midnight (or earliest snapshot today).
    var todayUsagePercent: Int? {
        guard let currentWeekly = usageData?.sevenDay.utilization else { return nil }

        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())

        // Find the earliest snapshot from today (closest to midnight)
        let todaySnapshots = historySnapshots.filter { $0.timestamp >= startOfDay }
        guard let earliest = todaySnapshots.first else {
            // No snapshots from today yet — usage since we started tracking is 0
            return 0
        }

        let delta = currentWeekly - earliest.weeklyUtilization
        return max(0, Int(delta.rounded()))
    }

    /// Daily budget target: remaining weekly % spread over remaining days.
    var dailyBudgetPercent: Int? {
        guard let sevenDay = usageData?.sevenDay,
              let resetsAt = sevenDay.resetsAt else { return nil }

        let timeRemaining = resetsAt.timeIntervalSince(Date())
        guard timeRemaining > 0 else { return 0 }

        let remaining = 100.0 - sevenDay.utilization
        if remaining <= 0 { return 0 }

        let daysRemaining = timeRemaining / 86400.0
        return Int((remaining / daysRemaining).rounded())
    }

    /// Actionable pace detail shown under the Weekly bar.
    var weeklyPaceDetail: String? {
        guard let sevenDay = usageData?.sevenDay,
              let resetsAt = sevenDay.resetsAt else { return nil }

        if sevenDay.utilization >= 100 { return "Weekly limit reached" }

        let timeRemaining = resetsAt.timeIntervalSince(Date())
        guard timeRemaining > 0 else { return "Weekly limit reached" }

        let remaining = 100.0 - sevenDay.utilization
        let daysRemaining = timeRemaining / 86400.0
        let budgetPerDay = remaining / daysRemaining
        let daysLeft = Int(daysRemaining.rounded(.down))

        let guidance: String
        switch paceStatus {
        case .onTrack:
            guidance = "On pace — use more"
        case .behindPace:
            guidance = "Behind pace — pick it up"
        case .wayBehind:
            guidance = "Way behind — use it or lose it"
        case .warning:
            guidance = "Ahead of pace — ease up"
        case .critical:
            guidance = "Way ahead — slow down"
        case .limitHit:
            guidance = "Maxed out"
        case .unknown:
            guidance = "Calculating…"
        }

        let todayPct = todayUsagePercent ?? 0
        let weeklyPct = Int(sevenDay.utilization.rounded())
        return "\(paceTheme.targetEmoji) \(todayPct)%/\(Int(budgetPerDay.rounded()))%/day · \(paceTheme.weeklyEmoji) \(weeklyPct)%/w\n\(daysLeft)d left · \(guidance)"
    }

    /// Just the guidance status message (e.g. "Behind pace — pick it up").
    var paceGuidance: String? {
        guard let sevenDay = usageData?.sevenDay,
              let resetsAt = sevenDay.resetsAt else { return nil }

        if sevenDay.utilization >= 100 { return "Weekly limit reached" }

        let timeRemaining = resetsAt.timeIntervalSince(Date())
        let timeElapsed = 7 * 86400.0 - timeRemaining
        guard timeElapsed >= 6 * 3600, timeRemaining >= 3600 else { return nil }

        switch paceStatus {
        case .onTrack: return "On pace — use more"
        case .behindPace: return "Behind pace — pick it up"
        case .wayBehind: return "Way behind — use it or lose it"
        case .warning: return "Ahead of pace — ease up"
        case .critical: return "Way ahead — slow down"
        case .limitHit: return "Maxed out"
        case .unknown: return "Calculating…"
        }
    }
}
