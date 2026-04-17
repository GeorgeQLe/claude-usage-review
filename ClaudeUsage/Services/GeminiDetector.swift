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

    static func defaultGeminiHome(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        if let configuredHome = environment["GEMINI_HOME"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !configuredHome.isEmpty {
            return URL(fileURLWithPath: configuredHome)
        }
        return URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".gemini")
    }

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
        case .codeAssist:
            let credsPath = geminiHome.appendingPathComponent("oauth_creds.json").path
            return fileManager.fileExists(atPath: credsPath)
                ? .authenticated(mode: .codeAssist) : .authAbsent
        case .apiKey, .vertexAI:
            return .authAbsent
        }
    }
}

final class GeminiTelemetryAuthProvider: GeminiTelemetryAuthProviding {
    private let geminiHome: URL
    private let fileManager: FileManager
    private let now: () -> Date

    init(
        geminiHome: URL = GeminiDetector.defaultGeminiHome(),
        fileManager: FileManager = .default,
        now: @escaping () -> Date = Date.init
    ) {
        self.geminiHome = geminiHome
        self.fileManager = fileManager
        self.now = now
    }

    func currentAuth() throws -> GeminiTelemetryAuth {
        let settingsURL = geminiHome.appendingPathComponent("settings.json")
        guard fileManager.fileExists(atPath: settingsURL.path) else {
            throw ProviderTelemetryError.authUnavailable("Gemini Code Assist auth unavailable")
        }

        let settings = try readJSONObject(
            at: settingsURL,
            unavailableReason: "Gemini Code Assist auth unavailable",
            malformedReason: "Malformed Gemini settings"
        )

        guard selectedAuthMode(from: settings) == .codeAssist else {
            throw ProviderTelemetryError.unsupportedCredentials(
                "Gemini Code Assist telemetry requires Code Assist OAuth credentials"
            )
        }

        if settingsIndicateEncryptedStore(settings) {
            throw ProviderTelemetryError.unsupportedCredentials(
                "Gemini Code Assist credentials are stored in an unsupported encrypted store"
            )
        }

        let credsURL = geminiHome.appendingPathComponent("oauth_creds.json")
        guard fileManager.fileExists(atPath: credsURL.path) else {
            throw ProviderTelemetryError.authUnavailable("Gemini Code Assist auth unavailable")
        }

        let creds = try readJSONObject(
            at: credsURL,
            unavailableReason: "Gemini Code Assist auth unavailable",
            malformedReason: "Malformed Gemini Code Assist auth"
        )

        if authIsExpired(creds) {
            throw ProviderTelemetryError.authUnavailable("Gemini Code Assist auth expired")
        }

        guard let accessToken = firstString(
            in: creds,
            keys: ["access_token", "accessToken", "token"]
        ) else {
            throw ProviderTelemetryError.authUnavailable("Gemini Code Assist auth unavailable")
        }

        guard let projectId = projectId(from: settings, creds: creds) else {
            throw ProviderTelemetryError.authUnavailable("Gemini Code Assist project unavailable")
        }

        return .codeAssistOAuth(
            accessToken: accessToken,
            projectId: projectId,
            accountLabel: accountLabel(from: creds) ?? "Gemini Code Assist"
        )
    }

    private func readJSONObject(
        at url: URL,
        unavailableReason: String,
        malformedReason: String
    ) throws -> [String: Any] {
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            throw ProviderTelemetryError.authUnavailable(unavailableReason)
        }

        do {
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw ProviderTelemetryError.authUnavailable(malformedReason)
            }
            return object
        } catch let telemetryError as ProviderTelemetryError {
            throw telemetryError
        } catch {
            throw ProviderTelemetryError.authUnavailable(malformedReason)
        }
    }

    private func selectedAuthMode(from settings: [String: Any]) -> GeminiAuthMode? {
        guard let security = settings.dictionaryValue(for: "security"),
              let auth = security.dictionaryValue(for: "auth"),
              let selectedType = auth.stringValue(for: "selectedType") else {
            return nil
        }

        switch selectedType {
        case "oauth-personal": return .oauthPersonal
        case "api-key": return .apiKey
        case "vertex-ai": return .vertexAI
        case "code-assist": return .codeAssist
        default: return nil
        }
    }

    private func settingsIndicateEncryptedStore(_ settings: [String: Any]) -> Bool {
        guard let data = try? JSONSerialization.data(withJSONObject: settings),
              let raw = String(data: data, encoding: .utf8)?.lowercased() else {
            return false
        }
        return raw.contains("credentialstore")
            && (raw.contains("keychain") || raw.contains("encrypted") || raw.contains("os-managed"))
    }

    private func projectId(from settings: [String: Any], creds: [String: Any]) -> String? {
        if let project = firstString(
            in: creds,
            keys: ["project_id", "projectId", "quota_project_id", "quotaProjectId"]
        ) {
            return project
        }

        guard let auth = settings.dictionaryValue(for: "security")?.dictionaryValue(for: "auth") else {
            return firstString(in: settings, keys: ["project_id", "projectId", "quota_project_id"])
        }

        return firstString(
            in: auth,
            keys: ["project_id", "projectId", "quota_project_id", "quotaProjectId"]
        )
    }

    private func accountLabel(from creds: [String: Any]) -> String? {
        if let email = firstString(in: creds, keys: ["email", "account_email", "accountEmail"]) {
            return email
        }

        if let idToken = firstString(in: creds, keys: ["id_token", "idToken"]) {
            return emailFromJWT(idToken)
        }

        return nil
    }

    private func authIsExpired(_ values: [String: Any]) -> Bool {
        guard let dateString = firstString(
            in: values,
            keys: ["expiry", "expires_at", "expiresAt", "expiration_time", "expirationTime"]
        ),
        let expiresAt = Self.iso.date(from: dateString) else {
            return false
        }
        return expiresAt <= now()
    }

    private func firstString(in values: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = values.stringValue(for: key)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !value.isEmpty {
                return value
            }
        }
        return nil
    }

    private func emailFromJWT(_ jwt: String) -> String? {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 {
            payload.append("=")
        }
        guard let data = Data(base64Encoded: payload),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return object.stringValue(for: "email")
    }

    private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

private extension Dictionary where Key == String, Value == Any {
    func stringValue(for key: String) -> String? {
        self[key] as? String
    }

    func dictionaryValue(for key: String) -> [String: Any]? {
        self[key] as? [String: Any]
    }
}
