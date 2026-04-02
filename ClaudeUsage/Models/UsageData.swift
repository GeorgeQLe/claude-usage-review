import Foundation

struct UsageLimit: Codable, Equatable {
    let utilization: Double
    let resetsAt: Date?

    enum CodingKeys: String, CodingKey {
        case utilization
        case resetsAt = "resets_at"
    }
}

struct ExtraUsage: Codable, Equatable {
    let isEnabled: Bool?
    let monthlyLimit: Int?
    let usedCredits: Double?
    let utilization: Double?

    enum CodingKeys: String, CodingKey {
        case isEnabled = "is_enabled"
        case monthlyLimit = "monthly_limit"
        case usedCredits = "used_credits"
        case utilization
    }

    /// Converts to a UsageLimit for display compatibility.
    var asUsageLimit: UsageLimit? {
        guard let utilization = utilization else { return nil }
        return UsageLimit(utilization: utilization, resetsAt: nil)
    }
}

struct UsageData: Codable, Equatable {
    let fiveHour: UsageLimit
    let sevenDay: UsageLimit
    let sevenDaySonnet: UsageLimit?
    let sevenDayOpus: UsageLimit?
    let sevenDayOauthApps: UsageLimit?
    let sevenDayCowork: UsageLimit?
    let iguanaNecktie: UsageLimit?
    let extraUsageRaw: ExtraUsage?

    var extraUsage: UsageLimit? {
        extraUsageRaw?.asUsageLimit
    }

    enum CodingKeys: String, CodingKey {
        case fiveHour = "five_hour"
        case sevenDay = "seven_day"
        case sevenDaySonnet = "seven_day_sonnet"
        case sevenDayOpus = "seven_day_opus"
        case sevenDayOauthApps = "seven_day_oauth_apps"
        case sevenDayCowork = "seven_day_cowork"
        case iguanaNecktie = "iguana_necktie"
        case extraUsageRaw = "extra_usage"
    }
}
