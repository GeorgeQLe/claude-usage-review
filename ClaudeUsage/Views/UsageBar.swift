import SwiftUI

/// Controls whether high utilization is good (weekly) or bad (session).
enum UsageColorMode {
    /// Session-style: high = red (burning too fast), low = green (pacing well)
    case session
    /// Weekly-style: high = green (maximizing value), low = red (underutilizing)
    case weekly

    func color(for percentage: Double) -> Color {
        switch self {
        case .session:
            if percentage >= 80 { return .red }
            if percentage >= 50 { return .yellow }
            return .green
        case .weekly:
            if percentage >= 80 { return .green }
            if percentage >= 50 { return .yellow }
            return .red
        }
    }
}

struct UsageBar: View {
    let name: String
    let limit: UsageLimit
    var paceDetail: String? = nil
    var colorMode: UsageColorMode = .session

    private var percentage: Double {
        min(max(limit.utilization, 0), 100)
    }

    private var barColor: Color {
        colorMode.color(for: percentage)
    }

    private var resetTimeString: String {
        guard let resetDate = limit.resetsAt else { return "" }
        let calendar = Calendar.current
        let now = Date()

        if calendar.isDate(resetDate, inSameDayAs: now) {
            let formatter = DateFormatter()
            formatter.dateFormat = "h:mm a"
            return "Resets at \(formatter.string(from: resetDate))"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEE h:mm a"
            return "Resets \(formatter.string(from: resetDate))"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(name)
                    .font(.system(size: 13, weight: .medium))
                Spacer()
                CircleProgress(percentage: percentage, size: 20, colorMode: colorMode)
                Text("\(Int(percentage))%")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.secondary)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.gray.opacity(0.2))
                        .frame(height: 6)

                    RoundedRectangle(cornerRadius: 3)
                        .fill(barColor)
                        .frame(width: geometry.size.width * CGFloat(percentage / 100), height: 6)
                }
            }
            .frame(height: 6)

            if !resetTimeString.isEmpty {
                Text(resetTimeString)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            if let paceDetail = paceDetail {
                Text(paceDetail)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
        }
    }
}
