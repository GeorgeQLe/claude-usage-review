import SwiftUI

struct ContributionHeatmapView: View {
    let weeks: [[ContributionDay]]
    let totalContributions: Int

    private let cellSize: CGFloat = 5
    private let cellSpacing: CGFloat = 2

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("GitHub · \(totalContributions) contributions")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary)

            HStack(spacing: cellSpacing) {
                ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                    VStack(spacing: cellSpacing) {
                        ForEach(week) { day in
                            RoundedRectangle(cornerRadius: 1)
                                .fill(colorForCount(day.contributionCount))
                                .frame(width: cellSize, height: cellSize)
                                .help("\(day.date): \(day.contributionCount) contributions")
                        }
                    }
                }
            }
        }
    }

    private func colorForCount(_ count: Int) -> Color {
        switch count {
        case 0:
            return Color.gray.opacity(0.15)
        case 1...3:
            return Color.green.opacity(0.3)
        case 4...6:
            return Color.green.opacity(0.55)
        case 7...9:
            return Color.green.opacity(0.8)
        default:
            return Color.green.opacity(1.0)
        }
    }
}
