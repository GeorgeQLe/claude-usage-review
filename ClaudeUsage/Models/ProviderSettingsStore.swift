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
}
