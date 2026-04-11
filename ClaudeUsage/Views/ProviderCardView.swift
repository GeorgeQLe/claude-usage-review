import SwiftUI

struct ProviderCardView: View {
    let card: ProviderCard

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 1) {
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
            }

            Spacer()

            if let session = card.sessionUtilization {
                Text("\(Int(session))%")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
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
