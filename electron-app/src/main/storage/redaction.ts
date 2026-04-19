const redactedValue = "[REDACTED]";

const secretKeyPattern =
  /(^|[_\-\s.])(authorization|bearer|cookie|session|sessionkey|session_key|token|secret|password|api[_-]?key|github[_-]?token|stdout|stderr|output|response|prompt|chat|chatbody)([_\-\s.]|$)/i;

const textRedactionPatterns: readonly [RegExp, string][] = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, `Bearer ${redactedValue}`],
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, redactedValue],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, redactedValue],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, redactedValue],
  [
    /\b(sessionKey|session_key|claude_session_key|__Secure-next-auth\.session-token|cf_clearance)=([^;\s]+)/gi,
    `$1=${redactedValue}`
  ],
  [
    /\b(authorization|cookie|sessionKey|session_key|access_token|refresh_token|github_token|api_key|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi,
    `$1=${redactedValue}`
  ]
];

export function redactSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value.length === 0) {
    return "";
  }

  return redactedValue;
}

export function redactText(value: string): string {
  return textRedactionPatterns.reduce((redacted, [pattern, replacement]) => redacted.replace(pattern, replacement), value);
}

export function redactDiagnosticPayload<T>(payload: T): T {
  return redactValue(payload) as T;
}

export function stringifyRedactedDiagnosticPayload(payload: unknown): string {
  return JSON.stringify(redactDiagnosticPayload(payload));
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, shouldRedactKey(key) ? redactedValue : redactValue(entry)])
  );
}

function shouldRedactKey(key: string): boolean {
  return secretKeyPattern.test(key);
}
