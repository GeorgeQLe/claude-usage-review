import SwiftUI

struct ContentView: View {
    @ObservedObject var viewModel: UsageViewModel
    @ObservedObject var accountStore: AccountStore
    @ObservedObject var githubViewModel: GitHubViewModel
    @ObservedObject var providerShellViewModel: ProviderShellViewModel
    @ObservedObject var providerSettingsStore: ProviderSettingsStore
    @AppStorage("history_expanded") private var historyExpanded = false
    @AppStorage("github_expanded") private var githubExpanded = false
    @AppStorage("providers_expanded") private var providersExpanded = false
    @State private var showingAddAccount = false
    @State private var newAccountEmail = ""

    var body: some View {
        usageContent
    }

    private func openSettings() {
        let settingsView = SettingsView(viewModel: viewModel, accountStore: accountStore, githubViewModel: githubViewModel, providerSettingsStore: providerSettingsStore, providerShellViewModel: providerShellViewModel)
        let hostingController = NSHostingController(rootView: settingsView)
        let window = NSWindow(contentViewController: hostingController)
        window.title = "Claude Usage Settings"
        window.styleMask = [.titled, .closable]
        window.setContentSize(NSSize(width: 360, height: 420))
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private var accountPicker: some View {
        Group {
            if accountStore.accounts.count >= 2 {
                Picker("Account", selection: Binding(
                    get: { accountStore.activeAccountId ?? UUID() },
                    set: { accountStore.setActive(id: $0) }
                )) {
                    ForEach(accountStore.accounts) { account in
                        Text(account.email).tag(account.id)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 4)
            }
        }
    }

    private var toolbarButtons: some View {
        HStack {
            if case .networkError(let detail) = viewModel.errorState {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 11))
                    .foregroundColor(.orange)
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundColor(.orange)
            } else {
                Text("Updated \(viewModel.lastUpdatedString)")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button(action: {
                showingAddAccount = true
            }) {
                Image(systemName: "plus")
                    .font(.system(size: 12))
            }
            .buttonStyle(.borderless)
            .popover(isPresented: $showingAddAccount) {
                addAccountPopover
            }

            Button(action: {
                viewModel.fetchNow()
            }) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12))
            }
            .buttonStyle(.borderless)

            Button(action: {
                openSettings()
            }) {
                Image(systemName: "gearshape")
                    .font(.system(size: 12))
            }
            .buttonStyle(.borderless)

            Button(action: {
                NSApplication.shared.terminate(nil)
            }) {
                Image(systemName: "power")
                    .font(.system(size: 12))
            }
            .buttonStyle(.borderless)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private var addAccountPopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add Account")
                .font(.headline)

            TextField("Email or label", text: $newAccountEmail)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 12))

            HStack {
                Spacer()
                Button("Cancel") {
                    newAccountEmail = ""
                    showingAddAccount = false
                }
                Button("Add") {
                    let account = accountStore.add(email: newAccountEmail)
                    accountStore.setActive(id: account.id)
                    newAccountEmail = ""
                    showingAddAccount = false
                }
                .disabled(newAccountEmail.isEmpty)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .frame(width: 240)
    }

    private var usageContent: some View {
        VStack(spacing: 0) {
            accountPicker

            if viewModel.errorState == .authExpired {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(.red)
                    Text("Session Expired")
                        .font(.headline)
                    Text("Your session key has expired. Please update it in settings.")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Open Settings") {
                        openSettings()
                    }
                }
                .padding()
            } else if case .networkError(let detail) = viewModel.errorState, viewModel.usageData == nil {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(.orange)
                    Text("Request Failed")
                        .font(.headline)
                    Text(detail)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    Button("Retry") {
                        viewModel.fetchNow()
                    }
                }
                .padding()
            } else if viewModel.usageData != nil {
                VStack(spacing: 16) {
                    ForEach(Array(viewModel.displayLimits.enumerated()), id: \.offset) { _, item in
                        UsageBar(name: item.name, limit: item.limit,
                                 paceDetail: item.name == "Weekly" ? viewModel.weeklyPaceDetail : nil,
                                 colorMode: item.name == "Session" ? .session : .weekly,
                                 paceStatus: item.name == "Session" ? nil : viewModel.paceStatus,
                                 weeklyColorMode: viewModel.weeklyColorMode)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 12)

                // Providers section
                Divider()

                DisclosureGroup(isExpanded: $providersExpanded) {
                    VStack(spacing: 6) {
                        ForEach(providerShellViewModel.shellState.providers, id: \.id) { card in
                            ProviderCardView(card: card) { providerId in
                                Task {
                                    await providerShellViewModel.refreshProviderTelemetry(providerId)
                                }
                            }
                        }
                    }
                    .padding(.top, 4)
                } label: {
                    Text("Providers")
                        .font(.system(size: 12, weight: .medium))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

                // History sparkline section
                if !viewModel.historySnapshots.isEmpty {
                    Divider()

                    DisclosureGroup(isExpanded: $historyExpanded) {
                        VStack(alignment: .leading, spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Session")
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary)
                                SparklineView(snapshots: viewModel.historySnapshots,
                                              keyPath: \.sessionUtilization,
                                              colorMode: .session)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Weekly")
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary)
                                SparklineView(snapshots: viewModel.historySnapshots,
                                              keyPath: \.weeklyUtilization,
                                              colorMode: .weekly)
                            }
                        }
                        .padding(.top, 4)
                    } label: {
                        Text("History")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }

                // GitHub heatmap section
                if githubViewModel.isConfigured && !githubViewModel.weeks.isEmpty {
                    Divider()

                    DisclosureGroup(isExpanded: $githubExpanded) {
                        ContributionHeatmapView(
                            weeks: githubViewModel.last12Weeks,
                            totalContributions: githubViewModel.totalContributions
                        )
                        .padding(.top, 4)
                    } label: {
                        Text("GitHub")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }

                Divider()

                toolbarButtons
            } else if viewModel.authStatus == .connected {
                VStack(spacing: 12) {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Loading usage data…")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                .padding()
            } else {
                VStack(spacing: 12) {
                    Text("Claude Usage")
                        .font(.headline)
                    Text("Not configured")
                        .foregroundColor(.secondary)
                    Button("Open Settings") {
                        openSettings()
                    }
                }
                .padding()
            }
        }
        .frame(width: 280)
    }
}
