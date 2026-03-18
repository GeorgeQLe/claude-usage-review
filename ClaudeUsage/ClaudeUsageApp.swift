import SwiftUI

@main
struct ClaudeUsageApp: App {
    @StateObject private var accountStore = AccountStore()
    @StateObject private var viewModel: UsageViewModel
    @StateObject private var githubViewModel = GitHubViewModel()

    init() {
        let store = AccountStore()
        _accountStore = StateObject(wrappedValue: store)
        _viewModel = StateObject(wrappedValue: UsageViewModel(accountStore: store))
        _githubViewModel = StateObject(wrappedValue: GitHubViewModel())
    }

    private var menuBarText: String {
        let sessionPct = Int(viewModel.usageData?.fiveHour.utilization ?? 0)
        let timeText = viewModel.menuBarTimeString
        let paceEmoji = viewModel.paceTheme.emoji(for: viewModel.paceStatus)

        var parts = ["\(paceEmoji) \(sessionPct)%"]

        if let budget = viewModel.dailyBudgetPercent {
            parts.append("\(budget)%/day")
        } else {
            // Fall back to weekly % when daily budget isn't available yet
            let weeklyPct = Int(viewModel.usageData?.sevenDay.utilization ?? 0)
            parts.append("\(weeklyPct)%W")
        }

        if !timeText.isEmpty {
            parts.append(timeText)
        }

        return parts.joined(separator: " · ")
    }

    var body: some Scene {
        MenuBarExtra {
            ContentView(viewModel: viewModel, accountStore: accountStore, githubViewModel: githubViewModel)
        } label: {
            Text(menuBarText)
                .font(.system(size: 11, weight: .medium))
        }
        .menuBarExtraStyle(.window)
    }
}
