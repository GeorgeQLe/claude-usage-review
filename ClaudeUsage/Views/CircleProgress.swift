import SwiftUI

struct CircleProgress: View {
    let percentage: Double
    var size: CGFloat = 32
    var colorMode: UsageColorMode = .session
    var paceStatus: PaceStatus? = nil
    var weeklyColorMode: WeeklyColorMode = .paceAware

    private var trimEnd: CGFloat {
        CGFloat(min(max(percentage, 0), 100)) / 100.0
    }

    private var ringColor: Color {
        if colorMode == .weekly, let status = paceStatus, weeklyColorMode == .paceAware {
            return UsageBar.paceColor(for: status)
        }
        return colorMode.color(for: percentage)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.gray.opacity(0.2), lineWidth: size * 0.15)

            Circle()
                .trim(from: 0, to: trimEnd)
                .stroke(ringColor, style: StrokeStyle(lineWidth: size * 0.15, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: size, height: size)
    }
}
