import Foundation

protocol ProviderTelemetryStore {
    func save(_ snapshot: ProviderTelemetrySnapshot) throws
    func snapshot(for providerId: ProviderId) throws -> ProviderTelemetrySnapshot?
}

final class InMemoryProviderTelemetryStore: ProviderTelemetryStore {
    private var snapshots: [ProviderId: ProviderTelemetrySnapshot] = [:]
    private let lock = NSLock()

    func save(_ snapshot: ProviderTelemetrySnapshot) throws {
        lock.lock()
        defer { lock.unlock() }
        snapshots[snapshot.providerId] = snapshot.sanitizedForPersistence()
    }

    func snapshot(for providerId: ProviderId) throws -> ProviderTelemetrySnapshot? {
        lock.lock()
        defer { lock.unlock() }
        return snapshots[providerId]
    }
}

final class UserDefaultsProviderTelemetryStore: ProviderTelemetryStore {
    private let defaults: UserDefaults
    private let keyPrefix: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        defaults: UserDefaults = .standard,
        keyPrefix: String = "provider_telemetry_snapshot"
    ) {
        self.defaults = defaults
        self.keyPrefix = keyPrefix
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
    }

    func save(_ snapshot: ProviderTelemetrySnapshot) throws {
        let record = try ProviderTelemetrySnapshotRecord(snapshot: snapshot.sanitizedForPersistence())
        let data = try encoder.encode(record)
        defaults.set(data, forKey: key(for: snapshot.providerId))
    }

    func snapshot(for providerId: ProviderId) throws -> ProviderTelemetrySnapshot? {
        guard let data = defaults.data(forKey: key(for: providerId)) else {
            return nil
        }
        let record = try decoder.decode(ProviderTelemetrySnapshotRecord.self, from: data)
        return try record.snapshot()
    }

    private func key(for providerId: ProviderId) -> String {
        "\(keyPrefix)_\(ProviderTelemetrySnapshotRecord.string(from: providerId))"
    }
}

private struct ProviderTelemetrySnapshotRecord: Codable {
    let providerId: String
    let accountLabel: String?
    let status: String
    let confidence: String
    let lastRefreshAt: Date?
    let nextRefreshAt: Date?
    let failureCount: Int
    let degradedReason: String?
    let rawSourceVersion: String?
    let codexPayload: CodexTelemetryPayload?
    let geminiPayload: GeminiTelemetryPayload?

    init(snapshot: ProviderTelemetrySnapshot) throws {
        providerId = Self.string(from: snapshot.providerId)
        accountLabel = snapshot.accountLabel
        status = Self.string(from: snapshot.status)
        confidence = Self.string(from: snapshot.confidence)
        lastRefreshAt = snapshot.lastRefreshAt
        nextRefreshAt = snapshot.nextRefreshAt
        failureCount = snapshot.failureCount
        degradedReason = snapshot.degradedReason
        rawSourceVersion = snapshot.rawSourceVersion

        switch snapshot.providerPayload {
        case let .codex(payload):
            codexPayload = payload
            geminiPayload = nil
        case let .gemini(payload):
            codexPayload = nil
            geminiPayload = payload
        case nil:
            codexPayload = nil
            geminiPayload = nil
        }
    }

    func snapshot() throws -> ProviderTelemetrySnapshot {
        let providerId = try Self.providerId(from: providerId)
        return ProviderTelemetrySnapshot(
            providerId: providerId,
            accountLabel: accountLabel,
            status: try Self.status(from: status),
            confidence: try Self.confidence(from: confidence),
            lastRefreshAt: lastRefreshAt,
            nextRefreshAt: nextRefreshAt,
            failureCount: failureCount,
            degradedReason: degradedReason,
            rawSourceVersion: rawSourceVersion,
            providerPayload: providerPayload(for: providerId),
            passiveSnapshot: nil,
            rawResponseData: nil,
            diagnosticText: nil
        )
    }

    private func providerPayload(for providerId: ProviderId) -> ProviderTelemetryProviderPayload? {
        switch providerId {
        case .codex:
            return codexPayload.map(ProviderTelemetryProviderPayload.codex)
        case .gemini:
            return geminiPayload.map(ProviderTelemetryProviderPayload.gemini)
        case .claude:
            return nil
        }
    }

    static func string(from providerId: ProviderId) -> String {
        switch providerId {
        case .claude: return "claude"
        case .codex: return "codex"
        case .gemini: return "gemini"
        }
    }

    private static func providerId(from value: String) throws -> ProviderId {
        switch value {
        case "claude": return .claude
        case "codex": return .codex
        case "gemini": return .gemini
        default: throw ProviderTelemetryStoreError.invalidProviderId(value)
        }
    }

    private static func string(from status: ProviderTelemetryStatus) -> String {
        switch status {
        case .disabled: return "disabled"
        case .unavailable: return "unavailable"
        case .refreshing: return "refreshing"
        case .exact: return "exact"
        case .degraded: return "degraded"
        }
    }

    private static func status(from value: String) throws -> ProviderTelemetryStatus {
        switch value {
        case "disabled": return .disabled
        case "unavailable": return .unavailable
        case "refreshing": return .refreshing
        case "exact": return .exact
        case "degraded": return .degraded
        default: throw ProviderTelemetryStoreError.invalidStatus(value)
        }
    }

    private static func string(from confidence: ProviderTelemetryConfidence) -> String {
        switch confidence {
        case .exact: return "exact"
        case .providerSupplied: return "providerSupplied"
        case .passiveFallback: return "passiveFallback"
        }
    }

    private static func confidence(from value: String) throws -> ProviderTelemetryConfidence {
        switch value {
        case "exact": return .exact
        case "providerSupplied": return .providerSupplied
        case "passiveFallback": return .passiveFallback
        default: throw ProviderTelemetryStoreError.invalidConfidence(value)
        }
    }
}

private enum ProviderTelemetryStoreError: Error {
    case invalidProviderId(String)
    case invalidStatus(String)
    case invalidConfidence(String)
}
