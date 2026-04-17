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

final class CodexTelemetryAuthProvider: CodexTelemetryAuthProviding {
    private let codexHome: URL
    private let fileManager: FileManager
    private let now: () -> Date

    init(
        codexHome: URL = CodexDetector.defaultCodexHome(),
        fileManager: FileManager = .default,
        now: @escaping () -> Date = Date.init
    ) {
        self.codexHome = codexHome
        self.fileManager = fileManager
        self.now = now
    }

    func currentAuth() throws -> CodexTelemetryAuth {
        let authURL = codexHome.appendingPathComponent("auth.json")
        guard fileManager.fileExists(atPath: authURL.path) else {
            if configIndicatesEncryptedStore() {
                throw ProviderTelemetryError.unsupportedCredentials(
                    "Codex CLI credentials are stored in an unsupported encrypted store"
                )
            }
            throw ProviderTelemetryError.authUnavailable("Codex CLI auth unavailable")
        }

        let data: Data
        do {
            data = try Data(contentsOf: authURL)
        } catch {
            throw ProviderTelemetryError.authUnavailable("Codex CLI auth unavailable")
        }

        let root: [String: Any]
        do {
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw ProviderTelemetryError.authUnavailable("Malformed Codex CLI auth")
            }
            root = object
        } catch let telemetryError as ProviderTelemetryError {
            throw telemetryError
        } catch {
            throw ProviderTelemetryError.authUnavailable("Malformed Codex CLI auth")
        }

        if authIsExpired(root) {
            throw ProviderTelemetryError.authUnavailable("Codex CLI auth expired")
        }

        let authMode = root.stringValue(for: "auth_mode")?.lowercased()
        if authMode == "chatgptauthtokens" {
            throw ProviderTelemetryError.unsupportedCredentials("Unsupported Codex CLI auth mode")
        }

        if let apiKey = apiKey(from: root) {
            return .codexAPI(
                baseURL: configuredBaseURL(),
                apiKey: apiKey,
                accountLabel: "Codex API"
            )
        }

        if let tokens = root.dictionaryValue(for: "tokens"),
           let accessToken = tokens.stringValue(for: "access_token"),
           !accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if authIsExpired(tokens) {
                throw ProviderTelemetryError.authUnavailable("Codex CLI auth expired")
            }
            return .chatGPT(
                accessToken: accessToken,
                accountLabel: accountLabel(from: tokens) ?? accountLabel(from: root)
            )
        }

        if authMode == "chatgpt" {
            throw ProviderTelemetryError.authUnavailable("Codex CLI auth unavailable")
        }

        throw ProviderTelemetryError.unsupportedCredentials("Unsupported Codex CLI auth mode")
    }

    private func apiKey(from root: [String: Any]) -> String? {
        [
            root.stringValue(for: "OPENAI_API_KEY"),
            root.stringValue(for: "api_key"),
            root.stringValue(for: "openai_api_key"),
        ]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .first { !$0.isEmpty }
    }

    private func accountLabel(from values: [String: Any]) -> String? {
        if let email = values.stringValue(for: "email"), !email.isEmpty {
            return email
        }

        if let idToken = values.stringValue(for: "id_token") {
            return emailFromJWT(idToken)
        }

        if let nested = values.dictionaryValue(for: "id_token") {
            return nested.stringValue(for: "email")
        }

        return nil
    }

    private func authIsExpired(_ values: [String: Any]) -> Bool {
        let dateString = values.stringValue(for: "expires_at")
            ?? values.stringValue(for: "expiry")
            ?? values.stringValue(for: "expiresAt")
        guard let dateString,
              let expiresAt = Self.iso.date(from: dateString) else {
            return false
        }
        return expiresAt <= now()
    }

    private func configuredBaseURL() -> URL {
        let configURL = codexHome.appendingPathComponent("config.toml")
        guard let contents = try? String(contentsOf: configURL, encoding: .utf8),
              let parsed = Self.firstQuotedValue(named: "base_url", in: contents)
                ?? Self.firstQuotedValue(named: "baseURL", in: contents),
              let url = URL(string: parsed) else {
            return URL(string: "https://api.openai.com")!
        }
        return url.removingTrailingSlash()
    }

    private func configIndicatesEncryptedStore() -> Bool {
        let configURL = codexHome.appendingPathComponent("config.toml")
        guard let contents = try? String(contentsOf: configURL, encoding: .utf8) else {
            return false
        }
        let lower = contents.lowercased()
        return lower.contains("auth_credentials_store")
            && (lower.contains("\"keyring\"") || lower.contains("'keyring'") || lower.contains("= keyring"))
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
        if let email = object.stringValue(for: "email") {
            return email
        }
        return object.dictionaryValue(for: "https://api.openai.com/profile")?.stringValue(for: "email")
    }

    private static func firstQuotedValue(named key: String, in contents: String) -> String? {
        for line in contents.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.hasPrefix("#"),
                  trimmed.hasPrefix(key),
                  let equals = trimmed.firstIndex(of: "=") else {
                continue
            }

            let value = trimmed[trimmed.index(after: equals)...]
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard let quote = value.first,
                  quote == "\"" || quote == "'" else {
                continue
            }
            let tail = value.dropFirst()
            guard let end = tail.firstIndex(of: quote) else {
                continue
            }
            return String(tail[..<end])
        }
        return nil
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

private extension URL {
    func removingTrailingSlash() -> URL {
        var value = absoluteString
        while value.count > "https://x".count && value.hasSuffix("/") {
            value.removeLast()
        }
        return URL(string: value) ?? self
    }
}
