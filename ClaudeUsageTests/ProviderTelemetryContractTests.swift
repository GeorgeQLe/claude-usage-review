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

// MARK: - Provider Telemetry Presentation Contract

final class ProviderTelemetryPresentationContractTests: XCTestCase {
    override func setUp() {
        super.setUp()
        ProviderTelemetryAttachmentRegistry.removeAll()
    }

    override func tearDown() {
        ProviderTelemetryAttachmentRegistry.removeAll()
        super.tearDown()
    }

    func testCodexProviderCardSurfacesRateLimitTelemetry() throws {
        let passive = ProviderSnapshot.codexRich(
            estimate: CodexEstimate(confidence: .estimated),
            isEnabled: true
        )
        let telemetry = ProviderTelemetrySnapshot(
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

        let merged = ProviderTelemetryAdapterBridge.merge(passiveSnapshot: passive, telemetrySnapshot: telemetry)
        let shell = ProviderCoordinator().makeShellState(providers: [merged], now: telemetry.lastRefreshAt!)
        let card = try XCTUnwrap(shell.providers.first)

        XCTAssertEqual(card.telemetryStatusText, "Provider Telemetry: exact")
        XCTAssertTrue(card.telemetryDetails.contains { $0.label == "Account" && $0.value == "Personal Codex" })
        XCTAssertTrue(card.telemetryDetails.contains { $0.label == "Plan" && $0.value == "pro" })
        XCTAssertTrue(card.telemetryDetails.contains { $0.label == "GPT-5 usage" && $0.value.contains("61.5% used") })
        XCTAssertTrue(card.telemetryRefreshText?.contains("Last refresh") == true)
    }

    func testGeminiProviderCardSurfacesQuotaTelemetry() throws {
        let passive = ProviderSnapshot.geminiRich(
            estimate: GeminiEstimate(confidence: .estimated, ratePressure: nil, authMode: .oauthPersonal),
            isEnabled: true
        )
        let telemetry = ProviderTelemetrySnapshot(
            providerId: .gemini,
            accountLabel: "Work Google",
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

        let merged = ProviderTelemetryAdapterBridge.merge(passiveSnapshot: passive, telemetrySnapshot: telemetry)
        let shell = ProviderCoordinator().makeShellState(providers: [merged], now: telemetry.lastRefreshAt!)
        let card = try XCTUnwrap(shell.providers.first)

        XCTAssertEqual(card.telemetryStatusText, "Provider Telemetry: exact")
        XCTAssertTrue(card.telemetryDetails.contains { $0.label == "Account" && $0.value == "Work Google" })
        XCTAssertTrue(card.telemetryDetails.contains { $0.label == "gemini-2.5-pro requests" && $0.value.contains("87 remaining") })
        XCTAssertTrue(card.telemetryDetails.contains { $0.label == "gemini-2.5-flash tokens" && $0.value.contains("50000 remaining") })
    }

    func testDegradedTelemetryReasonDoesNotHidePassiveProviderState() throws {
        let passive = ProviderSnapshot.codexRich(
            estimate: CodexEstimate(confidence: .estimated),
            isEnabled: true
        )
        let telemetry = ProviderTelemetrySnapshot.degraded(
            providerId: .codex,
            reason: "Provider endpoint changed",
            failureCount: 3,
            passiveSnapshot: passive,
            nextRefreshAt: Fixtures.date("2026-04-16T18:25:00Z")
        )

        let merged = ProviderTelemetryAdapterBridge.merge(passiveSnapshot: passive, telemetrySnapshot: telemetry)
        let shell = ProviderCoordinator().makeShellState(providers: [merged], now: Fixtures.date("2026-04-16T17:55:00Z"))
        let card = try XCTUnwrap(shell.providers.first)

        XCTAssertEqual(card.cardState, .configured)
        XCTAssertEqual(card.headline, "Codex — Estimated")
        XCTAssertEqual(card.telemetryStatusText, "Provider Telemetry: degraded")
        XCTAssertTrue(card.telemetryDetails.contains { $0.label == "Reason" && $0.value == "Provider endpoint changed" })
    }

    func testManualProviderTelemetryRefreshAttachesSnapshotAndMarksCardRefreshable() async throws {
        let suiteName = "com.claudeusage.provider-telemetry-presentation.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let settings = ProviderSettingsStore(defaults: defaults)
        settings.setEnabled(.codex, true)
        settings.setProviderTelemetryEnabled(true, for: .codex)

        let telemetryClient = ScriptedProviderTelemetryClient(
            results: [
                .success(
                    ProviderTelemetrySnapshot(
                        providerId: .codex,
                        accountLabel: "Personal Codex",
                        status: .exact,
                        confidence: .providerSupplied,
                        lastRefreshAt: nil,
                        nextRefreshAt: nil,
                        failureCount: 0,
                        degradedReason: nil,
                        rawSourceVersion: "codex-wham-usage",
                        providerPayload: .codex(try ProviderTelemetryJSONDecoder.make().decode(
                            CodexTelemetryPayload.self,
                            from: Fixtures.codexWhamUsage
                        ))
                    )
                )
            ]
        )
        let telemetryCoordinator = ProviderTelemetryCoordinator(
            clients: [.codex: telemetryClient],
            store: InMemoryProviderTelemetryStore(),
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )
        let viewModel = ProviderShellViewModel(
            settingsStore: settings,
            codexSnapshot: .codexRich(estimate: CodexEstimate(confidence: .estimated), isEnabled: true),
            codexLastRefreshTime: Fixtures.date("2026-04-16T17:55:00Z"),
            geminiSnapshot: .gemini(status: .missingConfiguration, isEnabled: false),
            geminiLastRefreshTime: nil,
            nowProvider: { Fixtures.date("2026-04-16T17:55:00Z") },
            providerTelemetryCoordinator: telemetryCoordinator
        )

        let refreshed = await viewModel.refreshProviderTelemetry(.codex)
        let card = try XCTUnwrap(viewModel.shellState.providers.first { $0.id == .codex })

        XCTAssertEqual(refreshed?.status, .exact)
        XCTAssertEqual(ProviderTelemetryAttachmentRegistry.snapshot(for: .codex)?.status, .exact)
        XCTAssertTrue(card.supportsProviderTelemetryRefresh)
        XCTAssertFalse(card.telemetryDetails.isEmpty)
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

// MARK: - Codex Telemetry Contract

final class CodexTelemetryContractTests: XCTestCase {
    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("codex-telemetry-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testCodexAuthProviderDetectsChatGPTBackedCLIAuthWithoutLeakingAccountId() throws {
        try writeAuthJSON(
            """
            {
              "auth_mode": "chatgpt",
              "tokens": {
                "id_token": "\(Self.jwt(email: "codex-user@example.com", accountId: "acct_secret_123"))",
                "access_token": "codex-chatgpt-token",
                "refresh_token": "codex-refresh-token",
                "account_id": "acct_secret_123"
              }
            }
            """
        )

        let provider = CodexTelemetryAuthProvider(codexHome: tempDir, fileManager: fileManager)
        let auth = try provider.currentAuth()

        guard case let .chatGPT(accessToken, accountLabel) = auth else {
            return XCTFail("Expected ChatGPT-backed Codex auth")
        }
        XCTAssertEqual(accessToken, "codex-chatgpt-token")
        XCTAssertEqual(accountLabel, "codex-user@example.com")
        XCTAssertNotEqual(accountLabel, "acct_secret_123")
    }

    func testCodexAuthProviderDetectsCodexAPIAuthAndConfiguredBaseURL() throws {
        try writeConfigTOML(
            """
            model = "gpt-5-codex"

            [model_providers.openai]
            base_url = "https://codex-api.example.com"
            """
        )
        try writeAuthJSON(
            """
            {
              "auth_mode": "apikey",
              "OPENAI_API_KEY": "sk-codex-api-secret"
            }
            """
        )

        let provider = CodexTelemetryAuthProvider(codexHome: tempDir, fileManager: fileManager)
        let auth = try provider.currentAuth()

        guard case let .codexAPI(baseURL, apiKey, accountLabel) = auth else {
            return XCTFail("Expected Codex API auth")
        }
        XCTAssertEqual(baseURL.absoluteString, "https://codex-api.example.com")
        XCTAssertEqual(apiKey, "sk-codex-api-secret")
        XCTAssertEqual(accountLabel, "Codex API")
    }

    func testCodexTelemetryClientUsesCodexAPIBaseURL() async throws {
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
                auth: .codexAPI(
                    baseURL: URL(string: "https://codex-api.example.com")!,
                    apiKey: "sk-codex-api-secret",
                    accountLabel: "Codex API"
                )
            ),
            httpClient: httpClient,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )

        let snapshot = try await client.refresh()

        XCTAssertEqual(httpClient.requests.count, 1)
        XCTAssertEqual(
            httpClient.requests[0].url?.absoluteString,
            "https://codex-api.example.com/api/codex/usage"
        )
        XCTAssertEqual(httpClient.requests[0].value(forHTTPHeaderField: "authorization"), "Bearer sk-codex-api-secret")
        XCTAssertEqual(snapshot.status, .exact)
        XCTAssertEqual(snapshot.rawSourceVersion, "codex-api-usage")
        XCTAssertNil(snapshot.rawResponseData)
    }

    func testCodexAuthProviderReportsMissingEncryptedExpiredAndMalformedAuth() throws {
        let missingProvider = CodexTelemetryAuthProvider(codexHome: tempDir, fileManager: fileManager)
        XCTAssertThrowsError(try missingProvider.currentAuth()) { error in
            XCTAssertEqual(error as? ProviderTelemetryError, .authUnavailable("Codex CLI auth unavailable"))
        }

        try writeConfigTOML("auth_credentials_store = \"keyring\"\n")
        let keyringProvider = CodexTelemetryAuthProvider(codexHome: tempDir, fileManager: fileManager)
        XCTAssertThrowsError(try keyringProvider.currentAuth()) { error in
            XCTAssertEqual(
                error as? ProviderTelemetryError,
                .unsupportedCredentials("Codex CLI credentials are stored in an unsupported encrypted store")
            )
        }

        try writeAuthJSON(
            """
            {
              "auth_mode": "chatgpt",
              "expires_at": "2026-04-01T00:00:00Z",
              "tokens": {
                "access_token": "expired-token",
                "refresh_token": "refresh-token"
              }
            }
            """
        )
        let expiredProvider = CodexTelemetryAuthProvider(
            codexHome: tempDir,
            fileManager: fileManager,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )
        XCTAssertThrowsError(try expiredProvider.currentAuth()) { error in
            XCTAssertEqual(error as? ProviderTelemetryError, .authUnavailable("Codex CLI auth expired"))
        }

        try "{not-valid-json".write(
            to: tempDir.appendingPathComponent("auth.json"),
            atomically: true,
            encoding: .utf8
        )
        let malformedProvider = CodexTelemetryAuthProvider(codexHome: tempDir, fileManager: fileManager)
        XCTAssertThrowsError(try malformedProvider.currentAuth()) { error in
            XCTAssertEqual(error as? ProviderTelemetryError, .authUnavailable("Malformed Codex CLI auth"))
        }
    }

    func testCodexTelemetryClientTreatsEndpointShapeDriftAsUnavailableFailure() async throws {
        let httpClient = RecordingProviderTelemetryHTTPClient(
            responses: [
                .success(
                    ProviderTelemetryHTTPResponse(
                        statusCode: 200,
                        headers: ["content-type": "application/json"],
                        body: Data(#"{"unexpected":"shape","access_token":"secret"}"#.utf8)
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

        do {
            _ = try await client.refresh()
            XCTFail("Expected endpoint shape drift to throw")
        } catch let error as ProviderTelemetryError {
            guard case let .endpointShapeChanged(reason) = error else {
                return XCTFail("Expected endpointShapeChanged, got \(error)")
            }
            XCTAssertTrue(reason.contains("Codex usage response shape changed"))
            XCTAssertFalse(reason.contains("secret"))
        }
    }

    func testCodexDiagnosticsRedactRawAuthJSONAndAPIKeys() {
        let raw = """
        {"OPENAI_API_KEY":"sk-codex-api-secret","tokens":{"access_token":"codex-access-secret","refresh_token":"codex-refresh-secret","account_id":"acct_secret_123"}}
        """

        let redacted = ProviderTelemetryDiagnostics.redact(raw)

        XCTAssertFalse(redacted.contains("sk-codex-api-secret"))
        XCTAssertFalse(redacted.contains("codex-access-secret"))
        XCTAssertFalse(redacted.contains("codex-refresh-secret"))
        XCTAssertFalse(redacted.contains("acct_secret_123"))
        XCTAssertTrue(redacted.contains("[redacted]"))
    }

    private func writeAuthJSON(_ contents: String) throws {
        try contents.write(
            to: tempDir.appendingPathComponent("auth.json"),
            atomically: true,
            encoding: .utf8
        )
    }

    private func writeConfigTOML(_ contents: String) throws {
        try contents.write(
            to: tempDir.appendingPathComponent("config.toml"),
            atomically: true,
            encoding: .utf8
        )
    }

    private static func jwt(email: String, accountId: String) -> String {
        let header = #"{"alg":"none"}"#.data(using: .utf8)!.base64URLEncodedString()
        let payload = """
        {"email":"\(email)","https://api.openai.com/auth":{"chatgpt_account_id":"\(accountId)","chatgpt_plan_type":"pro"}}
        """
        .data(using: .utf8)!
        .base64URLEncodedString()
        return "\(header).\(payload).signature"
    }
}

// MARK: - Gemini Telemetry Contract

final class GeminiTelemetryContractTests: XCTestCase {
    private var tempDir: URL!
    private let fileManager = FileManager.default

    override func setUp() {
        super.setUp()
        tempDir = fileManager.temporaryDirectory
            .appendingPathComponent("gemini-telemetry-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? fileManager.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    func testGeminiAuthProviderDetectsCodeAssistOAuthWithoutLeakingAccountId() throws {
        try writeSettingsJSON(
            """
            {
              "security": {
                "auth": {
                  "selectedType": "code-assist",
                  "projectId": "cloud-ai-companion-project"
                }
              }
            }
            """
        )
        try writeOAuthCredsJSON(
            """
            {
              "access_token": "gemini-code-assist-token",
              "refresh_token": "gemini-refresh-token",
              "expiry": "2026-05-01T00:00:00Z",
              "email": "gemini-user@example.com",
              "account_id": "acct_google_secret_123"
            }
            """
        )

        let provider = GeminiTelemetryAuthProvider(
            geminiHome: tempDir,
            fileManager: fileManager,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )
        let auth = try provider.currentAuth()

        guard case let .codeAssistOAuth(accessToken, projectId, accountLabel) = auth else {
            return XCTFail("Expected Code Assist OAuth auth")
        }
        XCTAssertEqual(accessToken, "gemini-code-assist-token")
        XCTAssertEqual(projectId, "cloud-ai-companion-project")
        XCTAssertEqual(accountLabel, "gemini-user@example.com")
        XCTAssertNotEqual(accountLabel, "acct_google_secret_123")
    }

    func testGeminiAuthProviderDiscoversProjectIdFromOAuthCredentials() throws {
        try writeSettingsJSON(
            """
            {"security":{"auth":{"selectedType":"code-assist"}}}
            """
        )
        try writeOAuthCredsJSON(
            """
            {
              "access_token": "gemini-code-assist-token",
              "refresh_token": "gemini-refresh-token",
              "expiry": "2026-05-01T00:00:00Z",
              "quota_project_id": "quota-project-from-creds"
            }
            """
        )

        let provider = GeminiTelemetryAuthProvider(
            geminiHome: tempDir,
            fileManager: fileManager,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )

        guard case let .codeAssistOAuth(_, projectId, _) = try provider.currentAuth() else {
            return XCTFail("Expected Code Assist OAuth auth")
        }
        XCTAssertEqual(projectId, "quota-project-from-creds")
    }

    func testGeminiAuthProviderReportsMissingEncryptedExpiredUnsupportedAndMalformedAuth() throws {
        let missingProvider = GeminiTelemetryAuthProvider(geminiHome: tempDir, fileManager: fileManager)
        XCTAssertThrowsError(try missingProvider.currentAuth()) { error in
            XCTAssertEqual(error as? ProviderTelemetryError, .authUnavailable("Gemini Code Assist auth unavailable"))
        }

        try writeSettingsJSON(
            """
            {"security":{"auth":{"selectedType":"code-assist","credentialStore":"keychain"}}}
            """
        )
        let encryptedProvider = GeminiTelemetryAuthProvider(geminiHome: tempDir, fileManager: fileManager)
        XCTAssertThrowsError(try encryptedProvider.currentAuth()) { error in
            XCTAssertEqual(
                error as? ProviderTelemetryError,
                .unsupportedCredentials("Gemini Code Assist credentials are stored in an unsupported encrypted store")
            )
        }

        try writeSettingsJSON(
            """
            {"security":{"auth":{"selectedType":"api-key"}}}
            """
        )
        try writeOAuthCredsJSON(
            """
            {"access_token":"not-code-assist","project_id":"wrong-mode-project"}
            """
        )
        let unsupportedProvider = GeminiTelemetryAuthProvider(geminiHome: tempDir, fileManager: fileManager)
        XCTAssertThrowsError(try unsupportedProvider.currentAuth()) { error in
            XCTAssertEqual(
                error as? ProviderTelemetryError,
                .unsupportedCredentials("Gemini Code Assist telemetry requires Code Assist OAuth credentials")
            )
        }

        try writeSettingsJSON(
            """
            {"security":{"auth":{"selectedType":"code-assist","projectId":"cloud-ai-companion-project"}}}
            """
        )
        try writeOAuthCredsJSON(
            """
            {
              "access_token": "expired-token",
              "refresh_token": "refresh-token",
              "expiry": "2026-04-01T00:00:00Z"
            }
            """
        )
        let expiredProvider = GeminiTelemetryAuthProvider(
            geminiHome: tempDir,
            fileManager: fileManager,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )
        XCTAssertThrowsError(try expiredProvider.currentAuth()) { error in
            XCTAssertEqual(error as? ProviderTelemetryError, .authUnavailable("Gemini Code Assist auth expired"))
        }

        try "{not-valid-json".write(
            to: tempDir.appendingPathComponent("oauth_creds.json"),
            atomically: true,
            encoding: .utf8
        )
        let malformedProvider = GeminiTelemetryAuthProvider(geminiHome: tempDir, fileManager: fileManager)
        XCTAssertThrowsError(try malformedProvider.currentAuth()) { error in
            XCTAssertEqual(error as? ProviderTelemetryError, .authUnavailable("Malformed Gemini Code Assist auth"))
        }
    }

    func testGeminiTelemetryClientTreatsEndpointShapeDriftAsUnavailableFailure() async throws {
        let httpClient = RecordingProviderTelemetryHTTPClient(
            responses: [
                .success(
                    ProviderTelemetryHTTPResponse(
                        statusCode: 200,
                        headers: ["content-type": "application/json"],
                        body: Data(#"{"unexpected":"shape","access_token":"gemini-secret"}"#.utf8)
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

        do {
            _ = try await client.refresh()
            XCTFail("Expected endpoint shape drift to throw")
        } catch let error as ProviderTelemetryError {
            guard case let .endpointShapeChanged(reason) = error else {
                return XCTFail("Expected endpointShapeChanged, got \(error)")
            }
            XCTAssertTrue(reason.contains("Gemini quota response shape changed"))
            XCTAssertFalse(reason.contains("gemini-secret"))
        }
    }

    func testGeminiDiagnosticsRedactRawCredentialJSON() {
        let raw = """
        {"access_token":"gemini-access-secret","refresh_token":"gemini-refresh-secret","account_id":"acct_google_secret_123","client_secret":"google-client-secret"}
        """

        let redacted = ProviderTelemetryDiagnostics.redact(raw)

        XCTAssertFalse(redacted.contains("gemini-access-secret"))
        XCTAssertFalse(redacted.contains("gemini-refresh-secret"))
        XCTAssertFalse(redacted.contains("acct_google_secret_123"))
        XCTAssertFalse(redacted.contains("google-client-secret"))
        XCTAssertTrue(redacted.contains("[redacted]"))
    }

    private func writeSettingsJSON(_ contents: String) throws {
        try contents.write(
            to: tempDir.appendingPathComponent("settings.json"),
            atomically: true,
            encoding: .utf8
        )
    }

    private func writeOAuthCredsJSON(_ contents: String) throws {
        try contents.write(
            to: tempDir.appendingPathComponent("oauth_creds.json"),
            atomically: true,
            encoding: .utf8
        )
    }
}

// MARK: - Refresh And Fallback Contract

final class ProviderTelemetryRefreshContractTests: XCTestCase {
    override func setUp() {
        super.setUp()
        ProviderTelemetryAttachmentRegistry.removeAll()
    }

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

    func testScheduledRefreshHonorsNextRefreshAtUntilDue() async throws {
        let refreshTime = Fixtures.date("2026-04-16T17:55:00Z")
        let telemetryClient = ScriptedProviderTelemetryClient(
            results: [
                .success(
                    ProviderTelemetrySnapshot(
                        providerId: .codex,
                        accountLabel: "Personal Codex",
                        status: .exact,
                        confidence: .providerSupplied,
                        lastRefreshAt: refreshTime,
                        nextRefreshAt: refreshTime.addingTimeInterval(300),
                        failureCount: 0,
                        degradedReason: nil,
                        rawSourceVersion: "codex-wham-usage",
                        providerPayload: .codex(try ProviderTelemetryJSONDecoder.make().decode(
                            CodexTelemetryPayload.self,
                            from: Fixtures.codexWhamUsage
                        ))
                    )
                ),
                .failure(ProviderTelemetryError.network("should not be called before due time"))
            ]
        )
        var now = refreshTime
        let coordinator = ProviderTelemetryCoordinator(
            clients: [.codex: telemetryClient],
            store: InMemoryProviderTelemetryStore(),
            now: { now }
        )

        let supplied = try await coordinator.refresh(.codex, reason: .scheduled, passiveSnapshot: nil)
        XCTAssertEqual(supplied.status, .exact)
        XCTAssertEqual(telemetryClient.refreshCount, 1)

        now = refreshTime.addingTimeInterval(60)
        let skipped = try await coordinator.refresh(.codex, reason: .scheduled, passiveSnapshot: nil)
        XCTAssertEqual(skipped.status, .exact)
        XCTAssertEqual(telemetryClient.refreshCount, 1)
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
        now = now.addingTimeInterval(ProviderTelemetryCoordinator.refreshCadence + 1)
        _ = try await coordinator.refresh(.gemini, reason: .scheduled, passiveSnapshot: nil)
        now = now.addingTimeInterval((ProviderTelemetryCoordinator.refreshCadence * 2) + 1)
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

    func testDisabledProviderTelemetryDoesNotCallClientOrPersistSnapshot() async throws {
        let telemetryClient = ScriptedProviderTelemetryClient(
            results: [
                .failure(ProviderTelemetryError.network("disabled providers should not refresh"))
            ]
        )
        let store = InMemoryProviderTelemetryStore()
        let coordinator = ProviderTelemetryCoordinator(
            clients: [.codex: telemetryClient],
            store: store,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )

        let result = try await coordinator.refreshIfEnabled(
            .codex,
            telemetryEnabled: false,
            reason: .scheduled,
            passiveSnapshot: nil
        )

        XCTAssertNil(result)
        XCTAssertEqual(telemetryClient.refreshCount, 0)
        XCTAssertNil(try store.snapshot(for: .codex))
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

    func testUserDefaultsTelemetryStorePersistsOnlySanitizedNormalizedSnapshot() throws {
        let suiteName = "com.claudeusage.provider-telemetry-store.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let store = UserDefaultsProviderTelemetryStore(defaults: defaults)
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
            providerPayload: .codex(try ProviderTelemetryJSONDecoder.make().decode(
                CodexTelemetryPayload.self,
                from: Fixtures.codexWhamUsage
            )),
            passiveSnapshot: .codexRich(estimate: CodexEstimate(confidence: .estimated), isEnabled: true),
            rawResponseData: Fixtures.codexWhamUsage,
            diagnosticText: "prompt: explain private code\nresponse: private answer"
        )

        try store.save(snapshot)
        let persisted = try XCTUnwrap(store.snapshot(for: .codex))

        XCTAssertEqual(persisted.providerId, .codex)
        XCTAssertEqual(persisted.accountLabel, "Personal Codex")
        XCTAssertEqual(persisted.status, .exact)
        XCTAssertEqual(persisted.confidence, .providerSupplied)
        XCTAssertNil(persisted.passiveSnapshot)
        XCTAssertNil(persisted.rawResponseData)
        XCTAssertNil(persisted.diagnosticText)
        guard case let .codex(payload) = persisted.providerPayload else {
            return XCTFail("Expected persisted Codex payload")
        }
        XCTAssertEqual(payload.rateLimits.count, 2)
    }
}

// MARK: - Adapter Fallback Contract

final class ProviderTelemetryAdapterFallbackContractTests: XCTestCase {
    override func setUp() {
        super.setUp()
        ProviderTelemetryAttachmentRegistry.removeAll()
    }

    override func tearDown() {
        ProviderTelemetryAttachmentRegistry.removeAll()
        super.tearDown()
    }

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

    func testProviderShellViewModelAttachesStoredTelemetryOnlyWhenOptedIn() throws {
        let suiteName = "com.claudeusage.provider-telemetry-shell.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let settings = ProviderSettingsStore(defaults: defaults)
        settings.setEnabled(.codex, true)
        settings.setProviderTelemetryEnabled(true, for: .codex)

        let store = InMemoryProviderTelemetryStore()
        try store.save(
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
        )
        let telemetryCoordinator = ProviderTelemetryCoordinator(
            clients: [:],
            store: store,
            now: { Fixtures.date("2026-04-16T17:55:00Z") }
        )

        let viewModel = ProviderShellViewModel(
            settingsStore: settings,
            codexSnapshot: .codexRich(estimate: CodexEstimate(confidence: .estimated), isEnabled: true),
            codexLastRefreshTime: Fixtures.date("2026-04-16T17:55:00Z"),
            geminiSnapshot: .gemini(status: .missingConfiguration, isEnabled: false),
            geminiLastRefreshTime: nil,
            nowProvider: { Fixtures.date("2026-04-16T17:55:00Z") },
            providerTelemetryCoordinator: telemetryCoordinator
        )

        XCTAssertFalse(viewModel.shellState.providers.isEmpty)
        XCTAssertEqual(ProviderTelemetryAttachmentRegistry.snapshot(for: .codex)?.status, .exact)
        XCTAssertEqual(
            ProviderTelemetryAttachmentRegistry.snapshot(for: .codex)?.confidence,
            .providerSupplied
        )

        settings.setProviderTelemetryEnabled(false, for: .codex)
        let disabledViewModel = ProviderShellViewModel(
            settingsStore: settings,
            codexSnapshot: .codexRich(estimate: CodexEstimate(confidence: .estimated), isEnabled: true),
            codexLastRefreshTime: Fixtures.date("2026-04-16T17:55:00Z"),
            geminiSnapshot: .gemini(status: .missingConfiguration, isEnabled: false),
            geminiLastRefreshTime: nil,
            nowProvider: { Fixtures.date("2026-04-16T17:55:00Z") },
            providerTelemetryCoordinator: telemetryCoordinator
        )

        XCTAssertFalse(disabledViewModel.shellState.providers.isEmpty)
        XCTAssertNil(ProviderTelemetryAttachmentRegistry.snapshot(for: .codex))
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

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
