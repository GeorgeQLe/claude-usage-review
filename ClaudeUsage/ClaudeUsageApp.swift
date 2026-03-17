import SwiftUI

@main
struct ClaudeUsageApp: App {
    @StateObject private var accountStore = AccountStore()
    @StateObject private var viewModel: UsageViewModel

    init() {
        let store = AccountStore()
        _accountStore = StateObject(wrappedValue: store)
        _viewModel = StateObject(wrappedValue: UsageViewModel(accountStore: store))
    }

    private var menuBarText: String {
        let sessionPct = Int(viewModel.usageData?.fiveHour.utilization ?? 0)
        let weeklyPct = Int(viewModel.usageData?.sevenDay.utilization ?? 0)
        let resetDate: Date? = viewModel.usageData?.fiveHour.resetsAt
        if resetDate != nil {
            let timeText = viewModel.menuBarTimeString
            let pace = viewModel.weeklyPaceIndicator
            return "\(sessionPct)% · \(weeklyPct)%W\(pace) · \(timeText)"
        }
        let pace = viewModel.weeklyPaceIndicator
        return "\(sessionPct)% · \(weeklyPct)%W\(pace)"
    }

    var body: some Scene {
        MenuBarExtra {
            ContentView(viewModel: viewModel, accountStore: accountStore)
        } label: {
            HStack(spacing: 3) {
                Image("MenuBarIcon")
                    .renderingMode(.template)
                Text(menuBarText)
                    .font(.system(size: 11, weight: .medium))
            }
        }
        .menuBarExtraStyle(.window)
    }
}
