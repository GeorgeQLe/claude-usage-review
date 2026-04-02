import Foundation

enum GitHubServiceError: Error {
    case authError
    case httpError(statusCode: Int)
    case invalidResponse
}

struct GitHubService {
    private let token: String
    private let username: String
    private let session: URLSession

    init(token: String, username: String, session: URLSession = .shared) {
        self.token = token
        self.username = username
        self.session = session
    }

    func fetchContributions() async throws -> [[ContributionDay]] {
        let url = URL(string: "https://api.github.com/graphql")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let query = """
        query($login: String!) {
          user(login: $login) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    date
                    contributionCount
                  }
                }
              }
            }
          }
        }
        """

        let body: [String: Any] = [
            "query": query,
            "variables": ["login": username]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw GitHubServiceError.invalidResponse
        }

        if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
            throw GitHubServiceError.authError
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw GitHubServiceError.httpError(statusCode: httpResponse.statusCode)
        }

        let decoded = try JSONDecoder().decode(GitHubGraphQLResponse.self, from: data)

        if let errors = decoded.errors, !errors.isEmpty {
            throw GitHubServiceError.invalidResponse
        }

        guard let weeks = decoded.data?.user.contributionsCollection.contributionCalendar.weeks else {
            throw GitHubServiceError.invalidResponse
        }

        return weeks.map { $0.contributionDays }
    }
}
