import SwiftUI

@main
struct ClaudeUsageApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var accountStore = AccountStore()
    @StateObject private var viewModel: UsageViewModel
    @StateObject private var githubViewModel = GitHubViewModel()
    @StateObject private var providerShellViewModel: ProviderShellViewModel
    @StateObject private var providerSettingsStore: ProviderSettingsStore

    init() {
        let store = AccountStore()
        let vm = UsageViewModel(accountStore: store)
        let providerSettings = ProviderSettingsStore()
        _accountStore = StateObject(wrappedValue: store)
        _viewModel = StateObject(wrappedValue: vm)
        _githubViewModel = StateObject(wrappedValue: GitHubViewModel())
        _providerShellViewModel = StateObject(wrappedValue: ProviderShellViewModel(usageViewModel: vm, settingsStore: providerSettings))
        _providerSettingsStore = StateObject(wrappedValue: providerSettings)
    }

    private var menuBarText: String {
        _ = viewModel.tick
        let timeText = viewModel.menuBarTimeString
        let sessionEmoji = viewModel.paceTheme.emoji(for: viewModel.sessionPaceStatus)
        let sessionPct = Int(viewModel.usageData?.fiveHour.utilization ?? 0)

        var parts = ["\(sessionEmoji) \(sessionPct)%"]

        let targetEmoji = viewModel.paceTheme.targetEmoji
        let todayPct = viewModel.todayUsagePercent ?? 0
        if let budget = viewModel.dailyBudgetPercent {
            parts.append("\(targetEmoji) \(todayPct)%/\(budget)%/day")
        } else {
            parts.append("\(targetEmoji) \(todayPct)%/day")
        }

        let weeklyPct = Int(viewModel.usageData?.sevenDay.utilization ?? 0)
        let weeklyEmoji = viewModel.paceTheme.emoji(for: viewModel.paceStatus)
        parts.append("\(weeklyEmoji) \(weeklyPct)%/w")

        if !timeText.isEmpty {
            parts.append(timeText)
        }

        return parts.joined(separator: " · ")
    }

    var body: some Scene {
        MenuBarExtra {
            ContentView(viewModel: viewModel, accountStore: accountStore, githubViewModel: githubViewModel, providerShellViewModel: providerShellViewModel, providerSettingsStore: providerSettingsStore)
        } label: {
            let _ = { appDelegate.viewModel = viewModel }()
            Text(menuBarText)
                .font(.system(size: 11, weight: .medium))
        }
        .menuBarExtraStyle(.window)
    }
}
