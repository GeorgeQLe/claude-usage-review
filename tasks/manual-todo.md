# Manual Tasks

- [ ] Validate Codex Provider Telemetry with a real ChatGPT-backed Codex CLI account: confirm telemetry is off by default, enable it, refresh manually, verify rate-limit snapshots render, and confirm passive Codex state remains available after disabling telemetry. _(after: Step 7.8)_
- [ ] Validate Gemini Provider Telemetry with a real Gemini CLI Code Assist account: confirm telemetry is off by default, enable it, refresh manually, verify quota buckets render, and confirm passive Gemini state remains available after disabling telemetry. _(after: Step 7.8)_
- [ ] Validate failure fallback manually by using missing, expired, encrypted, or intentionally unsupported provider credentials and confirming the UI shows telemetry unavailable/degraded while passive or Accuracy Mode state remains visible. _(after: Step 7.8)_
