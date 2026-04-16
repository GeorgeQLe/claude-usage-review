import Foundation

final class CodexTelemetryClient: ProviderTelemetryClient {
    private let authProvider: CodexTelemetryAuthProviding
    private let httpClient: ProviderTelemetryHTTPClient
    private let now: () -> Date
    private let decoder: JSONDecoder

    init(
        authProvider: CodexTelemetryAuthProviding,
        httpClient: ProviderTelemetryHTTPClient,
        now: @escaping () -> Date = Date.init,
        decoder: JSONDecoder = ProviderTelemetryJSON.makeDecoder()
    ) {
        self.authProvider = authProvider
        self.httpClient = httpClient
        self.now = now
        self.decoder = decoder
    }

    func refresh() async throws -> ProviderTelemetrySnapshot {
        let auth = try authProvider.currentAuth()
        var request = URLRequest(url: endpoint(for: auth))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "accept")

        switch auth {
        case let .chatGPT(accessToken, _):
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "authorization")
        case let .codexAPI(_, apiKey, _):
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "authorization")
        }

        let response = try await httpClient.send(request)
        guard (200..<300).contains(response.statusCode) else {
            throw ProviderTelemetryError.httpStatus(response.statusCode)
        }

        let payload = try decoder.decode(CodexTelemetryPayload.self, from: response.body)
        let refreshTime = now()
        return ProviderTelemetrySnapshot(
            providerId: .codex,
            accountLabel: auth.accountLabel,
            status: .exact,
            confidence: .providerSupplied,
            lastRefreshAt: refreshTime,
            nextRefreshAt: refreshTime.addingTimeInterval(300),
            failureCount: 0,
            degradedReason: nil,
            rawSourceVersion: "codex-wham-usage",
            providerPayload: .codex(payload)
        )
    }

    private func endpoint(for auth: CodexTelemetryAuth) -> URL {
        switch auth {
        case .chatGPT:
            return URL(string: "https://chatgpt.com/backend-api/wham/usage")!
        case let .codexAPI(baseURL, _, _):
            return baseURL.appendingPathComponent("api/codex/usage")
        }
    }
}
