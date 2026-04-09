import XCTest
@testable import ClaudeUsage

// MARK: - Shared Mock Infrastructure

class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?
    static var capturedRequest: URLRequest?
    static var capturedBody: Data?

    override class func canInit(with request: URLRequest) -> Bool {
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    override func startLoading() {
        MockURLProtocol.capturedRequest = request
        MockURLProtocol.capturedBody = request.httpBody ?? readBodyStream(request.httpBodyStream)

        guard let handler = MockURLProtocol.requestHandler else {
            client?.urlProtocolDidFinishLoading(self)
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    static func reset() {
        capturedRequest = nil
        capturedBody = nil
        requestHandler = nil
    }

    private func readBodyStream(_ stream: InputStream?) -> Data? {
        guard let stream = stream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}

// MARK: - UsageData Decoding Tests

final class ClaudeUsageTests: XCTestCase {
    func testAppLaunches() throws {
        XCTAssertTrue(true)
    }

    // MARK: - UsageData Decoding Tests

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            if let date = formatter.date(from: dateString) {
                return date
            }
            // Fallback without fractional seconds
            let basic = ISO8601DateFormatter()
            basic.formatOptions = [.withInternetDateTime]
            if let date = basic.date(from: dateString) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode date: \(dateString)")
        }
        return decoder
    }

    func testDecodeFullResponse() throws {
        let json = """
        {
            "five_hour": {"utilization": 17.0, "resets_at": "2026-02-08T18:59:59.661633+00:00"},
            "seven_day": {"utilization": 11.0, "resets_at": "2026-02-14T16:59:59.661657+00:00"},
            "seven_day_oauth_apps": null,
            "seven_day_opus": null,
            "seven_day_sonnet": {"utilization": 0.0, "resets_at": null},
            "seven_day_cowork": null,
            "iguana_necktie": null,
            "extra_usage": null
        }
        """

        let data = json.data(using: .utf8)!
        let usage = try decoder.decode(UsageData.self, from: data)

        XCTAssertEqual(usage.fiveHour.utilization, 17.0)
        XCTAssertNotNil(usage.fiveHour.resetsAt)
        XCTAssertEqual(usage.sevenDay.utilization, 11.0)
        XCTAssertNotNil(usage.sevenDay.resetsAt)
        XCTAssertNotNil(usage.sevenDaySonnet)
        XCTAssertEqual(usage.sevenDaySonnet?.utilization, 0.0)
        XCTAssertNil(usage.sevenDaySonnet?.resetsAt)
        XCTAssertNil(usage.sevenDayOpus)
        XCTAssertNil(usage.sevenDayOauthApps)
        XCTAssertNil(usage.sevenDayCowork)
        XCTAssertNil(usage.iguanaNecktie)
        XCTAssertNil(usage.extraUsage)
    }

    func testDecodeWithNullOptionalFields() throws {
        let json = """
        {
            "five_hour": {"utilization": 50.0, "resets_at": "2026-02-08T12:00:00+00:00"},
            "seven_day": {"utilization": 25.0, "resets_at": "2026-02-14T12:00:00+00:00"},
            "seven_day_oauth_apps": null,
            "seven_day_opus": null,
            "seven_day_sonnet": null,
            "seven_day_cowork": null,
            "iguana_necktie": null,
            "extra_usage": null
        }
        """

        let data = json.data(using: .utf8)!
        let usage = try decoder.decode(UsageData.self, from: data)

        XCTAssertEqual(usage.fiveHour.utilization, 50.0)
        XCTAssertEqual(usage.sevenDay.utilization, 25.0)
        XCTAssertNil(usage.sevenDaySonnet)
        XCTAssertNil(usage.sevenDayOpus)
        XCTAssertNil(usage.sevenDayOauthApps)
        XCTAssertNil(usage.sevenDayCowork)
        XCTAssertNil(usage.iguanaNecktie)
        XCTAssertNil(usage.extraUsage)
    }

    func testDecodeWithAllFieldsPresent() throws {
        let json = """
        {
            "five_hour": {"utilization": 80.0, "resets_at": "2026-02-08T18:00:00+00:00"},
            "seven_day": {"utilization": 60.0, "resets_at": "2026-02-14T18:00:00+00:00"},
            "seven_day_sonnet": {"utilization": 10.0, "resets_at": "2026-02-14T18:00:00+00:00"},
            "seven_day_opus": {"utilization": 5.0, "resets_at": "2026-02-14T18:00:00+00:00"},
            "seven_day_oauth_apps": {"utilization": 2.0, "resets_at": null},
            "seven_day_cowork": {"utilization": 3.0, "resets_at": null},
            "iguana_necktie": {"utilization": 0.0, "resets_at": null},
            "extra_usage": {"utilization": 1.0, "resets_at": null}
        }
        """

        let data = json.data(using: .utf8)!
        let usage = try decoder.decode(UsageData.self, from: data)

        XCTAssertEqual(usage.fiveHour.utilization, 80.0)
        XCTAssertEqual(usage.sevenDay.utilization, 60.0)
        XCTAssertEqual(usage.sevenDaySonnet?.utilization, 10.0)
        XCTAssertEqual(usage.sevenDayOpus?.utilization, 5.0)
        XCTAssertEqual(usage.sevenDayOauthApps?.utilization, 2.0)
        XCTAssertEqual(usage.sevenDayCowork?.utilization, 3.0)
        XCTAssertEqual(usage.iguanaNecktie?.utilization, 0.0)
        XCTAssertEqual(usage.extraUsage?.utilization, 1.0)
    }

    func testUtilizationValues() throws {
        let json = """
        {
            "five_hour": {"utilization": 17.0, "resets_at": "2026-02-08T18:59:59.661633+00:00"},
            "seven_day": {"utilization": 11.0, "resets_at": "2026-02-14T16:59:59.661657+00:00"},
            "seven_day_sonnet": {"utilization": 0.0, "resets_at": null},
            "seven_day_opus": null,
            "seven_day_oauth_apps": null,
            "seven_day_cowork": null,
            "iguana_necktie": null,
            "extra_usage": null
        }
        """

        let data = json.data(using: .utf8)!
        let usage = try decoder.decode(UsageData.self, from: data)

        XCTAssertEqual(usage.fiveHour.utilization, 17.0, accuracy: 0.001)
        XCTAssertEqual(usage.sevenDay.utilization, 11.0, accuracy: 0.001)
        XCTAssertEqual(usage.sevenDaySonnet!.utilization, 0.0, accuracy: 0.001)
    }
}

// MARK: - UsageService Tests

final class UsageServiceTests: XCTestCase {

    private var mockSession: URLSession!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        mockSession = URLSession(configuration: config)
        MockURLProtocol.reset()
    }

    override func tearDown() {
        mockSession = nil
        MockURLProtocol.reset()
        super.tearDown()
    }

    private let sampleJSON = """
    {
        "five_hour": {"utilization": 17.0, "resets_at": "2026-02-08T18:59:59.661633+00:00"},
        "seven_day": {"utilization": 11.0, "resets_at": "2026-02-14T16:59:59.661657+00:00"},
        "seven_day_oauth_apps": null,
        "seven_day_opus": null,
        "seven_day_sonnet": {"utilization": 0.0, "resets_at": null},
        "seven_day_cowork": null,
        "iguana_necktie": null,
        "extra_usage": null
    }
    """

    // MARK: - Request Construction

    func testRequestConstruction() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, self.sampleJSON.data(using: .utf8)!)
        }

        let service = UsageService(sessionKey: "sk-ant-test123", orgId: "org-abc", session: mockSession)
        _ = try await service.fetchUsage()

        let captured = MockURLProtocol.capturedRequest!
        XCTAssertEqual(captured.url?.absoluteString, "https://claude.ai/api/organizations/org-abc/usage")
        XCTAssertEqual(captured.httpMethod, "GET")
        XCTAssertEqual(captured.value(forHTTPHeaderField: "accept"), "*/*")
        XCTAssertEqual(captured.value(forHTTPHeaderField: "content-type"), "application/json")
        XCTAssertEqual(captured.value(forHTTPHeaderField: "anthropic-client-platform"), "web_claude_ai")
        XCTAssertEqual(captured.value(forHTTPHeaderField: "Cookie"), "sessionKey=sk-ant-test123")
    }

    // MARK: - JSON Decoding

    func testDecodesUsageDataFromMockResponse() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, self.sampleJSON.data(using: .utf8)!)
        }

        let service = UsageService(sessionKey: "sk-ant-test123", orgId: "org-abc", session: mockSession)
        let (usageData, newKey) = try await service.fetchUsage()

        XCTAssertEqual(usageData.fiveHour.utilization, 17.0, accuracy: 0.001)
        XCTAssertEqual(usageData.sevenDay.utilization, 11.0, accuracy: 0.001)
        XCTAssertNotNil(usageData.sevenDaySonnet)
        XCTAssertEqual(usageData.sevenDaySonnet?.utilization, 0.0)
        XCTAssertNil(usageData.sevenDayOpus)
        XCTAssertNil(newKey)
    }

    // MARK: - Set-Cookie Parsing

    func testSetCookieParsingExtractsNewSessionKey() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Set-Cookie": "sessionKey=sk-ant-new456; Path=/; HttpOnly; Secure"]
            )!
            return (response, self.sampleJSON.data(using: .utf8)!)
        }

        let service = UsageService(sessionKey: "sk-ant-old123", orgId: "org-abc", session: mockSession)
        let (_, newKey) = try await service.fetchUsage()

        XCTAssertEqual(newKey, "sk-ant-new456")
    }

    // MARK: - Auth Error Handling

    func testAuthError401() async {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 401,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data())
        }

        let service = UsageService(sessionKey: "expired-key", orgId: "org-abc", session: mockSession)

        do {
            _ = try await service.fetchUsage()
            XCTFail("Expected authError to be thrown")
        } catch let error as UsageServiceError {
            XCTAssertEqual(error, .authError(statusCode: 401))
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthError403() async {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 403,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data())
        }

        let service = UsageService(sessionKey: "forbidden-key", orgId: "org-abc", session: mockSession)

        do {
            _ = try await service.fetchUsage()
            XCTFail("Expected authError to be thrown")
        } catch let error as UsageServiceError {
            XCTAssertEqual(error, .authError(statusCode: 403))
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }
}

// MARK: - History Compaction Tests

final class HistoryCompactionTests: XCTestCase {

    private var store: HistoryStore!

    override func setUp() {
        super.setUp()
        store = HistoryStore()
    }

    override func tearDown() {
        store = nil
        super.tearDown()
    }

    private func makeSnapshot(hoursAgo: Double, session: Double = 50, weekly: Double = 30) -> UsageSnapshot {
        UsageSnapshot(
            timestamp: Date().addingTimeInterval(-hoursAgo * 3600),
            sessionUtilization: session,
            weeklyUtilization: weekly
        )
    }

    func testCompactKeepsRecentSnapshots() {
        // All snapshots < 24h old — all should be kept
        let snapshots = [
            makeSnapshot(hoursAgo: 1),
            makeSnapshot(hoursAgo: 5),
            makeSnapshot(hoursAgo: 12),
            makeSnapshot(hoursAgo: 23),
        ]

        let result = store.compact(snapshots)
        XCTAssertEqual(result.count, 4, "All recent snapshots should be preserved")
    }

    func testCompactDownsamplesMidRange() {
        // Two snapshots in the same hour, 2 days ago — only the one with higher sessionUtilization kept
        let baseTime = Date().addingTimeInterval(-48 * 3600) // 2 days ago
        let snap1 = UsageSnapshot(timestamp: baseTime, sessionUtilization: 40, weeklyUtilization: 20)
        let snap2 = UsageSnapshot(timestamp: baseTime.addingTimeInterval(300), sessionUtilization: 60, weeklyUtilization: 25)

        let result = store.compact([snap1, snap2])
        XCTAssertEqual(result.count, 1, "Two snapshots in same hour should be downsampled to 1")
        XCTAssertEqual(result[0].sessionUtilization, 60, "Should keep the snapshot with higher sessionUtilization")
    }

    func testCompactDeletesOldSnapshots() {
        // Snapshots 8 days ago — should be removed entirely
        let snapshots = [
            makeSnapshot(hoursAgo: 8 * 24),
            makeSnapshot(hoursAgo: 9 * 24),
            makeSnapshot(hoursAgo: 10 * 24),
        ]

        let result = store.compact(snapshots)
        XCTAssertEqual(result.count, 0, "Snapshots older than 7 days should be removed")
    }

    func testCompactMixedAges() {
        // Mix of recent, mid-range (same hour pair), and old
        let recent = makeSnapshot(hoursAgo: 2, session: 30)

        let midTime = Date().addingTimeInterval(-3 * 24 * 3600) // 3 days ago
        let mid1 = UsageSnapshot(timestamp: midTime, sessionUtilization: 20, weeklyUtilization: 10)
        let mid2 = UsageSnapshot(timestamp: midTime.addingTimeInterval(120), sessionUtilization: 50, weeklyUtilization: 15)

        let old = makeSnapshot(hoursAgo: 8 * 24, session: 90)

        let result = store.compact([old, mid1, mid2, recent])

        // Expect: 1 recent + 1 mid-range (downsampled from 2) + 0 old = 2
        XCTAssertEqual(result.count, 2, "Should keep recent + downsampled mid-range, drop old")

        // Verify order: mid-range first (3 days ago), then recent (2 hours ago)
        XCTAssertTrue(result[0].timestamp < result[1].timestamp, "Results should be sorted by timestamp")

        // The mid-range survivor should be the one with higher sessionUtilization
        XCTAssertEqual(result[0].sessionUtilization, 50, "Mid-range should keep higher sessionUtilization snapshot")
    }
}

// MARK: - Pace Status Tests

final class PaceStatusTests: XCTestCase {

    private func makeViewModel() -> UsageViewModel {
        // Use a unique suite name so tests don't interfere with each other or the real app
        let suiteName = "com.claudeusage.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        // AccountStore reads from standard UserDefaults; creating it is acceptable in tests
        let store = AccountStore()
        return UsageViewModel(accountStore: store)
    }

    private func usageData(sessionUtil: Double, sessionResetsAt: Date?,
                           weeklyUtil: Double = 30, weeklyResetsAt: Date? = nil) -> UsageData {
        UsageData(
            fiveHour: UsageLimit(utilization: sessionUtil, resetsAt: sessionResetsAt),
            sevenDay: UsageLimit(utilization: weeklyUtil, resetsAt: weeklyResetsAt),
            sevenDaySonnet: nil,
            sevenDayOpus: nil,
            sevenDayOauthApps: nil,
            sevenDayCowork: nil,
            iguanaNecktie: nil,
            extraUsageRaw: nil
        )
    }

    // MARK: - Session Pace Tests

    func testSessionPaceStatusLimitHit() {
        let vm = makeViewModel()
        // utilization=100 → .limitHit regardless of time
        vm.usageData = usageData(sessionUtil: 100, sessionResetsAt: Date().addingTimeInterval(3600))
        XCTAssertEqual(vm.sessionPaceStatus, .limitHit)
    }

    func testSessionPaceStatusFallbackBeforeStability() {
        let vm = makeViewModel()
        // Within first 15 min of session: resetsAt = now + 4h50m → elapsed = 10min < 15min guard
        // Falls back to raw thresholds: >=80 → .critical
        let resetsAt = Date().addingTimeInterval(4 * 3600 + 50 * 60) // 4h50m from now
        vm.usageData = usageData(sessionUtil: 85, sessionResetsAt: resetsAt)
        XCTAssertEqual(vm.sessionPaceStatus, .critical, "Before stability window, >=80 should be .critical")
    }

    func testSessionPaceStatusFallbackWarning() {
        let vm = makeViewModel()
        // Within first 15 min, utilization=65 → falls back to >=60 → .warning
        let resetsAt = Date().addingTimeInterval(4 * 3600 + 50 * 60)
        vm.usageData = usageData(sessionUtil: 65, sessionResetsAt: resetsAt)
        XCTAssertEqual(vm.sessionPaceStatus, .warning, "Before stability window, >=60 should be .warning")
    }

    func testSessionPaceStatusOnTrack() {
        let vm = makeViewModel()
        // Set up so ratio ≈ 1.0: elapsed=2.5h, remaining=2.5h → expected=50%, actual=50%
        let resetsAt = Date().addingTimeInterval(2.5 * 3600) // 2.5h remaining
        vm.usageData = usageData(sessionUtil: 50, sessionResetsAt: resetsAt)
        XCTAssertEqual(vm.sessionPaceStatus, .onTrack)
    }

    func testSessionPaceStatusCritical() {
        let vm = makeViewModel()
        // Set up ratio > 1.4: elapsed=2.5h → expected=50%, actual=80% → ratio=1.6
        let resetsAt = Date().addingTimeInterval(2.5 * 3600)
        vm.usageData = usageData(sessionUtil: 80, sessionResetsAt: resetsAt)
        XCTAssertEqual(vm.sessionPaceStatus, .critical)
    }

    // MARK: - Weekly Pace Tests

    func testWeeklyPaceStatusBehindPaceInPaceAwareMode() {
        let vm = makeViewModel()
        vm.weeklyColorMode = .paceAware

        // Set up ratio < 0.85: 3.5 days elapsed → expected=50%, actual=35% → ratio=0.7
        let resetsAt = Date().addingTimeInterval(3.5 * 86400) // 3.5 days remaining
        vm.usageData = usageData(sessionUtil: 20, sessionResetsAt: nil,
                                 weeklyUtil: 35, weeklyResetsAt: resetsAt)
        XCTAssertEqual(vm.paceStatus, .behindPace)
    }

    func testWeeklyPaceStatusOnTrackWhenNotPaceAware() {
        let vm = makeViewModel()
        vm.weeklyColorMode = .rawPercentage

        // Same ratio < 0.85, but rawPercentage mode should NOT flag behind-pace
        let resetsAt = Date().addingTimeInterval(3.5 * 86400)
        vm.usageData = usageData(sessionUtil: 20, sessionResetsAt: nil,
                                 weeklyUtil: 30, weeklyResetsAt: resetsAt)
        XCTAssertEqual(vm.paceStatus, .onTrack, "Behind-pace should not trigger in rawPercentage mode")
    }
}

// MARK: - Provider Shell Tests

final class ProviderShellTests: XCTestCase {

    private func makeClaudeUsage(session: Double, weekly: Double) -> UsageData {
        UsageData(
            fiveHour: UsageLimit(
                utilization: session,
                resetsAt: Date(timeIntervalSince1970: 1_800_000_000)
            ),
            sevenDay: UsageLimit(
                utilization: weekly,
                resetsAt: Date(timeIntervalSince1970: 1_800_432_000)
            ),
            sevenDaySonnet: nil,
            sevenDayOpus: nil,
            sevenDayOauthApps: nil,
            sevenDayCowork: nil,
            iguanaNecktie: nil,
            extraUsageRaw: nil
        )
    }

    func testAggregatesProviderStatesForConfiguredMissingAndDegradedCards() {
        let coordinator = ProviderCoordinator()
        let shellState = coordinator.makeShellState(
            providers: [
                ProviderSnapshot.claude(
                    usage: makeClaudeUsage(session: 42, weekly: 28),
                    authStatus: .connected,
                    isEnabled: true
                ),
                ProviderSnapshot.codex(
                    status: .missingConfiguration,
                    isEnabled: true
                ),
                ProviderSnapshot.gemini(
                    status: .degraded(reason: "Install not detected"),
                    isEnabled: true
                ),
            ],
            now: Date(timeIntervalSince1970: 1_700_000_000)
        )

        XCTAssertEqual(shellState.providers.map(\.id), [.claude, .codex, .gemini])
        XCTAssertEqual(shellState.providers[0].cardState, .configured)
        XCTAssertEqual(shellState.providers[1].cardState, .missingConfiguration)
        XCTAssertEqual(shellState.providers[2].cardState, .degraded)
        XCTAssertEqual(shellState.providers[0].headline, "Claude 42% session")
        XCTAssertEqual(shellState.providers[2].detailText, "Install not detected")
    }

    func testTraySelectionRotatesAcrossEnabledProvidersWhenNoOverrideOrPin() {
        let coordinator = ProviderCoordinator(
            trayPolicy: ProviderTrayPolicy(rotationInterval: 300)
        )
        let providers = [
            ProviderSnapshot.claude(status: .configured, isEnabled: true),
            ProviderSnapshot.codex(status: .configured, isEnabled: true),
            ProviderSnapshot.gemini(status: .configured, isEnabled: false),
        ]

        let firstSelection = coordinator.selectedTrayProvider(
            from: providers,
            now: Date(timeIntervalSince1970: 0)
        )
        let secondSelection = coordinator.selectedTrayProvider(
            from: providers,
            now: Date(timeIntervalSince1970: 301)
        )

        XCTAssertEqual(firstSelection?.id, .claude)
        XCTAssertEqual(secondSelection?.id, .codex)
    }

    func testManualOverrideBeatsRotationUntilCleared() {
        let coordinator = ProviderCoordinator(
            trayPolicy: ProviderTrayPolicy(
                rotationInterval: 300,
                manualOverride: .gemini
            )
        )
        let providers = [
            ProviderSnapshot.claude(status: .configured, isEnabled: true),
            ProviderSnapshot.codex(status: .configured, isEnabled: true),
            ProviderSnapshot.gemini(status: .configured, isEnabled: true),
        ]

        let selection = coordinator.selectedTrayProvider(
            from: providers,
            now: Date(timeIntervalSince1970: 601)
        )

        XCTAssertEqual(selection?.id, .gemini)
    }

    func testPinnedProviderWinsOverRotationAndManualOverride() {
        let coordinator = ProviderCoordinator(
            trayPolicy: ProviderTrayPolicy(
                rotationInterval: 300,
                manualOverride: .gemini,
                pinnedProvider: .codex
            )
        )
        let providers = [
            ProviderSnapshot.claude(status: .configured, isEnabled: true),
            ProviderSnapshot.codex(status: .configured, isEnabled: true),
            ProviderSnapshot.gemini(status: .configured, isEnabled: true),
        ]

        let selection = coordinator.selectedTrayProvider(
            from: providers,
            now: Date(timeIntervalSince1970: 601)
        )

        XCTAssertEqual(selection?.id, .codex)
    }

    func testClaudeSnapshotPreservesExistingUsageViewModelOutput() throws {
        let coordinator = ProviderCoordinator()
        let usage = makeClaudeUsage(session: 64, weekly: 37)

        let shellState = coordinator.makeShellState(
            providers: [
                ProviderSnapshot.claude(
                    usage: usage,
                    authStatus: .connected,
                    isEnabled: true
                )
            ],
            now: Date(timeIntervalSince1970: 1_700_000_000)
        )

        let claude = try XCTUnwrap(shellState.providers.first)
        XCTAssertEqual(claude.id, .claude)
        XCTAssertEqual(claude.cardState, .configured)
        XCTAssertEqual(claude.sessionUtilization, usage.fiveHour.utilization)
        XCTAssertEqual(claude.weeklyUtilization, usage.sevenDay.utilization)
        XCTAssertEqual(shellState.trayProvider?.id, .claude)
    }
}

// MARK: - GitHub Service Tests

final class GitHubServiceTests: XCTestCase {

    private var mockSession: URLSession!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        mockSession = URLSession(configuration: config)
        MockURLProtocol.reset()
    }

    override func tearDown() {
        mockSession = nil
        MockURLProtocol.reset()
        super.tearDown()
    }

    func testGraphQLUsesVariablesNotInterpolation() async throws {
        // Return a valid-shaped response so the service proceeds to the point where we can inspect the request
        let responseJSON = """
        {
            "data": {
                "user": {
                    "contributionsCollection": {
                        "contributionCalendar": {
                            "totalContributions": 42,
                            "weeks": []
                        }
                    }
                }
            }
        }
        """

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, responseJSON.data(using: .utf8)!)
        }

        let service = GitHubService(token: "ghp_test", username: "octocat", session: mockSession)
        _ = try await service.fetchContributions()

        // Inspect the captured request body
        let captured = MockURLProtocol.capturedRequest!
        let bodyData = MockURLProtocol.capturedBody!
        let bodyJSON = try JSONSerialization.jsonObject(with: bodyData) as! [String: Any]

        // Verify variables contain the username (parameterized, not interpolated into query)
        let variables = bodyJSON["variables"] as! [String: Any]
        XCTAssertEqual(variables["login"] as? String, "octocat", "Username should be passed via variables")

        // Verify the query string uses $login placeholder, NOT the literal username
        let query = bodyJSON["query"] as! String
        XCTAssertTrue(query.contains("$login"), "Query should use $login variable placeholder")
        XCTAssertFalse(query.contains("octocat"), "Query should not contain interpolated username")
    }

    func testGraphQLErrorResponseThrowsInvalidResponse() async {
        let errorJSON = """
        {
            "data": {
                "user": {
                    "contributionsCollection": {
                        "contributionCalendar": {
                            "totalContributions": 0,
                            "weeks": []
                        }
                    }
                }
            },
            "errors": [{"message": "Something went wrong"}]
        }
        """

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, errorJSON.data(using: .utf8)!)
        }

        let service = GitHubService(token: "ghp_test", username: "octocat", session: mockSession)

        do {
            _ = try await service.fetchContributions()
            XCTFail("Expected invalidResponse error")
        } catch let error as GitHubServiceError {
            if case .invalidResponse = error {
                // Expected
            } else {
                XCTFail("Expected .invalidResponse, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthErrorOn401() async {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            return (response, Data())
        }

        let service = GitHubService(token: "ghp_expired", username: "octocat", session: mockSession)

        do {
            _ = try await service.fetchContributions()
            XCTFail("Expected authError")
        } catch let error as GitHubServiceError {
            if case .authError = error {
                // Expected
            } else {
                XCTFail("Expected .authError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }
}

// MARK: - Account Migration Tests

final class AccountMigrationTests: XCTestCase {

    private let accountsKey = "claude_accounts_metadata"
    private let activeAccountKey = "claude_active_account_id"

    override func tearDown() {
        // Clean up UserDefaults to avoid polluting other tests
        UserDefaults.standard.removeObject(forKey: accountsKey)
        UserDefaults.standard.removeObject(forKey: activeAccountKey)
        UserDefaults.standard.removeObject(forKey: "claude_org_id")
        super.tearDown()
    }

    func testMigrationCreatesAccountFromOldCredentials() {
        // Clear any existing accounts so migration can trigger
        UserDefaults.standard.removeObject(forKey: accountsKey)
        UserDefaults.standard.removeObject(forKey: activeAccountKey)

        // Write old-style orgId to UserDefaults (mimics pre-migration single-account setup)
        // KeychainService stores orgId in UserDefaults under "claude_org_id"
        UserDefaults.standard.set("org-legacy-123", forKey: "claude_org_id")

        // Creating AccountStore triggers init() → migrateIfNeeded()
        let store = AccountStore()

        // Migration should have created one account from old credentials
        XCTAssertEqual(store.accounts.count, 1, "Migration should create one account from old credentials")
        XCTAssertNotNil(store.activeAccountId, "Migration should set the new account as active")
        XCTAssertEqual(store.accounts.first?.email, "Account 1", "Migrated account should have default email")
    }

    func testMigrationSkippedWhenAccountsExist() {
        // Pre-populate accounts metadata in UserDefaults
        let existingId = UUID()
        let metadata = [["id": existingId.uuidString, "email": "existing@test.com"]]
        let data = try! JSONEncoder().encode(metadata.map { dict in
            return AccountMetadataHelper(id: UUID(uuidString: dict["id"]!)!, email: dict["email"]!)
        })
        UserDefaults.standard.set(data, forKey: accountsKey)
        UserDefaults.standard.set(existingId.uuidString, forKey: activeAccountKey)

        // Also set old-style credentials that would trigger migration if accounts were empty
        UserDefaults.standard.set("org-should-not-migrate", forKey: "claude_org_id")

        let store = AccountStore()

        // Migration should NOT have run — accounts array should only have the pre-existing one
        XCTAssertEqual(store.accounts.count, 1, "Migration should not add accounts when accounts already exist")
        XCTAssertEqual(store.accounts.first?.email, "existing@test.com", "Existing account should be preserved")
    }
}

/// Helper to encode test account metadata in the same format AccountStore expects.
private struct AccountMetadataHelper: Codable {
    let id: UUID
    let email: String
}
