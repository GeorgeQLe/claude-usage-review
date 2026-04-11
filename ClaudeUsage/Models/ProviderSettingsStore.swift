import Foundation
import Combine

class ProviderSettingsStore: ObservableObject {
    @Published var enabledProviders: Set<ProviderId>

    private static let keys: [ProviderId: String] = [
        .claude: "provider_claude_enabled",
        .codex: "provider_codex_enabled",
        .gemini: "provider_gemini_enabled",
    ]

    init() {
        let defaults = UserDefaults.standard
        var enabled: Set<ProviderId> = [.claude]
        if defaults.bool(forKey: Self.keys[.codex]!) {
            enabled.insert(.codex)
        }
        if defaults.bool(forKey: Self.keys[.gemini]!) {
            enabled.insert(.gemini)
        }
        self.enabledProviders = enabled
    }

    func isEnabled(_ id: ProviderId) -> Bool {
        if id == .claude { return true }
        return enabledProviders.contains(id)
    }

    func setEnabled(_ id: ProviderId, _ enabled: Bool) {
        guard id != .claude else { return }
        if enabled {
            enabledProviders.insert(id)
        } else {
            enabledProviders.remove(id)
        }
        UserDefaults.standard.set(enabled, forKey: Self.keys[id]!)
    }

    func codexPlan() -> CodexPlanProfile? {
        guard let name = UserDefaults.standard.string(forKey: "provider_codex_plan"),
              let limit = UserDefaults.standard.object(forKey: "provider_codex_plan_limit") as? Int else {
            return nil
        }
        return CodexPlanProfile(name: name, dailyTokenLimit: limit)
    }

    func setCodexPlan(_ plan: CodexPlanProfile?) {
        if let plan = plan {
            UserDefaults.standard.set(plan.name, forKey: "provider_codex_plan")
            UserDefaults.standard.set(plan.dailyTokenLimit, forKey: "provider_codex_plan_limit")
        } else {
            UserDefaults.standard.removeObject(forKey: "provider_codex_plan")
            UserDefaults.standard.removeObject(forKey: "provider_codex_plan_limit")
        }
    }

    func codexAccuracyMode() -> Bool {
        UserDefaults.standard.bool(forKey: "provider_codex_accuracy_mode")
    }

    func setCodexAccuracyMode(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: "provider_codex_accuracy_mode")
    }

    func geminiPlan() -> GeminiPlanProfile? {
        guard let name = UserDefaults.standard.string(forKey: "provider_gemini_plan"),
              let dailyLimit = UserDefaults.standard.object(forKey: "provider_gemini_plan_daily_limit") as? Int,
              let rpmLimit = UserDefaults.standard.object(forKey: "provider_gemini_plan_rpm_limit") as? Int else {
            return nil
        }
        return GeminiPlanProfile(name: name, dailyRequestLimit: dailyLimit, requestsPerMinuteLimit: rpmLimit)
    }

    func setGeminiPlan(_ plan: GeminiPlanProfile?) {
        if let plan = plan {
            UserDefaults.standard.set(plan.name, forKey: "provider_gemini_plan")
            UserDefaults.standard.set(plan.dailyRequestLimit, forKey: "provider_gemini_plan_daily_limit")
            UserDefaults.standard.set(plan.requestsPerMinuteLimit, forKey: "provider_gemini_plan_rpm_limit")
        } else {
            UserDefaults.standard.removeObject(forKey: "provider_gemini_plan")
            UserDefaults.standard.removeObject(forKey: "provider_gemini_plan_daily_limit")
            UserDefaults.standard.removeObject(forKey: "provider_gemini_plan_rpm_limit")
        }
    }

    func geminiAuthMode() -> GeminiAuthMode? {
        guard let raw = UserDefaults.standard.string(forKey: "provider_gemini_auth_mode") else {
            return nil
        }
        switch raw {
        case "oauthPersonal": return .oauthPersonal
        case "apiKey": return .apiKey
        case "vertexAI": return .vertexAI
        case "codeAssist": return .codeAssist
        default: return nil
        }
    }

    func setGeminiAuthMode(_ mode: GeminiAuthMode?) {
        if let mode = mode {
            let raw: String
            switch mode {
            case .oauthPersonal: raw = "oauthPersonal"
            case .apiKey: raw = "apiKey"
            case .vertexAI: raw = "vertexAI"
            case .codeAssist: raw = "codeAssist"
            }
            UserDefaults.standard.set(raw, forKey: "provider_gemini_auth_mode")
        } else {
            UserDefaults.standard.removeObject(forKey: "provider_gemini_auth_mode")
        }
    }
}
