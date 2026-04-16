import Foundation
import Combine

class ProviderSettingsStore: ObservableObject {
    @Published var enabledProviders: Set<ProviderId>

    private let defaults: UserDefaults

    private static let keys: [ProviderId: String] = [
        .claude: "provider_claude_enabled",
        .codex: "provider_codex_enabled",
        .gemini: "provider_gemini_enabled",
    ]

    private static let telemetryKeys: [ProviderId: String] = [
        .codex: "provider_codex_telemetry_enabled",
        .gemini: "provider_gemini_telemetry_enabled",
    ]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
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
        defaults.set(enabled, forKey: Self.keys[id]!)
    }

    func codexPlan() -> CodexPlanProfile? {
        guard let name = defaults.string(forKey: "provider_codex_plan"),
              let limit = defaults.object(forKey: "provider_codex_plan_limit") as? Int else {
            return nil
        }
        return CodexPlanProfile(name: name, dailyTokenLimit: limit)
    }

    func setCodexPlan(_ plan: CodexPlanProfile?) {
        objectWillChange.send()
        if let plan = plan {
            defaults.set(plan.name, forKey: "provider_codex_plan")
            defaults.set(plan.dailyTokenLimit, forKey: "provider_codex_plan_limit")
        } else {
            defaults.removeObject(forKey: "provider_codex_plan")
            defaults.removeObject(forKey: "provider_codex_plan_limit")
        }
    }

    func codexAccuracyMode() -> Bool {
        defaults.bool(forKey: "provider_codex_accuracy_mode")
    }

    func setCodexAccuracyMode(_ enabled: Bool) {
        objectWillChange.send()
        defaults.set(enabled, forKey: "provider_codex_accuracy_mode")
    }

    func geminiAccuracyMode() -> Bool {
        defaults.bool(forKey: "provider_gemini_accuracy_mode")
    }

    func setGeminiAccuracyMode(_ enabled: Bool) {
        objectWillChange.send()
        defaults.set(enabled, forKey: "provider_gemini_accuracy_mode")
    }

    func geminiPlan() -> GeminiPlanProfile? {
        guard let name = defaults.string(forKey: "provider_gemini_plan"),
              let dailyLimit = defaults.object(forKey: "provider_gemini_plan_daily_limit") as? Int,
              let rpmLimit = defaults.object(forKey: "provider_gemini_plan_rpm_limit") as? Int else {
            return nil
        }
        return GeminiPlanProfile(name: name, dailyRequestLimit: dailyLimit, requestsPerMinuteLimit: rpmLimit)
    }

    func setGeminiPlan(_ plan: GeminiPlanProfile?) {
        objectWillChange.send()
        if let plan = plan {
            defaults.set(plan.name, forKey: "provider_gemini_plan")
            defaults.set(plan.dailyRequestLimit, forKey: "provider_gemini_plan_daily_limit")
            defaults.set(plan.requestsPerMinuteLimit, forKey: "provider_gemini_plan_rpm_limit")
        } else {
            defaults.removeObject(forKey: "provider_gemini_plan")
            defaults.removeObject(forKey: "provider_gemini_plan_daily_limit")
            defaults.removeObject(forKey: "provider_gemini_plan_rpm_limit")
        }
    }

    func geminiAuthMode() -> GeminiAuthMode? {
        guard let raw = defaults.string(forKey: "provider_gemini_auth_mode") else {
            return nil
        }
        return GeminiAuthMode(rawValue: raw)
    }

    func setGeminiAuthMode(_ mode: GeminiAuthMode?) {
        objectWillChange.send()
        if let mode = mode {
            defaults.set(mode.rawValue, forKey: "provider_gemini_auth_mode")
        } else {
            defaults.removeObject(forKey: "provider_gemini_auth_mode")
        }
    }

    func providerTelemetryEnabled(for id: ProviderId) -> Bool {
        guard let key = Self.telemetryKeys[id] else {
            return false
        }
        return defaults.bool(forKey: key)
    }

    func setProviderTelemetryEnabled(_ enabled: Bool, for id: ProviderId) {
        guard let key = Self.telemetryKeys[id] else {
            return
        }
        objectWillChange.send()
        defaults.set(enabled, forKey: key)
    }
}
