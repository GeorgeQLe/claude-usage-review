import XCTest
@testable import ClaudeUsage

// MARK: - Adapter Diagnostics Tests

final class AdapterDiagnosticsTests: XCTestCase {
    var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("DiagnosticsTests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    /// After a successful refresh, lastRefreshTime should be set to ~now.
    func testAdapterTracksLastRefreshTimestamp() {
        // Create a valid codex home so detection passes
        let configPath = tempDir.appendingPathComponent("config.toml")
        FileManager.default.createFile(atPath: configPath.path, contents: Data("# codex config\n".utf8))

        let ledgerDir = tempDir.appendingPathComponent("ledger")
        try! FileManager.default.createDirectory(at: ledgerDir, withIntermediateDirectories: true)

        let adapter = CodexAdapter(codexHome: tempDir, planProfile: nil, ledgerDirectory: ledgerDir)
        adapter.refresh()

        // RED: lastRefreshTime does not exist on CodexAdapter yet
        XCTAssertNotNil(adapter.lastRefreshTime)
        XCTAssertEqual(adapter.lastRefreshTime!.timeIntervalSince(Date()), 0, accuracy: 1.0)
    }

    /// Consecutive failures should be tracked when refresh encounters errors.
    func testAdapterTracksConsecutiveFailureCount() {
        // config.toml present → detected as installed
        let configPath = tempDir.appendingPathComponent("config.toml")
        FileManager.default.createFile(atPath: configPath.path, contents: Data("# codex config\n".utf8))

        // Point history at a directory (not a file) to force a filesystem error
        let historyDir = tempDir.appendingPathComponent("history.jsonl")
        try! FileManager.default.createDirectory(at: historyDir, withIntermediateDirectories: true)

        let ledgerDir = tempDir.appendingPathComponent("ledger")
        try! FileManager.default.createDirectory(at: ledgerDir, withIntermediateDirectories: true)

        let adapter = CodexAdapter(codexHome: tempDir, planProfile: nil, ledgerDirectory: ledgerDir)
        adapter.refresh()
        adapter.refresh()
        adapter.refresh()

        // RED: consecutiveFailures does not exist on CodexAdapter yet
        XCTAssertEqual(adapter.consecutiveFailures, 3)
    }

    /// Consecutive failure count resets to 0 after a successful refresh.
    func testAdapterResetFailureCountOnSuccess() {
        let configPath = tempDir.appendingPathComponent("config.toml")
        FileManager.default.createFile(atPath: configPath.path, contents: Data("# codex config\n".utf8))

        // Start broken: history path is a directory
        let historyDir = tempDir.appendingPathComponent("history.jsonl")
        try! FileManager.default.createDirectory(at: historyDir, withIntermediateDirectories: true)

        let ledgerDir = tempDir.appendingPathComponent("ledger")
        try! FileManager.default.createDirectory(at: ledgerDir, withIntermediateDirectories: true)

        let adapter = CodexAdapter(codexHome: tempDir, planProfile: nil, ledgerDirectory: ledgerDir)
        adapter.refresh()
        adapter.refresh()

        // RED: consecutiveFailures does not exist yet
        XCTAssertEqual(adapter.consecutiveFailures, 2)

        // Fix: remove the directory so parser falls through gracefully
        try? FileManager.default.removeItem(at: historyDir)
        adapter.refresh()

        XCTAssertEqual(adapter.consecutiveFailures, 0)
    }

    /// After 3 consecutive failures, adapter state should be .degraded(reason:).
    func testAdapterReportsDegradedAfterThreeFailures() {
        let configPath = tempDir.appendingPathComponent("config.toml")
        FileManager.default.createFile(atPath: configPath.path, contents: Data("# codex config\n".utf8))

        let historyDir = tempDir.appendingPathComponent("history.jsonl")
        try! FileManager.default.createDirectory(at: historyDir, withIntermediateDirectories: true)

        let ledgerDir = tempDir.appendingPathComponent("ledger")
        try! FileManager.default.createDirectory(at: ledgerDir, withIntermediateDirectories: true)

        let adapter = CodexAdapter(codexHome: tempDir, planProfile: nil, ledgerDirectory: ledgerDir)
        adapter.refresh()
        adapter.refresh()
        adapter.refresh()

        // RED: .degraded(reason:) case does not exist on CodexAdapterState yet
        if case .degraded(let reason) = adapter.state {
            XCTAssertTrue(reason.lowercased().contains("parse") || reason.lowercased().contains("error"),
                          "Degraded reason should mention parse or error, got: \(reason)")
        } else {
            XCTFail("Expected .degraded state after 3 failures, got: \(adapter.state)")
        }
    }

    /// Adapter should recover from degraded back to .installed on a successful refresh.
    func testAdapterRecoveryFromDegradedOnSuccessfulRefresh() {
        let configPath = tempDir.appendingPathComponent("config.toml")
        FileManager.default.createFile(atPath: configPath.path, contents: Data("# codex config\n".utf8))

        let historyDir = tempDir.appendingPathComponent("history.jsonl")
        try! FileManager.default.createDirectory(at: historyDir, withIntermediateDirectories: true)

        let ledgerDir = tempDir.appendingPathComponent("ledger")
        try! FileManager.default.createDirectory(at: ledgerDir, withIntermediateDirectories: true)

        let adapter = CodexAdapter(codexHome: tempDir, planProfile: nil, ledgerDirectory: ledgerDir)
        // Drive into degraded state
        adapter.refresh()
        adapter.refresh()
        adapter.refresh()

        // Fix the broken state
        try? FileManager.default.removeItem(at: historyDir)
        adapter.refresh()

        // RED: .degraded case doesn't exist yet, and recovery logic doesn't exist
        if case .installed = adapter.state {
            // Success — recovered to installed
        } else {
            XCTFail("Expected .installed state after recovery, got: \(adapter.state)")
        }
        XCTAssertEqual(adapter.consecutiveFailures, 0)
    }
}

// MARK: - Stale Detection Tests

final class StaleDetectionTests: XCTestCase {

    /// A provider whose last refresh is older than 5 minutes should show .stale card state.
    func testProviderCardShowsStaleBadgeWhenRefreshOlderThan5Minutes() {
        let estimate = CodexEstimate(confidence: .observedOnly)
        let snapshot = ProviderSnapshot.codexRich(estimate: estimate, isEnabled: true)
        let staleTime = Date().addingTimeInterval(-301)

        let coordinator = ProviderCoordinator()
        // RED: makeShellState overload with refreshTimes does not exist yet
        let shell = coordinator.makeShellState(
            providers: [snapshot],
            now: Date(),
            refreshTimes: [.codex: staleTime]
        )

        // RED: .stale case does not exist on CardState yet
        XCTAssertEqual(shell.providers.first?.cardState, .stale)
    }

    /// A provider with a recent refresh should show .configured card state.
    func testProviderCardShowsConfiguredWhenRefreshRecent() {
        let estimate = CodexEstimate(confidence: .observedOnly)
        let snapshot = ProviderSnapshot.codexRich(estimate: estimate, isEnabled: true)
        let recentTime = Date().addingTimeInterval(-10)

        let coordinator = ProviderCoordinator()
        let shell = coordinator.makeShellState(
            providers: [snapshot],
            now: Date(),
            refreshTimes: [.codex: recentTime]
        )

        XCTAssertEqual(shell.providers.first?.cardState, .configured)
    }

    /// Tray text should indicate staleness for stale providers.
    func testTrayTextIncludesStaleIndicatorForStaleProvider() {
        let estimate = CodexEstimate(confidence: .observedOnly)
        let snapshot = ProviderSnapshot.codexRich(estimate: estimate, isEnabled: true)
        let staleTime = Date().addingTimeInterval(-301)

        let coordinator = ProviderCoordinator()
        // RED: makeShellState overload with refreshTimes does not exist yet
        let shell = coordinator.makeShellState(
            providers: [snapshot],
            now: Date(),
            refreshTimes: [.codex: staleTime]
        )

        // Verify stale card state first
        XCTAssertEqual(shell.providers.first?.cardState, .stale)

        // The tray text for a stale provider should contain a stale indicator
        let viewModel = ProviderShellViewModel.formatTrayText
        // RED: formatTrayText doesn't handle .stale cards or accept CardState
        // For now, verify via the snapshot-based path
        let text = ProviderShellViewModel.formatStaleText(from: snapshot)
        XCTAssertTrue(text.contains("·") || text.contains("Stale"),
                      "Stale tray text should contain indicator, got: \(text)")
    }

    /// The default stale threshold should be 300 seconds (5 minutes).
    func testStaleThresholdDefaultIs300Seconds() {
        // RED: staleThreshold does not exist on ProviderCoordinator yet
        XCTAssertEqual(ProviderCoordinator.staleThreshold, 300)
    }
}

// MARK: - Confidence Explanation Tests

final class ConfidenceExplanationTests: XCTestCase {

    /// Explanation for .observedOnly should mention plan context.
    func testConfidenceExplanationForObservedOnly() {
        let engine = CodexConfidenceEngine()
        // RED: explanation(for:) does not exist on CodexConfidenceEngine yet
        let text = engine.explanation(for: .observedOnly)
        XCTAssertTrue(text.lowercased().contains("plan"),
                      "observedOnly explanation should mention plan, got: \(text)")
    }

    /// Explanation for .estimated should mention wrapper or plan.
    func testConfidenceExplanationForEstimated() {
        let engine = CodexConfidenceEngine()
        let text = engine.explanation(for: .estimated)
        XCTAssertTrue(text.lowercased().contains("wrapper") || text.lowercased().contains("plan"),
                      "estimated explanation should mention wrapper or plan, got: \(text)")
    }

    /// Explanation for .highConfidence should mention limit.
    func testConfidenceExplanationForHighConfidence() {
        let engine = CodexConfidenceEngine()
        let text = engine.explanation(for: .highConfidence)
        XCTAssertTrue(text.lowercased().contains("limit"),
                      "highConfidence explanation should mention limit, got: \(text)")
    }
}

// MARK: - Tray Edge Case Tests

final class TrayEdgeCaseTests: XCTestCase {

    /// Tray text for a degraded provider should contain "Degraded".
    func testTrayTextForDegradedProvider() {
        // RED: .degraded(reason:) on ProviderStatus exists, but formatTrayText doesn't handle it
        let snapshot = ProviderSnapshot.codex(
            status: .degraded(reason: "parse error"),
            isEnabled: true
        )
        let viewModel = ProviderShellViewModel.self
        // Use the instance method — need a minimal ProviderShellViewModel or test the coordinator path
        let coordinator = ProviderCoordinator()
        let shell = coordinator.makeShellState(providers: [snapshot], now: Date())

        XCTAssertEqual(shell.providers.first?.cardState, .degraded)

        // RED: formatTrayText doesn't produce "Degraded" text for degraded snapshots
        // The tray text path through ProviderShellViewModel.formatTrayText should handle degraded
        let text = ProviderShellViewModel.formatDegradedTrayText(from: snapshot)
        XCTAssertTrue(text.contains("Degraded"),
                      "Degraded tray text should contain 'Degraded', got: \(text)")
    }

    /// When all providers are disabled, selectedTrayProvider should return nil.
    func testTrayTextWhenAllProvidersDisabled() {
        let snapshots: [ProviderSnapshot] = [
            .codex(status: .configured, isEnabled: false),
            .gemini(status: .configured, isEnabled: false),
        ]

        let coordinator = ProviderCoordinator()
        let selected = coordinator.selectedTrayProvider(from: snapshots, now: Date())

        XCTAssertNil(selected, "selectedTrayProvider should return nil when all providers disabled")
    }

    /// Tray rotation should prefer configured providers over degraded ones.
    func testTrayRotationSkipsDegradedProvider() {
        let snapshots: [ProviderSnapshot] = [
            .codex(status: .degraded(reason: "parse error"), isEnabled: true),
            .gemini(status: .configured, isEnabled: true),
        ]

        let coordinator = ProviderCoordinator()
        let selected = coordinator.selectedTrayProvider(from: snapshots, now: Date())

        // RED: selectedTrayProvider doesn't currently skip degraded providers
        XCTAssertNotNil(selected)
        XCTAssertEqual(selected?.id, .gemini,
                       "Rotation should skip degraded codex and select configured gemini")
    }
}
