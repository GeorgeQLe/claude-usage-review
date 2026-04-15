import XCTest
@testable import ClaudeUsage

// MARK: - GeminiDetectionTests

final class GeminiDetectionTests: XCTestCase {
    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("gemini-detect-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testDetectsInstalledWhenSettingsJsonExists() {
        // settings.json present → .installed
        let settingsFile = tempDir.appendingPathComponent("settings.json")
        let settingsJSON = """
        {"security":{"auth":{"selectedType":"oauth-personal"}}}
        """
        fileManager.createFile(atPath: settingsFile.path, contents: Data(settingsJSON.utf8))

        let detector = GeminiDetector(geminiHome: tempDir, fileManager: fileManager)
        let result = detector.detect()

        XCTAssertEqual(result.installStatus, .installed)
    }

    func testDetectsNotInstalledWhenDirectoryMissing() {
        // Point at a non-existent directory → .notInstalled
        let missingDir = tempDir.appendingPathComponent("nonexistent")

        let detector = GeminiDetector(geminiHome: missingDir, fileManager: fileManager)
        let result = detector.detect()

        XCTAssertEqual(result.installStatus, .notInstalled)
    }

    func testDetectsOAuthAuthWhenOAuthCredsExist() {
        // settings.json with oauth-personal + oauth_creds.json → .authenticated(mode: .oauthPersonal)
        let settingsFile = tempDir.appendingPathComponent("settings.json")
        let settingsJSON = """
        {"security":{"auth":{"selectedType":"oauth-personal"}}}
        """
        fileManager.createFile(atPath: settingsFile.path, contents: Data(settingsJSON.utf8))

        let credsFile = tempDir.appendingPathComponent("oauth_creds.json")
        let credsJSON = """
        {"access_token":"test","refresh_token":"test","expiry":"2026-12-01T00:00:00Z"}
        """
        fileManager.createFile(atPath: credsFile.path, contents: Data(credsJSON.utf8))

        let detector = GeminiDetector(geminiHome: tempDir, fileManager: fileManager)
        let result = detector.detect()

        XCTAssertEqual(result.authStatus, .authenticated(mode: .oauthPersonal))
    }

    func testDetectsAuthAbsentWhenNoCredsFile() {
        // settings.json exists but no oauth_creds.json → .authAbsent
        let settingsFile = tempDir.appendingPathComponent("settings.json")
        let settingsJSON = """
        {"security":{"auth":{"selectedType":"oauth-personal"}}}
        """
        fileManager.createFile(atPath: settingsFile.path, contents: Data(settingsJSON.utf8))

        let detector = GeminiDetector(geminiHome: tempDir, fileManager: fileManager)
        let result = detector.detect()

        XCTAssertEqual(result.authStatus, .authAbsent)
    }
}

// MARK: - GeminiActivityParsingTests

final class GeminiActivityParsingTests: XCTestCase {
    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("gemini-activity-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testParsesSessionFileExtractsMessageTimestamps() throws {
        // One session file with 3 gemini messages → 3 GeminiRequestEvent records
        let projectDir = tempDir.appendingPathComponent("tmp/abc123/chats")
        try fileManager.createDirectory(at: projectDir, withIntermediateDirectories: true)

        let sessionJSON = """
        {
          "sessionId": "test-session-1",
          "messages": [
            {"id":"m1","timestamp":"2026-04-09T10:00:05Z","type":"user","content":"hello"},
            {"id":"m2","timestamp":"2026-04-09T10:00:15Z","type":"gemini","content":"response1",
             "tokens":{"input":100,"output":50,"total":150},"model":"gemini-2.5-flash"},
            {"id":"m3","timestamp":"2026-04-09T10:01:00Z","type":"user","content":"follow up"},
            {"id":"m4","timestamp":"2026-04-09T10:01:10Z","type":"gemini","content":"response2",
             "tokens":{"input":120,"output":60,"total":180},"model":"gemini-2.5-flash"},
            {"id":"m5","timestamp":"2026-04-09T10:02:00Z","type":"gemini","content":"response3",
             "tokens":{"input":80,"output":40,"total":120},"model":"gemini-2.5-flash"}
          ]
        }
        """
        let sessionFile = projectDir.appendingPathComponent("session-001.json")
        try sessionJSON.write(to: sessionFile, atomically: true, encoding: .utf8)

        let parser = GeminiActivityParser(geminiHome: tempDir, fileManager: fileManager)
        let events = parser.parseSessionFiles()

        XCTAssertEqual(events.count, 3, "Should extract 3 gemini message events")
    }

    func testParsesMultipleSessionFilesAcrossProjectHashes() throws {
        // Two project hash dirs, each with a session → parser finds all events
        let proj1 = tempDir.appendingPathComponent("tmp/hash111/chats")
        let proj2 = tempDir.appendingPathComponent("tmp/hash222/chats")
        try fileManager.createDirectory(at: proj1, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: proj2, withIntermediateDirectories: true)

        let sessionTemplate = """
        {
          "sessionId": "s-%@",
          "messages": [
            {"id":"m1","timestamp":"2026-04-09T10:00:15Z","type":"gemini","content":"resp",
             "tokens":{"input":50,"output":25,"total":75},"model":"gemini-2.5-flash"}
          ]
        }
        """
        let s1 = proj1.appendingPathComponent("session-001.json")
        try String(format: sessionTemplate, "1").write(to: s1, atomically: true, encoding: .utf8)

        let s2 = proj2.appendingPathComponent("session-002.json")
        try String(format: sessionTemplate, "2").write(to: s2, atomically: true, encoding: .utf8)

        let parser = GeminiActivityParser(geminiHome: tempDir, fileManager: fileManager)
        let events = parser.parseSessionFiles()

        XCTAssertEqual(events.count, 2, "Should find events across both project hashes")
    }

    func testExtractsTokenUsageFromGeminiMessages() throws {
        let projectDir = tempDir.appendingPathComponent("tmp/toktest/chats")
        try fileManager.createDirectory(at: projectDir, withIntermediateDirectories: true)

        let sessionJSON = """
        {
          "sessionId": "tok-session",
          "messages": [
            {"id":"m1","timestamp":"2026-04-09T10:00:15Z","type":"gemini","content":"resp",
             "tokens":{"input":200,"output":100,"total":300},"model":"gemini-2.5-pro"}
          ]
        }
        """
        let sessionFile = projectDir.appendingPathComponent("session-001.json")
        try sessionJSON.write(to: sessionFile, atomically: true, encoding: .utf8)

        let parser = GeminiActivityParser(geminiHome: tempDir, fileManager: fileManager)
        let events = parser.parseSessionFiles()

        XCTAssertEqual(events.count, 1)
        let event = events[0]
        XCTAssertEqual(event.inputTokens, 200)
        XCTAssertEqual(event.outputTokens, 100)
        XCTAssertEqual(event.totalTokens, 300)
    }

    func testExtractsModelFromGeminiMessages() throws {
        let projectDir = tempDir.appendingPathComponent("tmp/modeltest/chats")
        try fileManager.createDirectory(at: projectDir, withIntermediateDirectories: true)

        let sessionJSON = """
        {
          "sessionId": "model-session",
          "messages": [
            {"id":"m1","timestamp":"2026-04-09T10:00:15Z","type":"gemini","content":"resp",
             "tokens":{"input":50,"output":25,"total":75},"model":"gemini-2.5-flash"}
          ]
        }
        """
        let sessionFile = projectDir.appendingPathComponent("session-001.json")
        try sessionJSON.write(to: sessionFile, atomically: true, encoding: .utf8)

        let parser = GeminiActivityParser(geminiHome: tempDir, fileManager: fileManager)
        let events = parser.parseSessionFiles()

        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].model, "gemini-2.5-flash")
    }

    func testSkipsCorruptSessionFiles() throws {
        let projectDir = tempDir.appendingPathComponent("tmp/corrupt/chats")
        try fileManager.createDirectory(at: projectDir, withIntermediateDirectories: true)

        // Valid session
        let validJSON = """
        {
          "sessionId": "valid",
          "messages": [
            {"id":"m1","timestamp":"2026-04-09T10:00:15Z","type":"gemini","content":"resp",
             "tokens":{"input":50,"output":25,"total":75},"model":"gemini-2.5-flash"}
          ]
        }
        """
        let validFile = projectDir.appendingPathComponent("session-001.json")
        try validJSON.write(to: validFile, atomically: true, encoding: .utf8)

        // Corrupt session
        let corruptFile = projectDir.appendingPathComponent("session-002.json")
        try "{{not valid json at all".write(to: corruptFile, atomically: true, encoding: .utf8)

        let parser = GeminiActivityParser(geminiHome: tempDir, fileManager: fileManager)
        let events = parser.parseSessionFiles()

        XCTAssertEqual(events.count, 1, "Should only parse the valid session file")
    }
}

// MARK: - GeminiRatePressureTests

final class GeminiRatePressureTests: XCTestCase {

    func testDailyRequestCountSumsEventsInLast24Hours() {
        let now = Date()
        let events: [GeminiRequestEvent] = [
            // 36 hours ago — outside window
            GeminiRequestEvent(timestamp: now.addingTimeInterval(-36 * 3600),
                               inputTokens: 10, outputTokens: 5, totalTokens: 15, model: "gemini-2.5-flash"),
            // 12 hours ago — inside window
            GeminiRequestEvent(timestamp: now.addingTimeInterval(-12 * 3600),
                               inputTokens: 10, outputTokens: 5, totalTokens: 15, model: "gemini-2.5-flash"),
            // 1 hour ago — inside window
            GeminiRequestEvent(timestamp: now.addingTimeInterval(-1 * 3600),
                               inputTokens: 10, outputTokens: 5, totalTokens: 15, model: "gemini-2.5-flash"),
        ]

        let pressure = GeminiRatePressure(events: events, now: now)
        XCTAssertEqual(pressure.dailyRequestCount, 2, "Should only count events within last 24h")
    }

    func testRequestsPerMinuteOverSlidingWindow() {
        let now = Date()
        // 10 events spread over 5 minutes
        let events = (0..<10).map { i in
            GeminiRequestEvent(
                timestamp: now.addingTimeInterval(-Double(i) * 30), // every 30s over 5min
                inputTokens: 10, outputTokens: 5, totalTokens: 15, model: "gemini-2.5-flash"
            )
        }

        let pressure = GeminiRatePressure(events: events, now: now)
        XCTAssertEqual(pressure.requestsPerMinute, 2.0, accuracy: 0.1,
                       "10 events in 5 min = 2.0 RPM")
    }

    func testDailyHeadroomCalculatedAgainstPlanQuota() {
        let now = Date()
        // 400 events today
        let events = (0..<400).map { i in
            GeminiRequestEvent(
                timestamp: now.addingTimeInterval(-Double(i) * 60),
                inputTokens: 10, outputTokens: 5, totalTokens: 15, model: "gemini-2.5-flash"
            )
        }

        let plan = GeminiPlanProfile(name: "personal", dailyRequestLimit: 1000, requestsPerMinuteLimit: 60)
        let pressure = GeminiRatePressure(events: events, plan: plan, now: now)

        XCTAssertEqual(pressure.remainingDailyHeadroom, 600)
    }

    func testHeadroomNilWhenNoPlanProfile() {
        let now = Date()
        let events = [
            GeminiRequestEvent(timestamp: now.addingTimeInterval(-60),
                               inputTokens: 10, outputTokens: 5, totalTokens: 15, model: "gemini-2.5-flash"),
        ]

        let pressure = GeminiRatePressure(events: events, now: now)
        XCTAssertNil(pressure.remainingDailyHeadroom, "Headroom should be nil without a plan")
    }
}

// MARK: - GeminiConfidenceTests

final class GeminiConfidenceTests: XCTestCase {

    func testObservedOnlyWhenAuthDetectedButNoSessions() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authenticated(mode: .oauthPersonal)
        )
        let events: [GeminiRequestEvent] = []

        let engine = GeminiConfidenceEngine()
        let estimate = engine.evaluate(detection: detection, events: events, plan: nil)

        XCTAssertEqual(estimate.confidence, .observedOnly)
    }

    func testEstimatedWhenAuthModeKnownButCountingIncomplete() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authenticated(mode: .oauthPersonal)
        )
        let events = [
            GeminiRequestEvent(timestamp: Date(), inputTokens: 50, outputTokens: 25,
                               totalTokens: 75, model: "gemini-2.5-flash"),
        ]

        let engine = GeminiConfidenceEngine()
        let estimate = engine.evaluate(detection: detection, events: events, plan: nil)

        XCTAssertEqual(estimate.confidence, .estimated)
    }

    func testHighConfidenceWhenKnownAuthModeWithPlanAndActivity() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authenticated(mode: .oauthPersonal)
        )
        let events = [
            GeminiRequestEvent(timestamp: Date(), inputTokens: 50, outputTokens: 25,
                               totalTokens: 75, model: "gemini-2.5-flash"),
        ]
        let plan = GeminiPlanProfile(name: "personal", dailyRequestLimit: 1000, requestsPerMinuteLimit: 60)

        let engine = GeminiConfidenceEngine()
        let estimate = engine.evaluate(detection: detection, events: events, plan: plan)

        XCTAssertEqual(estimate.confidence, .highConfidence)
    }

    func testNeverClaimsExactForPassiveMode() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authenticated(mode: .oauthPersonal)
        )
        let events = [
            GeminiRequestEvent(timestamp: Date(), inputTokens: 50, outputTokens: 25,
                               totalTokens: 75, model: "gemini-2.5-flash"),
        ]
        let plan = GeminiPlanProfile(name: "personal", dailyRequestLimit: 1000, requestsPerMinuteLimit: 60)

        let engine = GeminiConfidenceEngine()
        let estimate = engine.evaluate(detection: detection, events: events, plan: plan)

        XCTAssertNotEqual(estimate.confidence, .exact,
                          "Passive adapter should never claim .exact confidence")
    }
}

// MARK: - GeminiSettingsTests

final class GeminiSettingsTests: XCTestCase {
    private let settingsKeys = [
        "provider_gemini_plan",
        "provider_gemini_plan_daily_limit",
        "provider_gemini_plan_rpm_limit",
        "provider_gemini_auth_mode",
    ]

    override func setUp() {
        super.setUp()
        clearSettings()
    }

    override func tearDown() {
        clearSettings()
        super.tearDown()
    }

    func testGeminiPlanPresetsCanBeLookedUpBySettingsName() {
        let personal = GeminiPlanProfile.preset(named: "Personal")
        let apiKey = GeminiPlanProfile.preset(named: "API Key")

        XCTAssertEqual(personal?.dailyRequestLimit, 1000)
        XCTAssertEqual(personal?.requestsPerMinuteLimit, 60)
        XCTAssertEqual(apiKey?.name, "API Key")
    }

    func testProviderSettingsStorePersistsGeminiPlanAndAuthMode() {
        let store = ProviderSettingsStore()

        store.setGeminiPlan(GeminiPlanProfile.preset(named: "Personal"))
        store.setGeminiAuthMode(.vertexAI)

        let reloadedStore = ProviderSettingsStore()
        XCTAssertEqual(reloadedStore.geminiPlan(), GeminiPlanProfile.preset(named: "Personal"))
        XCTAssertEqual(reloadedStore.geminiAuthMode(), .vertexAI)
    }

    func testConfirmedAuthModeOverridesPassiveDetectionForEstimate() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authAbsent
        )
        let events = [
            GeminiRequestEvent(timestamp: Date(), inputTokens: 50, outputTokens: 25,
                               totalTokens: 75, model: "gemini-2.5-flash"),
        ]

        let estimate = GeminiConfidenceEngine().evaluate(
            detection: detection,
            events: events,
            plan: GeminiPlanProfile.preset(named: "Personal"),
            confirmedAuthMode: .apiKey
        )

        XCTAssertEqual(estimate.authMode, .apiKey)
        XCTAssertEqual(estimate.confidence, .highConfidence)
        XCTAssertNotNil(estimate.ratePressure?.remainingDailyHeadroom)
    }

    func testAdapterRefreshUsesConfirmedAuthModeAndPlan() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("gemini-settings-adapter-\(UUID().uuidString)")
        let ledgerDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("gemini-settings-ledger-\(UUID().uuidString)")
        defer {
            try? FileManager.default.removeItem(at: tempDir)
            try? FileManager.default.removeItem(at: ledgerDir)
        }

        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(
            at: tempDir.appendingPathComponent("tmp/project/chats"),
            withIntermediateDirectories: true
        )
        try """
        {"security":{"auth":{"selectedType":"api-key"}}}
        """.write(to: tempDir.appendingPathComponent("settings.json"), atomically: true, encoding: .utf8)
        try """
        {
          "sessionId": "settings",
          "messages": [
            {"id":"m1","timestamp":"2026-04-09T10:00:15Z","type":"gemini","content":"resp",
             "tokens":{"input":50,"output":25,"total":75},"model":"gemini-2.5-flash"}
          ]
        }
        """.write(
            to: tempDir.appendingPathComponent("tmp/project/chats/session-001.json"),
            atomically: true,
            encoding: .utf8
        )

        let adapter = GeminiAdapter(
            geminiHome: tempDir,
            planProfile: GeminiPlanProfile.preset(named: "Personal"),
            confirmedAuthMode: .apiKey,
            ledgerDirectory: ledgerDir
        )
        adapter.refresh()

        guard case let .installed(estimate) = adapter.state else {
            return XCTFail("Expected installed Gemini adapter state")
        }
        XCTAssertEqual(estimate.authMode, .apiKey)
        XCTAssertEqual(estimate.confidence, .highConfidence)
    }

    private func clearSettings() {
        for key in settingsKeys {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
}
