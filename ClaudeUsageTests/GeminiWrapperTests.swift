import XCTest
@testable import ClaudeUsage

// MARK: - Gemini Wrapper Event Tests

final class GeminiWrapperEventTests: XCTestCase {

    func testInvocationEventCapturesStartEndTimestamps() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let end = Date(timeIntervalSince1970: 1_700_000_045)

        let event = GeminiInvocationEvent(
            startTime: start,
            endTime: end,
            commandMode: "chat",
            model: "gemini-2.5-flash",
            limitHitDetected: false
        )

        XCTAssertEqual(event.duration, 45, accuracy: 0.001)
    }

    func testInvocationEventRecordsCommandModeAndModel() {
        let event = GeminiInvocationEvent(
            startTime: Date(),
            endTime: Date(),
            commandMode: "chat",
            model: "gemini-2.5-flash",
            limitHitDetected: false
        )

        XCTAssertEqual(event.commandMode, "chat")
        XCTAssertEqual(event.model, "gemini-2.5-flash")
    }

    func testInvocationEventRecordsLimitHitDetection() {
        let event = GeminiInvocationEvent(
            startTime: Date(),
            endTime: Date(),
            commandMode: "generate",
            model: "gemini-2.5-pro",
            limitHitDetected: true
        )

        XCTAssertTrue(event.limitHitDetected)
    }
}

// MARK: - Gemini Event Ledger Tests

final class GeminiEventLedgerTests: XCTestCase {

    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("gemini-ledger-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testAppendEventWritesJSONLLine() throws {
        let ledger = GeminiEventLedger(directory: tempDir)
        let event = GeminiInvocationEvent(
            startTime: Date(timeIntervalSince1970: 1_700_000_000),
            endTime: Date(timeIntervalSince1970: 1_700_000_030),
            commandMode: "chat",
            model: "gemini-2.5-flash",
            limitHitDetected: false
        )

        try ledger.append(event)

        let fileURL = tempDir.appendingPathComponent("gemini-events.jsonl")
        XCTAssertTrue(fileManager.fileExists(atPath: fileURL.path))

        let contents = try String(contentsOf: fileURL, encoding: .utf8)
        let lines = contents.split(separator: "\n")
        XCTAssertEqual(lines.count, 1)
    }

    func testReadEventsReturnsAllAppendedEvents() throws {
        let ledger = GeminiEventLedger(directory: tempDir)
        let base = Date(timeIntervalSince1970: 1_700_000_000)

        for i in 0..<3 {
            let event = GeminiInvocationEvent(
                startTime: base.addingTimeInterval(Double(i * 60)),
                endTime: base.addingTimeInterval(Double(i * 60 + 30)),
                commandMode: "chat",
                model: "gemini-2.5-flash",
                limitHitDetected: false
            )
            try ledger.append(event)
        }

        let events = try ledger.readEvents()
        XCTAssertEqual(events.count, 3)
        // Verify order: first event has earliest startTime
        XCTAssertTrue(events[0].startTime < events[1].startTime)
        XCTAssertTrue(events[1].startTime < events[2].startTime)
    }

    func testRollingWindowTrimRemovesOldEvents() throws {
        let ledger = GeminiEventLedger(directory: tempDir)
        let now = Date()

        // Old event: 48 hours ago
        let oldEvent = GeminiInvocationEvent(
            startTime: now.addingTimeInterval(-48 * 3600),
            endTime: now.addingTimeInterval(-48 * 3600 + 30),
            commandMode: "chat",
            model: "gemini-2.5-flash",
            limitHitDetected: false
        )
        try ledger.append(oldEvent)

        // Recent event: 1 hour ago
        let recentEvent = GeminiInvocationEvent(
            startTime: now.addingTimeInterval(-3600),
            endTime: now.addingTimeInterval(-3600 + 30),
            commandMode: "chat",
            model: "gemini-2.5-flash",
            limitHitDetected: false
        )
        try ledger.append(recentEvent)

        try ledger.trim(retaining: 86400) // Keep last 24 hours

        let remaining = try ledger.readEvents()
        XCTAssertEqual(remaining.count, 1)
        XCTAssertEqual(remaining[0].startTime.timeIntervalSince1970,
                       recentEvent.startTime.timeIntervalSince1970,
                       accuracy: 1.0)
    }

    func testLedgerHandlesEmptyFile() throws {
        // Create empty file
        let fileURL = tempDir.appendingPathComponent("gemini-events.jsonl")
        fileManager.createFile(atPath: fileURL.path, contents: Data())

        let ledger = GeminiEventLedger(directory: tempDir)
        let events = try ledger.readEvents()

        XCTAssertEqual(events, [])
    }

    func testLedgerHandlesCorruptLines() throws {
        let fileURL = tempDir.appendingPathComponent("gemini-events.jsonl")

        // Write a mix of valid and corrupt JSONL
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let validEvent = GeminiInvocationEvent(
            startTime: Date(timeIntervalSince1970: 1_700_000_000),
            endTime: Date(timeIntervalSince1970: 1_700_000_030),
            commandMode: "chat",
            model: "gemini-2.5-flash",
            limitHitDetected: false
        )
        let validJSON = String(data: try encoder.encode(validEvent), encoding: .utf8)!

        let content = """
        \(validJSON)
        not valid json at all
        {"broken": true
        \(validJSON)
        """
        try content.write(to: fileURL, atomically: true, encoding: .utf8)

        let ledger = GeminiEventLedger(directory: tempDir)
        let events = try ledger.readEvents()

        XCTAssertEqual(events.count, 2, "Should skip corrupt lines and return 2 valid events")
    }
}

// MARK: - Gemini Wrapper Confidence Tests

final class GeminiWrapperConfidenceTests: XCTestCase {

    func testWrapperEventsUpgradeFromObservedToEstimated() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authenticated(.oauthPersonal)
        )
        let wrapperEvents = [
            GeminiInvocationEvent(
                startTime: Date().addingTimeInterval(-600),
                endTime: Date().addingTimeInterval(-570),
                commandMode: "chat",
                model: "gemini-2.5-flash",
                limitHitDetected: false
            ),
        ]

        let engine = GeminiConfidenceEngine()

        // Without wrapper events: observedOnly (no request events, no plan)
        let baseline = engine.evaluate(
            detection: detection,
            events: [],
            plan: nil
        )
        XCTAssertEqual(baseline.confidence, .observedOnly)

        // With wrapper events: upgraded to estimated
        let upgraded = engine.evaluate(
            detection: detection,
            events: [],
            plan: nil,
            wrapperEvents: wrapperEvents
        )
        XCTAssertEqual(upgraded.confidence, .estimated)
    }

    func testWrapperLimitHitsUpgradeToHighConfidence() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authenticated(.oauthPersonal)
        )
        let plan = GeminiPlanProfile(name: "pro", dailyRequestLimit: 1500, requestsPerMinuteLimit: 15)

        // 3+ wrapper events with limitHitDetected
        let wrapperEvents = (0..<3).map { i in
            GeminiInvocationEvent(
                startTime: Date().addingTimeInterval(Double(-600 * (i + 1))),
                endTime: Date().addingTimeInterval(Double(-600 * (i + 1) + 30)),
                commandMode: "chat",
                model: "gemini-2.5-flash",
                limitHitDetected: true
            )
        }

        let engine = GeminiConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: [],
            plan: plan,
            wrapperEvents: wrapperEvents
        )

        XCTAssertEqual(estimate.confidence, .highConfidence)
    }

    func testWrapperEventsAloneWithoutPlanYieldEstimated() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authenticated(.oauthPersonal)
        )
        let wrapperEvents = [
            GeminiInvocationEvent(
                startTime: Date().addingTimeInterval(-300),
                endTime: Date().addingTimeInterval(-270),
                commandMode: "chat",
                model: "gemini-2.5-flash",
                limitHitDetected: true
            ),
        ]

        let engine = GeminiConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: [],
            plan: nil,
            wrapperEvents: wrapperEvents
        )

        XCTAssertEqual(estimate.confidence, .estimated)
    }

    func testWrapperDoesNotClaimExactConfidence() {
        let detection = GeminiDetectionResult(
            installStatus: .installed,
            authStatus: .authenticated(.oauthPersonal)
        )
        let plan = GeminiPlanProfile(name: "pro", dailyRequestLimit: 1500, requestsPerMinuteLimit: 15)

        // Many wrapper events with limit hits
        let wrapperEvents = (0..<10).map { i in
            GeminiInvocationEvent(
                startTime: Date().addingTimeInterval(Double(-60 * (i + 1))),
                endTime: Date().addingTimeInterval(Double(-60 * (i + 1) + 30)),
                commandMode: "chat",
                model: "gemini-2.5-flash",
                limitHitDetected: true
            )
        }

        let engine = GeminiConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: [],
            plan: plan,
            wrapperEvents: wrapperEvents
        )

        XCTAssertNotEqual(estimate.confidence, .exact,
                          "Wrapper events alone should never yield .exact confidence")
    }
}

// MARK: - Gemini Privacy Tests

final class GeminiPrivacyTests: XCTestCase {

    func testInvocationEventHasNoPromptBodyField() {
        let event = GeminiInvocationEvent(
            startTime: Date(),
            endTime: Date(),
            commandMode: "chat",
            model: "gemini-2.5-flash",
            limitHitDetected: false
        )

        let mirror = Mirror(reflecting: event)
        let propertyNames = mirror.children.compactMap { $0.label }
        let forbiddenNames = ["prompt", "promptBody", "input", "response"]

        for name in forbiddenNames {
            XCTAssertFalse(propertyNames.contains(name),
                           "GeminiInvocationEvent must not have a '\(name)' property")
        }
    }

    func testLedgerJSONLContainsNoDerivedContent() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("gemini-privacy-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let ledger = GeminiEventLedger(directory: tempDir)
        let event = GeminiInvocationEvent(
            startTime: Date(timeIntervalSince1970: 1_700_000_000),
            endTime: Date(timeIntervalSince1970: 1_700_000_030),
            commandMode: "chat",
            model: "gemini-2.5-flash",
            limitHitDetected: false
        )
        try ledger.append(event)

        let fileURL = tempDir.appendingPathComponent("gemini-events.jsonl")
        let rawLine = try String(contentsOf: fileURL, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let json = try JSONSerialization.jsonObject(with: Data(rawLine.utf8)) as! [String: Any]

        let allowedKeys: Set<String> = ["startTime", "endTime", "commandMode", "model", "limitHitDetected"]
        let actualKeys = Set(json.keys)

        XCTAssertEqual(actualKeys, allowedKeys,
                       "JSONL should only contain \(allowedKeys), got \(actualKeys)")
    }

    func testLedgerFileStoredInAppSupport() {
        let defaultDir = GeminiEventLedger.defaultDirectory

        XCTAssertTrue(defaultDir.path.contains("Application Support/ClaudeUsage"),
                      "Default ledger directory should be in Application Support/ClaudeUsage, got: \(defaultDir.path)")
    }
}
