import SwiftUI
import ServiceManagement

struct SettingsView: View {
    @ObservedObject var viewModel: UsageViewModel
    @ObservedObject var accountStore: AccountStore
    @ObservedObject var githubViewModel: GitHubViewModel
    @State private var sessionKeyInput = ""
    @State private var orgIdInput = ""
    @State private var timeDisplayFormat = TimeDisplayFormat.resetTime
    @State private var paceTheme = PaceTheme.running
    @State private var weeklyColorMode = WeeklyColorMode.paceAware
    @State private var isTesting = false
    @State private var testResult: TestResult?
    @State private var launchAtLogin = false
    @State private var editingAccountId: UUID?
    @State private var editingAccountName = ""
    @State private var accountToDelete: Account?
    @State private var githubUsername = ""
    @State private var githubToken = ""

    enum TestResult {
        case success
        case authError
        case networkError(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header with active account name (editable)
            VStack(alignment: .leading, spacing: 4) {
                Text("Claude Usage Settings")
                    .font(.headline)
                if let account = accountStore.activeAccount {
                    if editingAccountId == account.id {
                        HStack(spacing: 4) {
                            TextField("Account name", text: $editingAccountName, onCommit: {
                                if !editingAccountName.isEmpty {
                                    accountStore.rename(id: account.id, to: editingAccountName)
                                }
                                editingAccountId = nil
                            })
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 12))
                            .frame(maxWidth: 180)
                            Button("Save") {
                                if !editingAccountName.isEmpty {
                                    accountStore.rename(id: account.id, to: editingAccountName)
                                }
                                editingAccountId = nil
                            }
                            .font(.system(size: 11))
                            .controlSize(.small)
                        }
                    } else {
                        HStack(spacing: 4) {
                            Text(account.email)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                            Button(action: {
                                editingAccountName = account.email
                                editingAccountId = account.id
                            }) {
                                Image(systemName: "pencil")
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary)
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }

            // Auth status
            HStack(spacing: 6) {
                Circle()
                    .fill(authStatusColor)
                    .frame(width: 8, height: 8)
                Text(authStatusText)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            // Session Key
            VStack(alignment: .leading, spacing: 4) {
                Text("Session Key")
                    .font(.system(size: 12, weight: .medium))
                SecureField("Paste sessionKey cookie value", text: $sessionKeyInput)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))
            }

            // Org ID
            VStack(alignment: .leading, spacing: 4) {
                Text("Organization ID")
                    .font(.system(size: 12, weight: .medium))
                TextField("Paste org ID", text: $orgIdInput)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))
            }

            // Time Display Preference
            VStack(alignment: .leading, spacing: 4) {
                Text("Menu Bar Time Display")
                    .font(.system(size: 12, weight: .medium))
                Picker("Time Format", selection: $timeDisplayFormat) {
                    ForEach(TimeDisplayFormat.allCases, id: \.self) { format in
                        Text(format.displayName)
                            .tag(format)
                    }
                }
                .pickerStyle(.menu)
                .font(.system(size: 12))
            }

            // Pace Theme
            VStack(alignment: .leading, spacing: 4) {
                Text("Pace Theme")
                    .font(.system(size: 12, weight: .medium))
                Picker("Pace Theme", selection: $paceTheme) {
                    ForEach(PaceTheme.allCases, id: \.self) { theme in
                        Text(theme.displayName)
                            .tag(theme)
                    }
                }
                .pickerStyle(.menu)
                .font(.system(size: 12))
            }

            // Weekly Bar Color
            VStack(alignment: .leading, spacing: 4) {
                Text("Weekly Bar Color")
                    .font(.system(size: 12, weight: .medium))
                Picker("Weekly Bar Color", selection: $weeklyColorMode) {
                    ForEach(WeeklyColorMode.allCases, id: \.self) { mode in
                        Text(mode.displayName)
                            .tag(mode)
                    }
                }
                .pickerStyle(.menu)
                .font(.system(size: 12))
            }

            // Buttons
            HStack {
                Button("Save") {
                    saveCredentials()
                }
                .disabled(sessionKeyInput.isEmpty || orgIdInput.isEmpty)

                Button("Test Connection") {
                    testConnection()
                }
                .disabled(sessionKeyInput.isEmpty || orgIdInput.isEmpty || isTesting)

                if isTesting {
                    ProgressView()
                        .scaleEffect(0.5)
                        .frame(width: 16, height: 16)
                }
            }

            // Test result
            if let result = testResult {
                HStack(spacing: 4) {
                    switch result {
                    case .success:
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Connection successful")
                            .foregroundColor(.green)
                    case .authError:
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.red)
                        Text("Authentication failed — check session key")
                            .foregroundColor(.red)
                    case .networkError(let message):
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                        Text(message)
                            .foregroundColor(.orange)
                    }
                }
                .font(.system(size: 11))
            }

            Divider()

            // GitHub Integration
            VStack(alignment: .leading, spacing: 4) {
                Text("GitHub Integration")
                    .font(.system(size: 12, weight: .medium))
                TextField("GitHub username", text: $githubUsername)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))
                SecureField("GitHub personal access token", text: $githubToken)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))
                Text("Token needs `read:user` scope for private contributions")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }

            Divider()

            // Launch at Login
            HStack {
                Toggle("Launch at Login", isOn: $launchAtLogin)
                    .font(.system(size: 12))
                    .onChange(of: launchAtLogin) { newValue in
                        do {
                            if newValue {
                                try SMAppService.mainApp.register()
                            } else {
                                try SMAppService.mainApp.unregister()
                            }
                        } catch {
                            launchAtLogin = !newValue
                        }
                    }

                Spacer()

                Button("Restart App") {
                    restartApp()
                }
                .font(.system(size: 11))
                .controlSize(.small)
            }

            // Accounts list
            if accountStore.accounts.count > 1 {
                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Accounts")
                        .font(.system(size: 12, weight: .medium))

                    ForEach(accountStore.accounts) { account in
                        HStack {
                            Text(account.email)
                                .font(.system(size: 12))
                            if account.id == accountStore.activeAccountId {
                                Text("(active)")
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            if accountStore.accounts.count > 1 {
                                Button(action: {
                                    accountToDelete = account
                                }) {
                                    Image(systemName: "trash")
                                        .font(.system(size: 11))
                                        .foregroundColor(.red)
                                }
                                .buttonStyle(.borderless)
                            }
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(width: 280)
        .onAppear {
            loadActiveAccountCredentials()
            let savedFormat = UserDefaults.standard.string(forKey: "claude_time_display_format") ?? TimeDisplayFormat.resetTime.rawValue
            timeDisplayFormat = TimeDisplayFormat(rawValue: savedFormat) ?? .resetTime
            let savedTheme = UserDefaults.standard.string(forKey: "claude_pace_theme") ?? PaceTheme.running.rawValue
            paceTheme = PaceTheme(rawValue: savedTheme) ?? .running
            let savedColorMode = UserDefaults.standard.string(forKey: WeeklyColorMode.defaultsKey) ?? WeeklyColorMode.paceAware.rawValue
            weeklyColorMode = WeeklyColorMode(rawValue: savedColorMode) ?? .paceAware
            launchAtLogin = SMAppService.mainApp.status == .enabled
            githubUsername = UserDefaults.standard.string(forKey: "claude_github_username") ?? ""
            githubToken = KeychainService.read(key: .githubToken) ?? ""
        }
        .confirmationDialog(
            "Remove Account",
            isPresented: Binding(
                get: { accountToDelete != nil },
                set: { if !$0 { accountToDelete = nil } }
            ),
            presenting: accountToDelete
        ) { account in
            Button("Remove \"\(account.email)\"", role: .destructive) {
                accountStore.remove(id: account.id)
                loadActiveAccountCredentials()
                accountToDelete = nil
            }
            Button("Cancel", role: .cancel) {
                accountToDelete = nil
            }
        } message: { account in
            Text("This will remove \"\(account.email)\" and its stored credentials.")
        }
    }

    private func loadActiveAccountCredentials() {
        guard let accountId = accountStore.activeAccountId else {
            sessionKeyInput = ""
            orgIdInput = ""
            return
        }
        sessionKeyInput = accountStore.sessionKey(for: accountId) ?? ""
        orgIdInput = accountStore.orgId(for: accountId) ?? ""
        testResult = nil
    }

    private var authStatusColor: Color {
        switch viewModel.authStatus {
        case .connected: return .green
        case .expired: return .red
        case .notConfigured: return .gray
        }
    }

    private var authStatusText: String {
        switch viewModel.authStatus {
        case .connected: return "Connected"
        case .expired: return "Session expired"
        case .notConfigured: return "Not configured"
        }
    }

    private func saveCredentials() {
        // Auto-create an account if none exists
        if accountStore.activeAccountId == nil {
            let account = accountStore.add(email: "Account 1")
            accountStore.setActive(id: account.id)
        }
        guard let accountId = accountStore.activeAccountId else { return }
        accountStore.saveSessionKey(sessionKeyInput, for: accountId)
        accountStore.saveOrgId(orgIdInput, for: accountId)
        UserDefaults.standard.set(timeDisplayFormat.rawValue, forKey: "claude_time_display_format")
        UserDefaults.standard.set(paceTheme.rawValue, forKey: "claude_pace_theme")
        UserDefaults.standard.set(weeklyColorMode.rawValue, forKey: WeeklyColorMode.defaultsKey)

        // Save GitHub credentials (global, not per-account)
        UserDefaults.standard.set(githubUsername, forKey: "claude_github_username")
        if !githubToken.isEmpty {
            KeychainService.save(key: .githubToken, value: githubToken)
        }
        githubViewModel.checkConfiguration()
        githubViewModel.startPollingIfConfigured()

        viewModel.updateAuthStatus()
        viewModel.startPollingIfConfigured()
        testResult = nil
    }

    private func restartApp() {
        let bundlePath = Bundle.main.bundlePath
        let task = Process()
        task.launchPath = "/usr/bin/open"
        task.arguments = ["-n", bundlePath, "--args", "--restarted"]
        try? task.run()

        // Give the new instance a moment to launch, then exit
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            NSApplication.shared.terminate(nil)
        }
    }

    private func testConnection() {
        isTesting = true
        testResult = nil

        let service = UsageService(sessionKey: sessionKeyInput, orgId: orgIdInput)

        Task {
            do {
                let (_, newKey) = try await service.fetchUsage()
                if let newKey = newKey {
                    if let accountId = accountStore.activeAccountId {
                        accountStore.saveSessionKey(newKey, for: accountId)
                    }
                    await MainActor.run {
                        sessionKeyInput = newKey
                    }
                }
                await MainActor.run {
                    testResult = .success
                    isTesting = false
                    saveCredentials()
                    viewModel.authStatus = .connected
                }
            } catch let error as UsageServiceError {
                await MainActor.run {
                    switch error {
                    case .authError:
                        testResult = .authError
                        viewModel.authStatus = .expired
                    default:
                        testResult = .networkError("Request failed: \(error)")
                    }
                    isTesting = false
                }
            } catch {
                await MainActor.run {
                    testResult = .networkError("Network error: \(error.localizedDescription)")
                    isTesting = false
                }
            }
        }
    }
}
