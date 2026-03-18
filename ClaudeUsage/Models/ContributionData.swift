import Foundation

struct ContributionDay: Codable, Identifiable {
    let date: String           // "YYYY-MM-DD"
    let contributionCount: Int
    var id: String { date }
}

// MARK: - GraphQL Response Wrappers

struct GitHubGraphQLResponse: Codable {
    let data: GitHubUserData?
    let errors: [GitHubGraphQLError]?
}

struct GitHubGraphQLError: Codable {
    let message: String
}

struct GitHubUserData: Codable {
    let user: GitHubUser
}

struct GitHubUser: Codable {
    let contributionsCollection: ContributionsCollection
}

struct ContributionsCollection: Codable {
    let contributionCalendar: ContributionCalendar
}

struct ContributionCalendar: Codable {
    let totalContributions: Int
    let weeks: [ContributionWeek]
}

struct ContributionWeek: Codable {
    let contributionDays: [ContributionDay]
}
