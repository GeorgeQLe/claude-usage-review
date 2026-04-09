import XCTest
@testable import ClaudeUsage

// MARK: - Codex Wrapper Event Tests

final class CodexWrapperEventTests: XCTestCase {

    func testInvocationEventCapturesStartEndTimestamps() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let end = Date(timeIntervalSince1970: 1_700_000_045)

        let event = CodexInvocationEvent(
            startTime: start,
            endTime: end,
            commandMode: "chat",
            model: "codex-mini",
            limitHitDetected: false
        )

        XCTAssertEqual(event.duration, 45, accuracy: 0.001)
    }

    func testInvocationEventRecordsCommandModeAndModel() {
        let event = CodexInvocationEvent(
            startTime: Date(),
            endTime: Date(),
            commandMode: "chat",
            model: "codex-mini",
            limitHitDetected: false
        )

        XCTAssertEqual(event.commandMode, "chat")
        XCTAssertEqual(event.model, "codex-mini")
    }

    func testInvocationEventRecordsLimitHitDetection() {
        let event = CodexInvocationEvent(
            startTime: Date(),
            endTime: Date(),
            commandMode: "autocomplete",
            model: "codex-1",
            limitHitDetected: true
        )

        XCTAssertTrue(event.limitHitDetected)
    }
}

// MARK: - Codex Event Ledger Tests

final class CodexEventLedgerTests: XCTestCase {

    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("codex-ledger-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testAppendEventWritesJSONLLine() throws {
        let ledger = CodexEventLedger(directory: tempDir)
        let event = CodexInvocationEvent(
            startTime: Date(timeIntervalSince1970: 1_700_000_000),
            endTime: Date(timeIntervalSince1970: 1_700_000_030),
            commandMode: "chat",
            model: "codex-mini",
            limitHitDetected: false
        )

        try ledger.append(event)

        let fileURL = tempDir.appendingPathComponent("codex-events.jsonl")
        XCTAssertTrue(fileManager.fileExists(atPath: fileURL.path))

        let contents = try String(contentsOf: fileURL, encoding: .utf8)
        let lines = contents.split(separator: "\n")
        XCTAssertEqual(lines.count, 1)
    }

    func testReadEventsReturnsAllAppendedEvents() throws {
        let ledger = CodexEventLedger(directory: tempDir)
        let base = Date(timeIntervalSince1970: 1_700_000_000)

        for i in 0..<3 {
            let event = CodexInvocationEvent(
                startTime: base.addingTimeInterval(Double(i * 60)),
                endTime: base.addingTimeInterval(Double(i * 60 + 30)),
                commandMode: "chat",
                model: "codex-mini",
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
        let ledger = CodexEventLedger(directory: tempDir)
        let now = Date()

        // Old event: 48 hours ago
        let oldEvent = CodexInvocationEvent(
            startTime: now.addingTimeInterval(-48 * 3600),
            endTime: now.addingTimeInterval(-48 * 3600 + 30),
            commandMode: "chat",
            model: "codex-mini",
            limitHitDetected: false
        )
        try ledger.append(oldEvent)

        // Recent event: 1 hour ago
        let recentEvent = CodexInvocationEvent(
            startTime: now.addingTimeInterval(-3600),
            endTime: now.addingTimeInterval(-3600 + 30),
            commandMode: "chat",
            model: "codex-mini",
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
        let fileURL = tempDir.appendingPathComponent("codex-events.jsonl")
        fileManager.createFile(atPath: fileURL.path, contents: Data())

        let ledger = CodexEventLedger(directory: tempDir)
        let events = try ledger.readEvents()

        XCTAssertEqual(events, [])
    }

    func testLedgerHandlesCorruptLines() throws {
        let fileURL = tempDir.appendingPathComponent("codex-events.jsonl")

        // Write a mix of valid and corrupt JSONL
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let validEvent = CodexInvocationEvent(
            startTime: Date(timeIntervalSince1970: 1_700_000_000),
            endTime: Date(timeIntervalSince1970: 1_700_000_030),
            commandMode: "chat",
            model: "codex-mini",
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

        let ledger = CodexEventLedger(directory: tempDir)
        let events = try ledger.readEvents()

        XCTAssertEqual(events.count, 2, "Should skip corrupt lines and return 2 valid events")
    }
}

// MARK: - Codex Wrapper Confidence Tests

final class CodexWrapperConfidenceTests: XCTestCase {

    func testWrapperEventsUpgradeFromObservedToEstimated() {
        let detection = CodexDetectionResult(
            installStatus: .installed,
            authStatus: .authPresent
        )
        let wrapperEvents = [
            CodexInvocationEvent(
                startTime: Date().addingTimeInterval(-600),
                endTime: Date().addingTimeInterval(-570),
                commandMode: "chat",
                model: "codex-mini",
                limitHitDetected: false
            ),
        ]

        let engine = CodexConfidenceEngine()

        // Without wrapper events: observedOnly
        let baseline = engine.evaluate(
            detection: detection,
            events: [],
            plan: nil,
            recentResets: 0
        )
        XCTAssertEqual(baseline.confidence, .observedOnly)

        // With wrapper events: upgraded to estimated
        let upgraded = engine.evaluate(
            detection: detection,
            events: [],
            plan: nil,
            recentResets: 0,
            wrapperEvents: wrapperEvents
        )
        XCTAssertEqual(upgraded.confidence, .estimated)
    }

    func testWrapperLimitHitsUpgradeToHighConfidence() {
        let detection = CodexDetectionResult(
            installStatus: .installed,
            authStatus: .authPresent
        )
        let plan = CodexPlanProfile(name: "pro", dailyTokenLimit: 100_000)

        // 3+ wrapper events with limitHitDetected
        let wrapperEvents = (0..<3).map { i in
            CodexInvocationEvent(
                startTime: Date().addingTimeInterval(Double(-600 * (i + 1))),
                endTime: Date().addingTimeInterval(Double(-600 * (i + 1) + 30)),
                commandMode: "chat",
                model: "codex-mini",
                limitHitDetected: true
            )
        }

        let engine = CodexConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: [],
            plan: plan,
            recentResets: 0,
            wrapperEvents: wrapperEvents
        )

        XCTAssertEqual(estimate.confidence, .highConfidence)
    }

    func testWrapperEventsAloneWithoutPlanYieldEstimated() {
        let detection = CodexDetectionResult(
            installStatus: .installed,
            authStatus: .authPresent
        )
        let wrapperEvents = [
            CodexInvocationEvent(
                startTime: Date().addingTimeInterval(-300),
                endTime: Date().addingTimeInterval(-270),
                commandMode: "chat",
                model: "codex-mini",
                limitHitDetected: true
            ),
        ]

        let engine = CodexConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: [],
            plan: nil,
            recentResets: 0,
            wrapperEvents: wrapperEvents
        )

        XCTAssertEqual(estimate.confidence, .estimated)
    }

    func testWrapperDoesNotClaimExactConfidence() {
        let detection = CodexDetectionResult(
            installStatus: .installed,
            authStatus: .authPresent
        )
        let plan = CodexPlanProfile(name: "pro", dailyTokenLimit: 100_000)

        // Many wrapper events with limit hits
        let wrapperEvents = (0..<10).map { i in
            CodexInvocationEvent(
                startTime: Date().addingTimeInterval(Double(-60 * (i + 1))),
                endTime: Date().addingTimeInterval(Double(-60 * (i + 1) + 30)),
                commandMode: "chat",
                model: "codex-mini",
                limitHitDetected: true
            )
        }

        let engine = CodexConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: [],
            plan: plan,
            recentResets: 10,
            wrapperEvents: wrapperEvents
        )

        XCTAssertNotEqual(estimate.confidence, .exact,
                          "Wrapper events alone should never yield .exact confidence")
    }
}

// MARK: - Codex Privacy Tests

final class CodexPrivacyTests: XCTestCase {

    func testInvocationEventHasNoPromptBodyField() {
        let event = CodexInvocationEvent(
            startTime: Date(),
            endTime: Date(),
            commandMode: "chat",
            model: "codex-mini",
            limitHitDetected: false
        )

        let mirror = Mirror(reflecting: event)
        let propertyNames = mirror.children.compactMap { $0.label }
        let forbiddenNames = ["prompt", "promptBody", "input", "response"]

        for name in forbiddenNames {
            XCTAssertFalse(propertyNames.contains(name),
                           "CodexInvocationEvent must not have a '\(name)' property")
        }
    }

    func testLedgerJSONLContainsNoDerivedContent() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("codex-privacy-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let ledger = CodexEventLedger(directory: tempDir)
        let event = CodexInvocationEvent(
            startTime: Date(timeIntervalSince1970: 1_700_000_000),
            endTime: Date(timeIntervalSince1970: 1_700_000_030),
            commandMode: "chat",
            model: "codex-mini",
            limitHitDetected: false
        )
        try ledger.append(event)

        let fileURL = tempDir.appendingPathComponent("codex-events.jsonl")
        let rawLine = try String(contentsOf: fileURL, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let json = try JSONSerialization.jsonObject(with: Data(rawLine.utf8)) as! [String: Any]

        let allowedKeys: Set<String> = ["startTime", "endTime", "commandMode", "model", "limitHitDetected"]
        let actualKeys = Set(json.keys)

        XCTAssertEqual(actualKeys, allowedKeys,
                       "JSONL should only contain \(allowedKeys), got \(actualKeys)")
    }

    func testLedgerFileStoredInAppSupport() {
        let defaultDir = CodexEventLedger.defaultDirectory

        XCTAssertTrue(defaultDir.path.contains("Application Support/ClaudeUsage"),
                      "Default ledger directory should be in Application Support/ClaudeUsage, got: \(defaultDir.path)")
    }
}
