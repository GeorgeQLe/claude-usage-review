import Foundation

final class ProviderTelemetryCoordinator {
    static let refreshCadence: TimeInterval = 300
    static let maximumBackoff: TimeInterval = 1800

    private let clients: [ProviderId: ProviderTelemetryClient]
    private let store: ProviderTelemetryStore
    private let now: () -> Date

    init(
        clients: [ProviderId: ProviderTelemetryClient],
        store: ProviderTelemetryStore,
        now: @escaping () -> Date = Date.init
    ) {
        self.clients = clients
        self.store = store
        self.now = now
    }

    func snapshot(for providerId: ProviderId) throws -> ProviderTelemetrySnapshot? {
        try store.snapshot(for: providerId)
    }

    func refreshIfEnabled(
        _ providerId: ProviderId,
        telemetryEnabled: Bool,
        reason: ProviderTelemetryRefreshReason,
        passiveSnapshot: ProviderSnapshot?
    ) async throws -> ProviderTelemetrySnapshot? {
        guard telemetryEnabled else {
            return nil
        }
        return try await refresh(providerId, reason: reason, passiveSnapshot: passiveSnapshot)
    }

    func refresh(
        _ providerId: ProviderId,
        reason: ProviderTelemetryRefreshReason,
        passiveSnapshot: ProviderSnapshot?
    ) async throws -> ProviderTelemetrySnapshot {
        let current = try store.snapshot(for: providerId)
        let refreshTime = now()

        if reason == .scheduled,
           let current,
           let nextRefreshAt = current.nextRefreshAt,
           nextRefreshAt > refreshTime {
            return snapshot(current, attaching: passiveSnapshot)
        }

        guard let client = clients[providerId] else {
            let fallback = fallbackSnapshot(
                providerId: providerId,
                current: current,
                error: ProviderTelemetryError.authUnavailable("Telemetry client unavailable"),
                refreshTime: refreshTime,
                passiveSnapshot: passiveSnapshot
            )
            try store.save(fallback)
            return fallback
        }

        do {
            let supplied = try await client.refresh()
            let normalized = successfulSnapshot(supplied, refreshTime: refreshTime)
            try store.save(normalized)
            return normalized
        } catch {
            let fallback = fallbackSnapshot(
                providerId: providerId,
                current: current,
                error: error,
                refreshTime: refreshTime,
                passiveSnapshot: passiveSnapshot
            )
            try store.save(fallback)
            return fallback
        }
    }

    private func successfulSnapshot(
        _ supplied: ProviderTelemetrySnapshot,
        refreshTime: Date
    ) -> ProviderTelemetrySnapshot {
        ProviderTelemetrySnapshot(
            providerId: supplied.providerId,
            accountLabel: supplied.accountLabel,
            status: .exact,
            confidence: supplied.confidence,
            lastRefreshAt: refreshTime,
            nextRefreshAt: refreshTime.addingTimeInterval(Self.refreshCadence),
            failureCount: 0,
            degradedReason: nil,
            rawSourceVersion: supplied.rawSourceVersion,
            providerPayload: supplied.providerPayload,
            passiveSnapshot: nil,
            rawResponseData: supplied.rawResponseData,
            diagnosticText: supplied.diagnosticText
        )
    }

    private func fallbackSnapshot(
        providerId: ProviderId,
        current: ProviderTelemetrySnapshot?,
        error: Error,
        refreshTime: Date,
        passiveSnapshot: ProviderSnapshot?
    ) -> ProviderTelemetrySnapshot {
        let failureCount = (current?.failureCount ?? 0) + 1
        let status: ProviderTelemetryStatus = failureCount >= 3 ? .degraded : .unavailable
        return ProviderTelemetrySnapshot(
            providerId: providerId,
            accountLabel: current?.accountLabel,
            status: status,
            confidence: .passiveFallback,
            lastRefreshAt: current?.lastRefreshAt,
            nextRefreshAt: refreshTime.addingTimeInterval(backoffInterval(for: failureCount)),
            failureCount: failureCount,
            degradedReason: telemetryReason(from: error),
            rawSourceVersion: current?.rawSourceVersion,
            providerPayload: nil,
            passiveSnapshot: passiveSnapshot
        )
    }

    private func snapshot(
        _ snapshot: ProviderTelemetrySnapshot,
        attaching passiveSnapshot: ProviderSnapshot?
    ) -> ProviderTelemetrySnapshot {
        guard let passiveSnapshot,
              snapshot.confidence == .passiveFallback,
              snapshot.passiveSnapshot == nil else {
            return snapshot
        }

        return ProviderTelemetrySnapshot(
            providerId: snapshot.providerId,
            accountLabel: snapshot.accountLabel,
            status: snapshot.status,
            confidence: snapshot.confidence,
            lastRefreshAt: snapshot.lastRefreshAt,
            nextRefreshAt: snapshot.nextRefreshAt,
            failureCount: snapshot.failureCount,
            degradedReason: snapshot.degradedReason,
            rawSourceVersion: snapshot.rawSourceVersion,
            providerPayload: snapshot.providerPayload,
            passiveSnapshot: passiveSnapshot,
            rawResponseData: snapshot.rawResponseData,
            diagnosticText: snapshot.diagnosticText
        )
    }

    private func telemetryReason(from error: Error) -> String {
        if let telemetryError = error as? ProviderTelemetryError {
            return telemetryError.description
        }
        return error.localizedDescription
    }

    private func backoffInterval(for failureCount: Int) -> TimeInterval {
        let exponent = max(0, min(failureCount - 1, 3))
        return min(Self.refreshCadence * pow(2, Double(exponent)), Self.maximumBackoff)
    }
}

enum ProviderTelemetryJSON {
    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: value) {
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
