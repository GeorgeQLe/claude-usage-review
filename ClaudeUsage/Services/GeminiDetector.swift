import Foundation

enum GeminiInstallStatus: Equatable {
    case installed, notInstalled
}

enum GeminiAuthMode: String, CaseIterable, Equatable {
    case oauthPersonal, apiKey, vertexAI, codeAssist

    var displayName: String {
        switch self {
        case .oauthPersonal: return "OAuth Personal"
        case .apiKey: return "API Key"
        case .vertexAI: return "Vertex AI"
        case .codeAssist: return "Code Assist"
        }
    }
}

enum GeminiAuthStatus: Equatable {
    case authenticated(mode: GeminiAuthMode)
    case authAbsent
}

struct GeminiDetectionResult {
    let installStatus: GeminiInstallStatus
    let authStatus: GeminiAuthStatus
}

class GeminiDetector {
    let geminiHome: URL
    let fileManager: FileManager

    init(geminiHome: URL, fileManager: FileManager = .default) {
        self.geminiHome = geminiHome
        self.fileManager = fileManager
    }

    func detect() -> GeminiDetectionResult {
        let settingsPath = geminiHome.appendingPathComponent("settings.json").path
        guard fileManager.fileExists(atPath: settingsPath) else {
            return GeminiDetectionResult(installStatus: .notInstalled, authStatus: .authAbsent)
        }

        let authMode = readAuthMode(settingsPath: settingsPath)
        let authStatus = resolveAuthStatus(mode: authMode)

        return GeminiDetectionResult(installStatus: .installed, authStatus: authStatus)
    }

    // MARK: - Private

    private func readAuthMode(settingsPath: String) -> GeminiAuthMode? {
        guard let data = fileManager.contents(atPath: settingsPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let security = json["security"] as? [String: Any],
              let auth = security["auth"] as? [String: Any],
              let selectedType = auth["selectedType"] as? String
        else { return nil }

        switch selectedType {
        case "oauth-personal": return .oauthPersonal
        case "api-key": return .apiKey
        case "vertex-ai": return .vertexAI
        case "code-assist": return .codeAssist
        default: return nil
        }
    }

    private func resolveAuthStatus(mode: GeminiAuthMode?) -> GeminiAuthStatus {
        guard let mode = mode else { return .authAbsent }

        switch mode {
        case .oauthPersonal:
            let credsPath = geminiHome.appendingPathComponent("oauth_creds.json").path
            return fileManager.fileExists(atPath: credsPath)
                ? .authenticated(mode: .oauthPersonal) : .authAbsent
        case .apiKey, .vertexAI, .codeAssist:
            return .authAbsent
        }
    }
}
