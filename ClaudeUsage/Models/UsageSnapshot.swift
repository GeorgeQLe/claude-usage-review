import Foundation

struct UsageSnapshot: Codable {
    let timestamp: Date
    let sessionUtilization: Double
    let weeklyUtilization: Double
}
