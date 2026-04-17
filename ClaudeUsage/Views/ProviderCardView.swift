import SwiftUI

struct ProviderCardView: View {
    let card: ProviderCard
    let onRefreshProviderTelemetry: ((ProviderId) -> Void)?

    init(
        card: ProviderCard,
        onRefreshProviderTelemetry: ((ProviderId) -> Void)? = nil
    ) {
        self.card = card
        self.onRefreshProviderTelemetry = onRefreshProviderTelemetry
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 3) {
                Text(card.headline)
                    .font(.system(size: 12, weight: .medium))

                if let detail = card.detailText {
                    Text(detail)
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }

                if let explanation = card.confidenceExplanation {
                    Text(explanation)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                if let telemetryStatusText = card.telemetryStatusText {
                    Text(telemetryStatusText)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.secondary)
                }

                ForEach(Array(card.telemetryDetails.enumerated()), id: \.offset) { _, detail in
                    Text("\(detail.label): \(detail.value)")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                if let telemetryRefreshText = card.telemetryRefreshText {
                    Text(telemetryRefreshText)
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if let session = card.sessionUtilization {
                    Text("\(Int(session))%")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)
                }

                if card.supportsProviderTelemetryRefresh, let onRefreshProviderTelemetry {
                    Button("Refresh") {
                        onRefreshProviderTelemetry(card.id)
                    }
                    .font(.system(size: 10))
                    .controlSize(.mini)
                }
            }
        }
        .opacity(card.cardState == .missingConfiguration ? 0.5 : 1.0)
    }

    private var statusColor: Color {
        switch card.cardState {
        case .configured: return .green
        case .missingConfiguration: return .gray
        case .degraded: return .orange
        case .stale: return .yellow
        }
    }
}
