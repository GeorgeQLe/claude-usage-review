import Foundation

final class GeminiTelemetryClient: ProviderTelemetryClient {
    private let authProvider: GeminiTelemetryAuthProviding
    private let httpClient: ProviderTelemetryHTTPClient
    private let now: () -> Date
    private let decoder: JSONDecoder

    init(
        authProvider: GeminiTelemetryAuthProviding,
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
        let endpoint = URL(string: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota")!
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("application/json", forHTTPHeaderField: "accept")

        let projectId: String
        switch auth {
        case let .codeAssistOAuth(accessToken, project, _):
            projectId = project
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "authorization")
        }

        request.httpBody = try JSONSerialization.data(
            withJSONObject: ["project": projectId],
            options: []
        )

        let response = try await httpClient.send(request)
        guard (200..<300).contains(response.statusCode) else {
            throw ProviderTelemetryError.httpStatus(response.statusCode)
        }

        let payload = try decoder.decode(GeminiTelemetryPayload.self, from: response.body)
        let refreshTime = now()
        return ProviderTelemetrySnapshot(
            providerId: .gemini,
            accountLabel: auth.accountLabel,
            status: .exact,
            confidence: .providerSupplied,
            lastRefreshAt: refreshTime,
            nextRefreshAt: refreshTime.addingTimeInterval(300),
            failureCount: 0,
            degradedReason: nil,
            rawSourceVersion: "gemini-code-assist-quota",
            providerPayload: .gemini(payload)
        )
    }
}
