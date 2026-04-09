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
