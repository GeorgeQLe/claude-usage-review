import XCTest
@testable import ClaudeUsage

// MARK: - Provider Telemetry Settings Contract

final class ProviderTelemetrySettingsContractTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "com.claudeusage.provider-telemetry-tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    func testProviderTelemetryDefaultsOffForCodexAndGemini() {
        let store = ProviderSettingsStore(defaults: defaults)

        XCTAssertFalse(store.providerTelemetryEnabled(for: .codex))
        XCTAssertFalse(store.providerTelemetryEnabled(for: .gemini))
    }

    func testProviderTelemetryIsSeparateFromAccuracyMode() {
        let store = ProviderSettingsStore(defaults: defaults)

        store.setCodexAccuracyMode(true)
        store.setGeminiAccuracyMode(true)

        XCTAssertTrue(store.codexAccuracyMode())
        XCTAssertTrue(store.geminiAccuracyMode())
        XCTAssertFalse(store.providerTelemetryEnabled(for: .codex))
        XCTAssertFalse(store.providerTelemetryEnabled(for: .gemini))

        store.setProviderTelemetryEnabled(true, for: .codex)
        store.setProviderTelemetryEnabled(true, for: .gemini)

        XCTAssertTrue(store.providerTelemetryEnabled(for: .codex))
        XCTAssertTrue(store.providerTelemetryEnabled(for: .gemini))
        XCTAssertTrue(store.codexAccuracyMode())
        XCTAssertTrue(store.geminiAccuracyMode())
    }
}

// MARK: - Provider Telemetry Payload Contract

final class ProviderTelemetryPayloadContractTests: XCTestCase {
    private let decoder = ProviderTelemetryJSONDecoder.make()

    func testDecodesCodexRateLimitTelemetryPayload() throws {
        let payload = try decoder.decode(CodexTelemetryPayload.self, from: Fixtures.codexWhamUsage)

        XCTAssertEqual(payload.planType, "pro")
        XCTAssertEqual(payload.rateLimits.count, 2)
        XCTAssertEqual(payload.rateLimits[0].limitId, "gpt-5-window")
        XCTAssertEqual(payload.rateLimits[0].limitName, "GPT-5 usage")
        XCTAssertEqual(payload.rateLimits[0].windowLabel, "5h")
        XCTAssertEqual(payload.rateLimits[0].usedPercent, 61.5)
        XCTAssertEqual(payload.rateLimits[0].resetsAt, Fixtures.date("2026-04-16T18:00:00Z"))
        XCTAssertEqual(payload.rateLimits[0].windowDuration, 5 * 60 * 60)
        XCTAssertEqual(payload.rateLimits[0].hasCredits, true)
        XCTAssertEqual(payload.rateLimits[0].unlimited, false)
        XCTAssertEqual(payload.balance?.amount, 42)
        XCTAssertEqual(payload.balance?.unit, "credits")
    }

    func testDecodesGeminiCodeAssistQuotaTelemetryPayload() throws {
        let payload = try decoder.decode(GeminiTelemetryPayload.self, from: Fixtures.geminiRetrieveUserQuota)

        XCTAssertEqual(payload.quotaBuckets.count, 2)
        XCTAssertEqual(payload.quotaBuckets[0].modelId, "gemini-2.5-pro")
        XCTAssertEqual(payload.quotaBuckets[0].tokenType, "requests")
        XCTAssertEqual(payload.quotaBuckets[0].remainingAmount, 87)
        XCTAssertEqual(payload.quotaBuckets[0].remainingFraction, 0.87)
        XCTAssertEqual(payload.quotaBuckets[0].resetTime, Fixtures.date("2026-04-17T00:00:00Z"))
        XCTAssertEqual(payload.quotaBuckets[1].modelId, "gemini-2.5-flash")
    }

    func testNormalizedSnapshotCarriesProviderPayloadWithoutRawResponse() throws {
        let codexPayload = try decoder.decode(CodexTelemetryPayload.self, from: Fixtures.codexWhamUsage)
        let snapshot = ProviderTelemetrySnapshot(
            providerId: .codex,
            accountLabel: "Personal Codex",
            status: .exact,
            confidence: .providerSupplied,
            lastRefreshAt: Fixtures.date("2026-04-16T17:55:00Z"),
            nextRefreshAt: Fixtures.date("2026-04-16T18:00:00Z"),
            failureCount: 0,
            degradedReason: nil,
            rawSourceVersion: "codex-wham-usage",
            providerPayload: .codex(codexPayload)
        )

        XCTAssertEqual(snapshot.providerId, .codex)
        XCTAssertEqual(snapshot.status, .exact)
        XCTAssertEqual(snapshot.confidence, .providerSupplied)
        XCTAssertNil(snapshot.rawResponseData)
    }
}

// MARK: - HTTP Injection Contract

final class ProviderTelemetryHTTPInjectionContractTests: XCTestCase {
    func testCodexTelemetryUsesInjectedHTTPClientAndExistingCLIAuth() async throws {
        let httpClient = RecordingProviderTelemetryHTTPClient(
            responses: [
                .success(
                    ProviderTelemetryHTTPResponse(
                        statusCode: 200,
                        headers: ["content-type": "application/json"],
                        body: Fixtures.codexWhamUsage
                    )
                )
            ]
        )
        let client = CodexTelemetryClient(
            authProvider: StubCodexTelemetryAuthProvider(
                auth: .chatGPT(accessToken: "codex-token-value", accountLabel: "Personal Codex")
            ),
            httpClient: httpClient,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )

        let snapshot = try await client.refresh()

        XCTAssertEqual(httpClient.requests.count, 1)
        XCTAssertEqual(httpClient.requests[0].url?.absoluteString, "https://chatgpt.com/backend-api/wham/usage")
        XCTAssertEqual(httpClient.requests[0].httpMethod, "GET")
        XCTAssertEqual(snapshot.status, .exact)
        XCTAssertEqual(snapshot.confidence, .providerSupplied)
        XCTAssertEqual(snapshot.accountLabel, "Personal Codex")
    }

    func testGeminiTelemetryUsesInjectedHTTPClientAndNoLiveRequest() async throws {
        let httpClient = RecordingProviderTelemetryHTTPClient(
            responses: [
                .success(
                    ProviderTelemetryHTTPResponse(
                        statusCode: 200,
                        headers: ["content-type": "application/json"],
                        body: Fixtures.geminiRetrieveUserQuota
                    )
                )
            ]
        )
        let client = GeminiTelemetryClient(
            authProvider: StubGeminiTelemetryAuthProvider(
                auth: .codeAssistOAuth(
                    accessToken: "gemini-token-value",
                    projectId: "cloud-ai-companion-project",
                    accountLabel: "Work Gemini"
                )
            ),
            httpClient: httpClient,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )

        let snapshot = try await client.refresh()

        XCTAssertEqual(httpClient.requests.count, 1)
        XCTAssertEqual(
            httpClient.requests[0].url?.absoluteString,
            "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota"
        )
        XCTAssertEqual(httpClient.requests[0].httpMethod, "POST")
        XCTAssertEqual(httpClient.decodedJSONBody(at: 0)?["project"] as? String, "cloud-ai-companion-project")
        XCTAssertEqual(snapshot.status, .exact)
        XCTAssertEqual(snapshot.confidence, .providerSupplied)
        XCTAssertEqual(snapshot.accountLabel, "Work Gemini")
    }
}

// MARK: - Refresh And Fallback Contract

final class ProviderTelemetryRefreshContractTests: XCTestCase {
    func testCoordinatorTransitionsFromPassiveToProviderSuppliedThenBackToPassiveFallback() async throws {
        let telemetryClient = ScriptedProviderTelemetryClient(
            results: [
                .success(
                    ProviderTelemetrySnapshot(
                        providerId: .codex,
                        accountLabel: "Personal Codex",
                        status: .exact,
                        confidence: .providerSupplied,
                        lastRefreshAt: Fixtures.date("2026-04-16T17:55:00Z"),
                        nextRefreshAt: Fixtures.date("2026-04-16T18:00:00Z"),
                        failureCount: 0,
                        degradedReason: nil,
                        rawSourceVersion: "codex-wham-usage",
                        providerPayload: .codex(try ProviderTelemetryJSONDecoder.make().decode(
                            CodexTelemetryPayload.self,
                            from: Fixtures.codexWhamUsage
                        ))
                    )
                ),
                .failure(ProviderTelemetryError.endpointShapeChanged("missing limits"))
            ]
        )
        let coordinator = ProviderTelemetryCoordinator(
            clients: [.codex: telemetryClient],
            store: InMemoryProviderTelemetryStore(),
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )

        let passive = ProviderSnapshot.codexRich(
            estimate: CodexEstimate(confidence: .observedOnly),
            isEnabled: true
        )

        let supplied = try await coordinator.refresh(.codex, reason: .scheduled, passiveSnapshot: passive)
        XCTAssertEqual(supplied.confidence, .providerSupplied)
        XCTAssertEqual(supplied.status, .exact)

        let fallback = try await coordinator.refresh(.codex, reason: .manual, passiveSnapshot: passive)
        XCTAssertEqual(fallback.confidence, .passiveFallback)
        XCTAssertEqual(fallback.status, .unavailable)
        XCTAssertEqual(fallback.passiveSnapshot?.id, .codex)
    }

    func testRefreshBacksOffAfterFailuresAndManualRefreshBypassesBackoff() async throws {
        let telemetryClient = ScriptedProviderTelemetryClient(
            results: [
                .failure(ProviderTelemetryError.network("offline")),
                .failure(ProviderTelemetryError.network("offline")),
                .failure(ProviderTelemetryError.network("offline")),
                .success(
                    ProviderTelemetrySnapshot(
                        providerId: .gemini,
                        accountLabel: "Work Gemini",
                        status: .exact,
                        confidence: .providerSupplied,
                        lastRefreshAt: Fixtures.date("2026-04-16T17:55:00Z"),
                        nextRefreshAt: Fixtures.date("2026-04-16T18:00:00Z"),
                        failureCount: 0,
                        degradedReason: nil,
                        rawSourceVersion: "gemini-code-assist-quota",
                        providerPayload: .gemini(try ProviderTelemetryJSONDecoder.make().decode(
                            GeminiTelemetryPayload.self,
                            from: Fixtures.geminiRetrieveUserQuota
                        ))
                    )
                )
            ]
        )
        var now = Fixtures.date("2026-04-16T17:55:00Z")
        let coordinator = ProviderTelemetryCoordinator(
            clients: [.gemini: telemetryClient],
            store: InMemoryProviderTelemetryStore(),
            now: { now }
        )

        _ = try await coordinator.refresh(.gemini, reason: .scheduled, passiveSnapshot: nil)
        _ = try await coordinator.refresh(.gemini, reason: .scheduled, passiveSnapshot: nil)
        let degraded = try await coordinator.refresh(.gemini, reason: .scheduled, passiveSnapshot: nil)

        XCTAssertEqual(degraded.status, .degraded)
        XCTAssertEqual(degraded.failureCount, 3)
        XCTAssertNotNil(degraded.nextRefreshAt)
        XCTAssertEqual(telemetryClient.refreshCount, 3)

        now = now.addingTimeInterval(60)
        let skipped = try await coordinator.refresh(.gemini, reason: .scheduled, passiveSnapshot: nil)
        XCTAssertEqual(skipped.status, .degraded)
        XCTAssertEqual(telemetryClient.refreshCount, 3, "Scheduled refresh should honor backoff")

        let recovered = try await coordinator.refresh(.gemini, reason: .manual, passiveSnapshot: nil)
        XCTAssertEqual(recovered.status, .exact)
        XCTAssertEqual(recovered.failureCount, 0)
        XCTAssertEqual(telemetryClient.refreshCount, 4, "Manual refresh should bypass backoff")
    }
}

// MARK: - Redaction And Persistence Contract

final class ProviderTelemetryPrivacyContractTests: XCTestCase {
    func testDiagnosticsRedactTokensCookiesAuthHeadersAndAccountIds() {
        let raw = """
        Authorization: Bearer codex-secret-token
        Cookie: session=chatgpt-cookie-value; other=value
        x-openai-account-id: acct_secret_123
        access_token=gemini-secret-token
        refresh_token=gemini-refresh-token
        """

        let redacted = ProviderTelemetryDiagnostics.redact(raw)

        XCTAssertFalse(redacted.contains("codex-secret-token"))
        XCTAssertFalse(redacted.contains("chatgpt-cookie-value"))
        XCTAssertFalse(redacted.contains("acct_secret_123"))
        XCTAssertFalse(redacted.contains("gemini-secret-token"))
        XCTAssertFalse(redacted.contains("gemini-refresh-token"))
        XCTAssertTrue(redacted.contains("[redacted]"))
    }

    func testTelemetryStoreDoesNotPersistRawResponsesOrPrompts() throws {
        let store = InMemoryProviderTelemetryStore()
        let snapshot = ProviderTelemetrySnapshot(
            providerId: .codex,
            accountLabel: "Personal Codex",
            status: .exact,
            confidence: .providerSupplied,
            lastRefreshAt: Fixtures.date("2026-04-16T17:55:00Z"),
            nextRefreshAt: nil,
            failureCount: 0,
            degradedReason: nil,
            rawSourceVersion: "codex-wham-usage",
            providerPayload: .codex(try ProviderTelemetryJSONDecoder.make().decode(
                CodexTelemetryPayload.self,
                from: Fixtures.codexWhamUsage
            )),
            rawResponseData: Fixtures.codexWhamUsage,
            diagnosticText: "prompt: explain private code\nresponse: private answer"
        )

        try store.save(snapshot)
        let persisted = try XCTUnwrap(store.snapshot(for: .codex))

        XCTAssertNil(persisted.rawResponseData)
        XCTAssertFalse(persisted.diagnosticText?.contains("explain private code") == true)
        XCTAssertFalse(persisted.diagnosticText?.contains("private answer") == true)
    }
}

// MARK: - Adapter Fallback Contract

final class ProviderTelemetryAdapterFallbackContractTests: XCTestCase {
    func testCodexAdapterKeepsPassiveSnapshotWhenTelemetryUnavailable() throws {
        let passive = ProviderSnapshot.codexRich(
            estimate: CodexEstimate(confidence: .estimated),
            isEnabled: true
        )
        let telemetry = ProviderTelemetrySnapshot.unavailable(
            providerId: .codex,
            reason: "CLI auth unavailable",
            passiveSnapshot: passive
        )

        let merged = ProviderTelemetryAdapterBridge.merge(passiveSnapshot: passive, telemetrySnapshot: telemetry)

        XCTAssertEqual(merged.id, .codex)
        XCTAssertEqual(merged.providerTelemetry?.status, .unavailable)
        XCTAssertEqual(merged.providerTelemetry?.confidence, .passiveFallback)
        guard case let .codexRich(estimate, _) = merged else {
            return XCTFail("Expected passive Codex snapshot to remain visible")
        }
        XCTAssertEqual(estimate.confidence, .estimated)
    }

    func testGeminiAdapterKeepsPassiveSnapshotWhenTelemetryDegraded() throws {
        let passive = ProviderSnapshot.geminiRich(
            estimate: GeminiEstimate(
                confidence: .estimated,
                ratePressure: nil,
                authMode: .oauthPersonal
            ),
            isEnabled: true
        )
        let telemetry = ProviderTelemetrySnapshot.degraded(
            providerId: .gemini,
            reason: "Provider endpoint changed",
            failureCount: 3,
            passiveSnapshot: passive
        )

        let merged = ProviderTelemetryAdapterBridge.merge(passiveSnapshot: passive, telemetrySnapshot: telemetry)

        XCTAssertEqual(merged.id, .gemini)
        XCTAssertEqual(merged.providerTelemetry?.status, .degraded)
        XCTAssertEqual(merged.providerTelemetry?.confidence, .passiveFallback)
        guard case let .geminiRich(estimate, _) = merged else {
            return XCTFail("Expected passive Gemini snapshot to remain visible")
        }
        XCTAssertEqual(estimate.confidence, .estimated)
    }
}

// MARK: - Test Doubles

private final class RecordingProviderTelemetryHTTPClient: ProviderTelemetryHTTPClient {
    private var responses: [Result<ProviderTelemetryHTTPResponse, Error>]
    private(set) var requests: [URLRequest] = []

    init(responses: [Result<ProviderTelemetryHTTPResponse, Error>]) {
        self.responses = responses
    }

    func send(_ request: URLRequest) async throws -> ProviderTelemetryHTTPResponse {
        requests.append(request)
        guard !responses.isEmpty else {
            throw ProviderTelemetryError.network("No fake response queued")
        }
        return try responses.removeFirst().get()
    }

    func decodedJSONBody(at index: Int) -> [String: Any]? {
        guard index < requests.count,
              let body = requests[index].httpBody,
              let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else {
            return nil
        }
        return json
    }
}

private final class StubCodexTelemetryAuthProvider: CodexTelemetryAuthProviding {
    private let auth: CodexTelemetryAuth

    init(auth: CodexTelemetryAuth) {
        self.auth = auth
    }

    func currentAuth() throws -> CodexTelemetryAuth {
        auth
    }
}

private final class StubGeminiTelemetryAuthProvider: GeminiTelemetryAuthProviding {
    private let auth: GeminiTelemetryAuth

    init(auth: GeminiTelemetryAuth) {
        self.auth = auth
    }

    func currentAuth() throws -> GeminiTelemetryAuth {
        auth
    }
}

private final class ScriptedProviderTelemetryClient: ProviderTelemetryClient {
    private var results: [Result<ProviderTelemetrySnapshot, Error>]
    private(set) var refreshCount = 0

    init(results: [Result<ProviderTelemetrySnapshot, Error>]) {
        self.results = results
    }

    func refresh() async throws -> ProviderTelemetrySnapshot {
        refreshCount += 1
        guard !results.isEmpty else {
            throw ProviderTelemetryError.network("No fake response queued")
        }
        return try results.removeFirst().get()
    }
}

private enum ProviderTelemetryJSONDecoder {
    static func make() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = Fixtures.iso.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO8601 date: \(value)"
            )
        }
        return decoder
    }
}

private enum Fixtures {
    static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func date(_ value: String) -> Date {
        guard let date = iso.date(from: value) else {
            fatalError("Invalid fixture date: \(value)")
        }
        return date
    }

    static let codexWhamUsage = Data(
        """
        {
          "plan_type": "pro",
          "balance": {
            "amount": 42,
            "unit": "credits"
          },
          "rate_limits": [
            {
              "limit_id": "gpt-5-window",
              "limit_name": "GPT-5 usage",
              "window_label": "5h",
              "used_percent": 61.5,
              "resets_at": "2026-04-16T18:00:00Z",
              "window_duration": 18000,
              "has_credits": true,
              "unlimited": false
            },
            {
              "limit_id": "weekly-window",
              "limit_name": "Weekly usage",
              "window_label": "7d",
              "used_percent": 14.0,
              "resets_at": "2026-04-20T00:00:00Z",
              "window_duration": 604800,
              "has_credits": false,
              "unlimited": false
            }
          ]
        }
        """.utf8
    )

    static let geminiRetrieveUserQuota = Data(
        """
        {
          "quota_buckets": [
            {
              "model_id": "gemini-2.5-pro",
              "token_type": "requests",
              "remaining_amount": 87,
              "remaining_fraction": 0.87,
              "reset_time": "2026-04-17T00:00:00Z"
            },
            {
              "model_id": "gemini-2.5-flash",
              "token_type": "tokens",
              "remaining_amount": 50000,
              "remaining_fraction": 0.5,
              "reset_time": "2026-04-16T18:55:00Z"
            }
          ]
        }
        """.utf8
    )
}
