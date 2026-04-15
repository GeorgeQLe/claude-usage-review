import XCTest
@testable import ClaudeUsage

// MARK: - Codex Detection Tests

final class CodexDetectionTests: XCTestCase {

    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("codex-test-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testDetectsInstalledWhenConfigExists() {
        // Create ~/.codex/config.toml equivalent in temp dir
        let configFile = tempDir.appendingPathComponent("config.toml")
        fileManager.createFile(atPath: configFile.path, contents: Data("[codex]\n".utf8))

        let detector = CodexDetector(codexHome: tempDir, fileManager: fileManager)
        let result = detector.detect()

        XCTAssertEqual(result.installStatus, .installed)
    }

    func testDetectsNotInstalledWhenDirectoryMissing() {
        // Point at a path that doesn't exist
        let missingDir = tempDir.appendingPathComponent("nonexistent")

        let detector = CodexDetector(codexHome: missingDir, fileManager: fileManager)
        let result = detector.detect()

        XCTAssertEqual(result.installStatus, .notInstalled)
    }

    func testDetectsAuthPresentWhenAuthJsonExists() {
        let authFile = tempDir.appendingPathComponent("auth.json")
        let authJSON = """
        {"api_key": "sk-test-key", "expires_at": "2026-05-01T00:00:00Z"}
        """
        fileManager.createFile(atPath: authFile.path, contents: Data(authJSON.utf8))

        let detector = CodexDetector(codexHome: tempDir, fileManager: fileManager)
        let result = detector.detect()

        XCTAssertEqual(result.authStatus, .authPresent)
    }

    func testDetectsAuthAbsentWhenNoAuthFile() {
        // Temp dir exists but no auth.json
        let detector = CodexDetector(codexHome: tempDir, fileManager: fileManager)
        let result = detector.detect()

        XCTAssertEqual(result.authStatus, .authAbsent)
    }

    func testDefaultAdapterRespectsCodexHomeEnvironmentVariable() throws {
        let codexHome = tempDir.appendingPathComponent("custom-codex-home")
        let ledgerDir = tempDir.appendingPathComponent("ledger")
        try fileManager.createDirectory(at: codexHome, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: ledgerDir, withIntermediateDirectories: true)

        fileManager.createFile(
            atPath: codexHome.appendingPathComponent("config.toml").path,
            contents: Data("[codex]\n".utf8)
        )
        fileManager.createFile(
            atPath: codexHome.appendingPathComponent("auth.json").path,
            contents: Data("{\"api_key\":\"test\"}\n".utf8)
        )

        let recentLimitHit = """
        {"type":"error","timestamp":"\(codexISO(Date().addingTimeInterval(-60)))","message":"rate limit exceeded"}
        """
        try recentLimitHit.write(
            to: codexHome.appendingPathComponent("history.jsonl"),
            atomically: true,
            encoding: .utf8
        )

        try withEnvironmentVariable("CODEX_HOME", value: codexHome.path) {
            let adapter = CodexAdapter(planProfile: nil, ledgerDirectory: ledgerDir)
            adapter.refresh()

            guard case let .installed(_, cooldown) = adapter.state else {
                return XCTFail("Expected default adapter to detect CODEX_HOME as installed")
            }
            XCTAssertTrue(cooldown.cooldownActive, "Expected default adapter to parse activity from CODEX_HOME")
        }
    }
}

// MARK: - Codex Activity Parsing Tests

final class CodexActivityParsingTests: XCTestCase {

    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("codex-activity-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testParsesHistoryJsonlEntries() throws {
        let historyFile = tempDir.appendingPathComponent("history.jsonl")
        let jsonl = """
        {"type":"prompt","timestamp":"2026-04-09T10:00:00Z","model":"codex-1","tokens":150}
        {"type":"completion","timestamp":"2026-04-09T10:00:05Z","model":"codex-1","tokens":320}
        {"type":"prompt","timestamp":"2026-04-09T10:05:00Z","model":"codex-1","tokens":200}
        """
        try jsonl.write(to: historyFile, atomically: true, encoding: .utf8)

        let parser = CodexActivityParser(codexHome: tempDir)
        let events = try parser.parseHistory()

        XCTAssertEqual(events.count, 3)
        XCTAssertEqual(events[0].eventType, .prompt)
        XCTAssertEqual(events[1].eventType, .completion)
        XCTAssertNotNil(events[0].timestamp)
        XCTAssertNotNil(events[2].timestamp)
    }

    func testParsesSessionRolloutFiles() throws {
        let sessionDir = tempDir.appendingPathComponent("sessions")
        try fileManager.createDirectory(at: sessionDir, withIntermediateDirectories: true)

        let sessionFile = sessionDir.appendingPathComponent("session-001.jsonl")
        let jsonl = """
        {"type":"session_start","timestamp":"2026-04-09T09:00:00Z"}
        {"type":"prompt","timestamp":"2026-04-09T09:01:00Z","tokens":100}
        {"type":"session_end","timestamp":"2026-04-09T09:30:00Z"}
        """
        try jsonl.write(to: sessionFile, atomically: true, encoding: .utf8)

        let parser = CodexActivityParser(codexHome: tempDir)
        let events = try parser.parseSessions()

        XCTAssertTrue(events.count >= 1, "Should parse at least one session event")
        // Session events should carry duration info
        let sessionEnd = events.first { $0.eventType == .sessionEnd }
        XCTAssertNotNil(sessionEnd, "Should find a session_end event")
        XCTAssertNotNil(sessionEnd?.duration, "Session end event should have duration")
    }

    func testParsesRecursiveDatedSessionRolloutFiles() throws {
        let sessionDir = tempDir
            .appendingPathComponent("sessions")
            .appendingPathComponent("2026")
            .appendingPathComponent("04")
            .appendingPathComponent("15")
        try fileManager.createDirectory(at: sessionDir, withIntermediateDirectories: true)

        let rolloutFile = sessionDir.appendingPathComponent("rollout-abc123.jsonl")
        let jsonl = """
        {"type":"prompt","timestamp":"2026-04-15T09:01:00Z","tokens":100}
        {"type":"completion","timestamp":"2026-04-15T09:01:05Z","tokens":250}
        {"type":"error","timestamp":"2026-04-15T09:02:00Z","message":"usage limit reached"}
        """
        try jsonl.write(to: rolloutFile, atomically: true, encoding: .utf8)

        let parser = CodexActivityParser(codexHome: tempDir)
        let events = try parser.parseSessions()

        XCTAssertEqual(events.count, 3)
        XCTAssertTrue(events.contains { $0.eventType == .prompt })
        XCTAssertTrue(events.contains { $0.eventType == .completion })
        XCTAssertTrue(events.contains { $0.eventType == .limitHit })
    }

    func testIncrementalParseResumeFromBookmark() throws {
        let historyFile = tempDir.appendingPathComponent("history.jsonl")
        let initialLines = """
        {"type":"prompt","timestamp":"2026-04-09T10:00:00Z","tokens":100}
        {"type":"completion","timestamp":"2026-04-09T10:00:05Z","tokens":200}
        """
        try initialLines.write(to: historyFile, atomically: true, encoding: .utf8)

        let parser = CodexActivityParser(codexHome: tempDir)

        // First parse — gets all entries and returns a bookmark
        let (firstEvents, bookmark) = try parser.parseHistory(from: nil)
        XCTAssertEqual(firstEvents.count, 2)
        XCTAssertNotNil(bookmark)

        // Append new line
        let newLine = "\n{\"type\":\"prompt\",\"timestamp\":\"2026-04-09T10:10:00Z\",\"tokens\":150}"
        let handle = try FileHandle(forWritingTo: historyFile)
        handle.seekToEndOfFile()
        handle.write(Data(newLine.utf8))
        handle.closeFile()

        // Resume from bookmark — only new entries
        let (newEvents, _) = try parser.parseHistory(from: bookmark)
        XCTAssertEqual(newEvents.count, 1, "Incremental parse should only return new entries")
    }

    func testHandlesEmptyOrCorruptedLines() throws {
        let historyFile = tempDir.appendingPathComponent("history.jsonl")
        let jsonl = """
        {"type":"prompt","timestamp":"2026-04-09T10:00:00Z","tokens":100}
        not valid json at all
        {"type":"completion","timestamp":"2026-04-09T10:00:05Z","tokens":200}

        {"malformed": true
        {"type":"prompt","timestamp":"2026-04-09T10:05:00Z","tokens":300}
        """
        try jsonl.write(to: historyFile, atomically: true, encoding: .utf8)

        let parser = CodexActivityParser(codexHome: tempDir)
        let events = try parser.parseHistory()

        XCTAssertEqual(events.count, 3, "Should skip corrupted lines and return 3 valid events")
    }

    func testParsesTimestampsIntoActivityWindows() throws {
        let historyFile = tempDir.appendingPathComponent("history.jsonl")
        // Events spread across a 5-hour window
        let jsonl = """
        {"type":"prompt","timestamp":"2026-04-09T06:00:00Z","tokens":100}
        {"type":"prompt","timestamp":"2026-04-09T07:30:00Z","tokens":150}
        {"type":"prompt","timestamp":"2026-04-09T09:00:00Z","tokens":200}
        {"type":"prompt","timestamp":"2026-04-09T10:00:00Z","tokens":120}
        {"type":"prompt","timestamp":"2026-04-09T10:55:00Z","tokens":180}
        """
        try jsonl.write(to: historyFile, atomically: true, encoding: .utf8)

        let parser = CodexActivityParser(codexHome: tempDir)
        let events = try parser.parseHistory()
        let windows = parser.activityWindows(from: events, windowHours: 5)

        XCTAssertFalse(windows.isEmpty, "Should produce at least one activity window")
        // All 5 events fall within a single 5-hour window (06:00–11:00)
        XCTAssertEqual(windows.first?.eventCount, 5, "All events should fall in the same 5-hour window")
    }
}

// MARK: - Codex Adapter Refresh Tests

final class CodexAdapterRefreshTests: XCTestCase {

    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("codex-adapter-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testRefreshReusesHistoryBookmarkForAppendedContent() throws {
        let codexHome = tempDir.appendingPathComponent("codex")
        let ledgerDir = tempDir.appendingPathComponent("ledger")
        try fileManager.createDirectory(at: codexHome, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: ledgerDir, withIntermediateDirectories: true)
        fileManager.createFile(
            atPath: codexHome.appendingPathComponent("history.jsonl").path,
            contents: Data("{\"type\":\"prompt\",\"timestamp\":\"2026-04-15T09:01:00Z\"}\n".utf8)
        )

        let detector = StubCodexDetector(
            codexHome: codexHome,
            result: CodexDetectionResult(installStatus: .installed, authStatus: .authPresent)
        )
        let parser = BookmarkRecordingCodexActivityParser(codexHome: codexHome)
        let adapter = CodexAdapter(
            detector: detector,
            parser: parser,
            ledger: CodexEventLedger(directory: ledgerDir),
            planProfile: CodexPlanProfile(name: "pro", dailyTokenLimit: 100_000)
        )

        adapter.refresh()
        adapter.refresh()

        XCTAssertEqual(parser.requestedBookmarkDescriptions, ["nil", "1"])
    }

    func testRefreshMergesHistoryAndRecursiveSessionEventsBeforeCooldownEvaluation() throws {
        let codexHome = tempDir.appendingPathComponent("codex")
        let ledgerDir = tempDir.appendingPathComponent("ledger")
        try fileManager.createDirectory(at: codexHome, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: ledgerDir, withIntermediateDirectories: true)

        fileManager.createFile(
            atPath: codexHome.appendingPathComponent("config.toml").path,
            contents: Data("[codex]\n".utf8)
        )
        fileManager.createFile(
            atPath: codexHome.appendingPathComponent("auth.json").path,
            contents: Data("{\"api_key\":\"test\"}\n".utf8)
        )
        let history = """
        {"type":"prompt","timestamp":"\(codexISO(Date().addingTimeInterval(-120)))","tokens":100}
        """
        try history.write(
            to: codexHome.appendingPathComponent("history.jsonl"),
            atomically: true,
            encoding: .utf8
        )

        let sessionDir = codexHome
            .appendingPathComponent("sessions")
            .appendingPathComponent("2026")
            .appendingPathComponent("04")
            .appendingPathComponent("15")
        try fileManager.createDirectory(at: sessionDir, withIntermediateDirectories: true)
        let rollout = """
        {"type":"error","timestamp":"\(codexISO(Date().addingTimeInterval(-60)))","message":"rate limit exceeded"}
        """
        try rollout.write(
            to: sessionDir.appendingPathComponent("rollout-limit.jsonl"),
            atomically: true,
            encoding: .utf8
        )

        let adapter = CodexAdapter(
            codexHome: codexHome,
            planProfile: CodexPlanProfile(name: "pro", dailyTokenLimit: 100_000),
            ledgerDirectory: ledgerDir
        )
        adapter.refresh()

        guard case let .installed(estimate, cooldown) = adapter.state else {
            return XCTFail("Expected configured Codex adapter")
        }
        XCTAssertEqual(estimate.confidence, .estimated)
        XCTAssertTrue(cooldown.cooldownActive, "Expected session rollout limit hit to contribute to cooldown")
    }
}

// MARK: - Codex Cooldown Tests

final class CodexCooldownTests: XCTestCase {

    func testDetectsRateLimitFromLogEntry() {
        let logLine = """
        {"type":"error","timestamp":"2026-04-09T10:00:00Z","message":"rate limit exceeded, retry after 300s"}
        """

        let parser = CodexActivityParser(codexHome: URL(fileURLWithPath: "/tmp"))
        let event = parser.parseLogLine(logLine)

        XCTAssertNotNil(event)
        XCTAssertEqual(event?.eventType, .limitHit)
    }

    func testDetectsCooldownFromRecentLimitHit() {
        // A .limitHit event from 2 minutes ago should mean cooldown is active
        let recentEvent = CodexActivityEvent(
            eventType: .limitHit,
            timestamp: Date().addingTimeInterval(-120),
            tokens: nil,
            duration: nil
        )

        let engine = CodexConfidenceEngine()
        let cooldown = engine.cooldownStatus(from: [recentEvent])

        XCTAssertTrue(cooldown.cooldownActive, "Should detect active cooldown from recent limit hit")
    }

    func testNoCooldownWhenNoRecentLimitEvents() {
        // A .limitHit event from 2 hours ago — cooldown should have expired
        let oldEvent = CodexActivityEvent(
            eventType: .limitHit,
            timestamp: Date().addingTimeInterval(-7200),
            tokens: nil,
            duration: nil
        )

        let engine = CodexConfidenceEngine()
        let cooldown = engine.cooldownStatus(from: [oldEvent])

        XCTAssertFalse(cooldown.cooldownActive, "Old limit hit should not trigger cooldown")
    }
}

// MARK: - Codex Confidence Tests

final class CodexConfidenceTests: XCTestCase {

    func testObservedOnlyWhenAuthDetectedButNoActivity() {
        let detection = CodexDetectionResult(
            installStatus: .installed,
            authStatus: .authPresent
        )

        let engine = CodexConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: [],
            plan: nil,
            recentResets: 0
        )

        XCTAssertEqual(estimate.confidence, .observedOnly)
    }

    func testEstimatedWhenPlanProfilePlusPassiveActivity() {
        let detection = CodexDetectionResult(
            installStatus: .installed,
            authStatus: .authPresent
        )
        let events = [
            CodexActivityEvent(
                eventType: .prompt,
                timestamp: Date().addingTimeInterval(-600),
                tokens: 150,
                duration: nil
            ),
            CodexActivityEvent(
                eventType: .completion,
                timestamp: Date().addingTimeInterval(-550),
                tokens: 300,
                duration: nil
            ),
        ]
        let plan = CodexPlanProfile(name: "pro", dailyTokenLimit: 100_000)

        let engine = CodexConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: events,
            plan: plan,
            recentResets: 0
        )

        XCTAssertEqual(estimate.confidence, .estimated)
    }

    func testHighConfidenceWhenRepeatedResetPatternsObserved() {
        let detection = CodexDetectionResult(
            installStatus: .installed,
            authStatus: .authPresent
        )
        let events = [
            CodexActivityEvent(
                eventType: .limitHit,
                timestamp: Date().addingTimeInterval(-3600),
                tokens: nil,
                duration: nil
            ),
        ]
        let plan = CodexPlanProfile(name: "pro", dailyTokenLimit: 100_000)

        let engine = CodexConfidenceEngine()
        let estimate = engine.evaluate(
            detection: detection,
            events: events,
            plan: plan,
            recentResets: 3 // Multiple observed resets → high confidence
        )

        XCTAssertEqual(estimate.confidence, .highConfidence)
    }
}

// MARK: - Test Helpers

private final class StubCodexDetector: CodexDetector {
    private let stubbedResult: CodexDetectionResult

    init(codexHome: URL, result: CodexDetectionResult) {
        self.stubbedResult = result
        super.init(codexHome: codexHome)
    }

    override func detect() -> CodexDetectionResult {
        stubbedResult
    }
}

private final class BookmarkRecordingCodexActivityParser: CodexActivityParser {
    private var nextOffset: UInt64 = 1
    private(set) var requestedBookmarkDescriptions: [String] = []

    override func parseHistory() throws -> [CodexActivityEvent] {
        requestedBookmarkDescriptions.append("nil")
        return [
            CodexActivityEvent(
                eventType: .prompt,
                timestamp: Date().addingTimeInterval(-120),
                tokens: 100,
                duration: nil
            )
        ]
    }

    override func parseHistory(from bookmark: ParseBookmark?) throws -> ([CodexActivityEvent], ParseBookmark?) {
        requestedBookmarkDescriptions.append(bookmark.map { "\($0.byteOffset)" } ?? "nil")
        defer { nextOffset += 1 }
        return (
            [
                CodexActivityEvent(
                    eventType: .prompt,
                    timestamp: Date().addingTimeInterval(-120),
                    tokens: 100,
                    duration: nil
                )
            ],
            ParseBookmark(byteOffset: nextOffset)
        )
    }
}

private func codexISO(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
}

private func withEnvironmentVariable(_ name: String, value: String, body: () throws -> Void) throws {
    let previous = getenv(name).map { String(cString: $0) }
    setenv(name, value, 1)
    defer {
        if let previous {
            setenv(name, previous, 1)
        } else {
            unsetenv(name)
        }
    }
    try body()
}
