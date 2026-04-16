import Foundation

final class ProviderTelemetryCoordinator {
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
           current.status == .degraded,
           nextRefreshAt > refreshTime {
            return current
        }

        guard let client = clients[providerId] else {
            let fallback = ProviderTelemetrySnapshot.unavailable(
                providerId: providerId,
                reason: "Telemetry client unavailable",
                passiveSnapshot: passiveSnapshot
            )
            try store.save(fallback)
            return fallback
        }

        do {
            let supplied = try await client.refresh()
            try store.save(supplied)
            return supplied
        } catch {
            let failureCount = (current?.failureCount ?? 0) + 1
            let reason = telemetryReason(from: error)
            let status: ProviderTelemetryStatus = failureCount >= 3 ? .degraded : .unavailable
            let nextRefreshAt = refreshTime.addingTimeInterval(backoffInterval(for: failureCount))
            let fallback = ProviderTelemetrySnapshot(
                providerId: providerId,
                accountLabel: current?.accountLabel,
                status: status,
                confidence: .passiveFallback,
                lastRefreshAt: current?.lastRefreshAt,
                nextRefreshAt: nextRefreshAt,
                failureCount: failureCount,
                degradedReason: reason,
                rawSourceVersion: current?.rawSourceVersion,
                providerPayload: nil,
                passiveSnapshot: passiveSnapshot
            )
            try store.save(fallback)
            return fallback
        }
    }

    private func telemetryReason(from error: Error) -> String {
        if let telemetryError = error as? ProviderTelemetryError {
            return telemetryError.description
        }
        return error.localizedDescription
    }

    private func backoffInterval(for failureCount: Int) -> TimeInterval {
        let exponent = max(0, min(failureCount - 1, 3))
        return min(300 * pow(2, Double(exponent)), 1800)
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
