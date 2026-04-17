import Foundation

enum ProviderTelemetryStatus: Equatable {
    case disabled
    case unavailable
    case refreshing
    case exact
    case degraded
}

enum ProviderTelemetryConfidence: Equatable {
    case exact
    case providerSupplied
    case passiveFallback
}

enum ProviderTelemetryError: Error, Equatable, CustomStringConvertible {
    case authUnavailable(String)
    case endpointShapeChanged(String)
    case httpStatus(Int)
    case network(String)
    case unsupportedCredentials(String)

    var description: String {
        switch self {
        case let .authUnavailable(reason):
            return reason
        case let .endpointShapeChanged(reason):
            return reason
        case let .httpStatus(status):
            return "HTTP \(status)"
        case let .network(reason):
            return reason
        case let .unsupportedCredentials(reason):
            return reason
        }
    }
}

enum ProviderTelemetryProviderPayload: Equatable {
    case codex(CodexTelemetryPayload)
    case gemini(GeminiTelemetryPayload)
}

struct ProviderTelemetrySnapshot {
    let providerId: ProviderId
    let accountLabel: String?
    let status: ProviderTelemetryStatus
    let confidence: ProviderTelemetryConfidence
    let lastRefreshAt: Date?
    let nextRefreshAt: Date?
    let failureCount: Int
    let degradedReason: String?
    let rawSourceVersion: String?
    let providerPayload: ProviderTelemetryProviderPayload?
    let passiveSnapshot: ProviderSnapshot?
    let rawResponseData: Data?
    let diagnosticText: String?

    init(
        providerId: ProviderId,
        accountLabel: String?,
        status: ProviderTelemetryStatus,
        confidence: ProviderTelemetryConfidence,
        lastRefreshAt: Date?,
        nextRefreshAt: Date?,
        failureCount: Int,
        degradedReason: String?,
        rawSourceVersion: String?,
        providerPayload: ProviderTelemetryProviderPayload?,
        passiveSnapshot: ProviderSnapshot? = nil,
        rawResponseData: Data? = nil,
        diagnosticText: String? = nil
    ) {
        self.providerId = providerId
        self.accountLabel = accountLabel
        self.status = status
        self.confidence = confidence
        self.lastRefreshAt = lastRefreshAt
        self.nextRefreshAt = nextRefreshAt
        self.failureCount = failureCount
        self.degradedReason = degradedReason
        self.rawSourceVersion = rawSourceVersion
        self.providerPayload = providerPayload
        self.passiveSnapshot = passiveSnapshot
        self.rawResponseData = rawResponseData
        self.diagnosticText = diagnosticText
    }

    static func unavailable(
        providerId: ProviderId,
        reason: String,
        passiveSnapshot: ProviderSnapshot? = nil
    ) -> ProviderTelemetrySnapshot {
        ProviderTelemetrySnapshot(
            providerId: providerId,
            accountLabel: nil,
            status: .unavailable,
            confidence: .passiveFallback,
            lastRefreshAt: nil,
            nextRefreshAt: nil,
            failureCount: 1,
            degradedReason: reason,
            rawSourceVersion: nil,
            providerPayload: nil,
            passiveSnapshot: passiveSnapshot
        )
    }

    static func degraded(
        providerId: ProviderId,
        reason: String,
        failureCount: Int,
        passiveSnapshot: ProviderSnapshot? = nil,
        nextRefreshAt: Date? = nil
    ) -> ProviderTelemetrySnapshot {
        ProviderTelemetrySnapshot(
            providerId: providerId,
            accountLabel: nil,
            status: .degraded,
            confidence: .passiveFallback,
            lastRefreshAt: nil,
            nextRefreshAt: nextRefreshAt,
            failureCount: failureCount,
            degradedReason: reason,
            rawSourceVersion: nil,
            providerPayload: nil,
            passiveSnapshot: passiveSnapshot
        )
    }

    func sanitizedForPersistence() -> ProviderTelemetrySnapshot {
        ProviderTelemetrySnapshot(
            providerId: providerId,
            accountLabel: accountLabel,
            status: status,
            confidence: confidence,
            lastRefreshAt: lastRefreshAt,
            nextRefreshAt: nextRefreshAt,
            failureCount: failureCount,
            degradedReason: degradedReason,
            rawSourceVersion: rawSourceVersion,
            providerPayload: providerPayload,
            passiveSnapshot: passiveSnapshot,
            rawResponseData: nil,
            diagnosticText: nil
        )
    }
}

struct ProviderTelemetryHTTPResponse: Equatable {
    let statusCode: Int
    let headers: [String: String]
    let body: Data
}

protocol ProviderTelemetryHTTPClient {
    func send(_ request: URLRequest) async throws -> ProviderTelemetryHTTPResponse
}

protocol ProviderTelemetryClient {
    func refresh() async throws -> ProviderTelemetrySnapshot
}

enum ProviderTelemetryRefreshReason {
    case scheduled
    case manual
}

enum CodexTelemetryAuth {
    case chatGPT(accessToken: String, accountLabel: String?)
    case codexAPI(baseURL: URL, apiKey: String, accountLabel: String?)

    var accountLabel: String? {
        switch self {
        case let .chatGPT(_, accountLabel):
            return accountLabel
        case let .codexAPI(_, _, accountLabel):
            return accountLabel
        }
    }
}

protocol CodexTelemetryAuthProviding {
    func currentAuth() throws -> CodexTelemetryAuth
}

enum GeminiTelemetryAuth {
    case codeAssistOAuth(accessToken: String, projectId: String, accountLabel: String?)

    var accountLabel: String? {
        switch self {
        case let .codeAssistOAuth(_, _, accountLabel):
            return accountLabel
        }
    }
}

protocol GeminiTelemetryAuthProviding {
    func currentAuth() throws -> GeminiTelemetryAuth
}

struct CodexTelemetryPayload: Codable, Equatable {
    let planType: String?
    let balance: Balance?
    let rateLimits: [RateLimit]

    struct Balance: Codable, Equatable {
        let amount: Int
        let unit: String
    }

    struct RateLimit: Codable, Equatable {
        let limitId: String
        let limitName: String
        let windowLabel: String?
        let usedPercent: Double
        let resetsAt: Date?
        let windowDuration: TimeInterval?
        let hasCredits: Bool
        let unlimited: Bool

        private enum CodingKeys: String, CodingKey {
            case limitId = "limit_id"
            case limitName = "limit_name"
            case windowLabel = "window_label"
            case usedPercent = "used_percent"
            case resetsAt = "resets_at"
            case windowDuration = "window_duration"
            case hasCredits = "has_credits"
            case unlimited
        }
    }

    private enum CodingKeys: String, CodingKey {
        case planType = "plan_type"
        case balance
        case rateLimits = "rate_limits"
    }
}

struct GeminiTelemetryPayload: Codable, Equatable {
    let quotaBuckets: [QuotaBucket]

    struct QuotaBucket: Codable, Equatable {
        let modelId: String
        let tokenType: String
        let remainingAmount: Int
        let remainingFraction: Double
        let resetTime: Date?

        private enum CodingKeys: String, CodingKey {
            case modelId = "model_id"
            case tokenType = "token_type"
            case remainingAmount = "remaining_amount"
            case remainingFraction = "remaining_fraction"
            case resetTime = "reset_time"
        }
    }

    private enum CodingKeys: String, CodingKey {
        case quotaBuckets = "quota_buckets"
    }
}

enum ProviderTelemetryDiagnostics {
    static func redact(_ raw: String) -> String {
        var redacted = raw
        let patterns = [
            "(?i)Authorization:\\s*Bearer\\s+[^\\n\\r]+",
            "(?i)Cookie:\\s*[^\\n\\r]+",
            "(?i)x-openai-account-id:\\s*[^\\n\\r]+",
            "(?i)access_token=[^\\s&\\n\\r]+",
            "(?i)refresh_token=[^\\s&\\n\\r]+",
            "(?i)acct_[A-Za-z0-9_\\-]+",
        ]

        for pattern in patterns {
            redacted = redacted.replacingOccurrences(
                of: pattern,
                with: replacement(for: pattern),
                options: .regularExpression
            )
        }

        return redacted
    }

    private static func replacement(for pattern: String) -> String {
        if pattern.contains("access_token") {
            return "access_token=[redacted]"
        }
        if pattern.contains("refresh_token") {
            return "refresh_token=[redacted]"
        }
        if pattern.contains("Cookie") {
            return "Cookie: [redacted]"
        }
        if pattern.contains("Authorization") {
            return "Authorization: Bearer [redacted]"
        }
        if pattern.contains("x-openai-account-id") {
            return "x-openai-account-id: [redacted]"
        }
        return "[redacted]"
    }
}

enum ProviderTelemetryAdapterBridge {
    static func merge(
        passiveSnapshot: ProviderSnapshot,
        telemetrySnapshot: ProviderTelemetrySnapshot
    ) -> ProviderSnapshot {
        ProviderTelemetryAttachmentRegistry.attach(telemetrySnapshot, to: passiveSnapshot.id)
        return passiveSnapshot
    }
}

enum ProviderTelemetryAttachmentRegistry {
    private static var attachments: [ProviderId: ProviderTelemetrySnapshot] = [:]
    private static let lock = NSLock()

    static func attach(_ snapshot: ProviderTelemetrySnapshot, to providerId: ProviderId) {
        lock.lock()
        defer { lock.unlock() }
        attachments[providerId] = snapshot.sanitizedForPersistence()
    }

    static func snapshot(for providerId: ProviderId) -> ProviderTelemetrySnapshot? {
        lock.lock()
        defer { lock.unlock() }
        return attachments[providerId]
    }

    static func detach(_ providerId: ProviderId) {
        lock.lock()
        defer { lock.unlock() }
        attachments.removeValue(forKey: providerId)
    }

    static func removeAll() {
        lock.lock()
        defer { lock.unlock() }
        attachments.removeAll()
    }
}

extension ProviderSnapshot {
    var providerTelemetry: ProviderTelemetrySnapshot? {
        ProviderTelemetryAttachmentRegistry.snapshot(for: id)
    }
}
