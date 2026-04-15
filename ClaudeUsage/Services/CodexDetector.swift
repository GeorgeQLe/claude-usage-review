import Foundation

enum CodexInstallStatus: Equatable {
    case installed, notInstalled
}

enum CodexAuthStatus: Equatable {
    case authPresent, authAbsent
}

struct CodexDetectionResult {
    let installStatus: CodexInstallStatus
    let authStatus: CodexAuthStatus
}

class CodexDetector {
    let codexHome: URL
    let fileManager: FileManager

    static func defaultCodexHome(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        if let configuredHome = environment["CODEX_HOME"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !configuredHome.isEmpty {
            return URL(fileURLWithPath: configuredHome)
        }
        return URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".codex")
    }

    init(codexHome: URL, fileManager: FileManager = .default) {
        self.codexHome = codexHome
        self.fileManager = fileManager
    }

    func detect() -> CodexDetectionResult {
        let configPath = codexHome.appendingPathComponent("config.toml").path
        let installStatus: CodexInstallStatus = fileManager.fileExists(atPath: configPath)
            ? .installed : .notInstalled

        let authPath = codexHome.appendingPathComponent("auth.json").path
        let authStatus: CodexAuthStatus = fileManager.fileExists(atPath: authPath)
            ? .authPresent : .authAbsent

        return CodexDetectionResult(
            installStatus: installStatus,
            authStatus: authStatus
        )
    }
}
