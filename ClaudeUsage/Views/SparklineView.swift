import SwiftUI

struct SparklineView: View {
    let snapshots: [UsageSnapshot]
    let keyPath: KeyPath<UsageSnapshot, Double>
    var colorMode: UsageColorMode = .session

    private var lineColor: Color {
        guard let last = snapshots.last else {
            return colorMode.color(for: 0)
        }
        let value = last[keyPath: keyPath]
        return colorMode.color(for: value)
    }

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height

            if snapshots.count >= 2 {
                let path = linePath(width: width, height: height)

                // Gradient fill under the curve
                let fillPath = filledPath(linePath: path, width: width, height: height)
                fillPath
                    .fill(lineColor.opacity(0.1))

                // Line
                path
                    .stroke(lineColor, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            } else {
                // Not enough data — show a subtle placeholder line
                Path { p in
                    p.move(to: CGPoint(x: 0, y: height / 2))
                    p.addLine(to: CGPoint(x: width, y: height / 2))
                }
                .stroke(Color.gray.opacity(0.3), lineWidth: 1)
            }
        }
        .frame(height: 30)
    }

    private func linePath(width: CGFloat, height: CGFloat) -> Path {
        Path { path in
            let count = snapshots.count
            guard count >= 2 else { return }

            for (index, snapshot) in snapshots.enumerated() {
                let x = width * CGFloat(index) / CGFloat(count - 1)
                let value = CGFloat(min(max(snapshot[keyPath: keyPath], 0), 100))
                let y = height - (value / 100.0) * height

                if index == 0 {
                    path.move(to: CGPoint(x: x, y: y))
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }
        }
    }

    private func filledPath(linePath: Path, width: CGFloat, height: CGFloat) -> Path {
        var filled = linePath
        filled.addLine(to: CGPoint(x: width, y: height))
        filled.addLine(to: CGPoint(x: 0, y: height))
        filled.closeSubpath()
        return filled
    }
}
