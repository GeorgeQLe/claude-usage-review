import SwiftUI
import Combine

class GitHubViewModel: ObservableObject {
    @Published var weeks: [[ContributionDay]] = []
    @Published var isConfigured: Bool = false

    private var pollingTask: Task<Void, Never>?
    private let pollingInterval: TimeInterval = 3600 // 1 hour

    var totalContributions: Int {
        weeks.flatMap { $0 }.reduce(0) { $0 + $1.contributionCount }
    }

    /// The last 12 weeks of data for the heatmap display.
    var last12Weeks: [[ContributionDay]] {
        let all = weeks
        if all.count <= 12 { return all }
        return Array(all.suffix(12))
    }

    init() {
        checkConfiguration()
        startPollingIfConfigured()
    }

    deinit {
        pollingTask?.cancel()
    }

    func checkConfiguration() {
        let username = UserDefaults.standard.string(forKey: "claude_github_username") ?? ""
        let token = KeychainService.read(key: .githubToken)
        isConfigured = !username.isEmpty && token != nil && !token!.isEmpty
    }

    func startPollingIfConfigured() {
        pollingTask?.cancel()

        guard isConfigured else { return }

        pollingTask = Task { [weak self] in
            guard let self = self else { return }
            await self.fetchContributions()

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.pollingInterval * 1_000_000_000))
                if Task.isCancelled { break }
                await self.fetchContributions()
            }
        }
    }

    @MainActor
    func fetchContributions() async {
        guard let username = UserDefaults.standard.string(forKey: "claude_github_username"),
              let token = KeychainService.read(key: .githubToken),
              !username.isEmpty, !token.isEmpty else {
            return
        }

        let service = GitHubService(token: token, username: username)
        do {
            let fetchedWeeks = try await service.fetchContributions()
            self.weeks = fetchedWeeks
        } catch {
            // Silently fail — keep existing data
        }
    }
}
