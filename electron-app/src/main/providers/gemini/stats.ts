import type { ProviderConfidence } from "../../../shared/types/provider.js";

export interface GeminiStatsSummary {
  readonly confidence: ProviderConfidence;
  readonly dailyLimit: number | null;
  readonly dailyRequestCount: number | null;
  readonly diagnostics: readonly string[];
  readonly model: string | null;
  readonly resetAt: string | null;
  readonly tokenCount: number | null;
}

export interface GeminiStatsCommandResult {
  readonly stdout: string;
  readonly stderr?: string;
  readonly exitCode?: number;
}

export type GeminiStatsCommandRunner = () => Promise<GeminiStatsCommandResult>;

export async function readGeminiStatsSummary(input: {
  readonly runner?: GeminiStatsCommandRunner;
} = {}): Promise<GeminiStatsSummary> {
  if (!input.runner) {
    return emptyStatsSummary(["Gemini /stats command runner is not configured."]);
  }

  try {
    const result = await input.runner();
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const parsed = parseGeminiStatsSummary(output);

    if (result.exitCode && result.exitCode !== 0) {
      return {
        ...parsed,
        confidence: "observed_only",
        diagnostics: [
          ...parsed.diagnostics,
          `Gemini /stats command exited with code ${result.exitCode}.`
        ]
      };
    }

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Gemini /stats command error.";
    return emptyStatsSummary([`Gemini /stats command failed: ${redactGeminiStatsDiagnostics(message)}`]);
  }
}

export function parseGeminiStatsSummary(output: string): GeminiStatsSummary {
  const redactedOutput = redactGeminiStatsDiagnostics(output);
  const unsupportedDiagnostic = readUnsupportedDiagnostic(redactedOutput);
  if (unsupportedDiagnostic) {
    return emptyStatsSummary([unsupportedDiagnostic]);
  }

  const dailyUsage = readDailyUsage(redactedOutput);
  const tokenCount = readNumberLine(redactedOutput, /tokens?\s+today\s*:\s*([\d,]+)/iu);
  const model = readStringLine(redactedOutput, /model\s*:\s*([^\n\r]+)/iu);
  const resetAt = readResetAt(redactedOutput);
  const hasReliableSummary =
    dailyUsage.dailyRequestCount !== null ||
    dailyUsage.dailyLimit !== null ||
    tokenCount !== null ||
    model !== null ||
    resetAt !== null;

  if (!hasReliableSummary) {
    return emptyStatsSummary(["Gemini /stats output did not include a supported usage summary."]);
  }

  return {
    confidence: "high_confidence",
    dailyLimit: dailyUsage.dailyLimit,
    dailyRequestCount: dailyUsage.dailyRequestCount,
    diagnostics: [],
    model,
    resetAt,
    tokenCount
  };
}

export function redactGeminiStatsDiagnostics(message: string): string {
  return message
    .replace(
      /(access[_ -]?token|refresh[_ -]?token|oauth[_ -]?token|api[_ -]?key|apikey|authorization|bearer|cookie|session[_ -]?key)(\s*[=:]?\s*)?["']?[\w.+/=-]+["']?/giu,
      "redacted"
    )
    .replace(/\bya29\.[\w.-]+\b/giu, "redacted")
    .replace(/\bAIza[\w-]+\b/gu, "redacted");
}

function emptyStatsSummary(diagnostics: readonly string[]): GeminiStatsSummary {
  return {
    confidence: "observed_only",
    dailyLimit: null,
    dailyRequestCount: null,
    diagnostics,
    model: null,
    resetAt: null,
    tokenCount: null
  };
}

function readUnsupportedDiagnostic(output: string): string | null {
  if (/unknown\s+command|unsupported|not\s+available|not\s+recognized|missing\s+command/iu.test(output)) {
    return "Gemini /stats is unsupported or unavailable in this environment.";
  }

  if (!output.trim()) {
    return "Gemini /stats output was empty.";
  }

  return null;
}

function readDailyUsage(output: string): {
  readonly dailyLimit: number | null;
  readonly dailyRequestCount: number | null;
} {
  const paired = /requests?\s+today\s*:\s*([\d,]+)\s*\/\s*([\d,]+)/iu.exec(output);
  if (paired) {
    return {
      dailyRequestCount: parseInteger(paired[1]),
      dailyLimit: parseInteger(paired[2])
    };
  }

  return {
    dailyRequestCount: readNumberLine(output, /requests?\s+today\s*:\s*([\d,]+)/iu),
    dailyLimit: readNumberLine(output, /daily\s+limit\s*:\s*([\d,]+)/iu)
  };
}

function readNumberLine(output: string, pattern: RegExp): number | null {
  const match = pattern.exec(output);
  return match ? parseInteger(match[1]) : null;
}

function readStringLine(output: string, pattern: RegExp): string | null {
  const match = pattern.exec(output);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function readResetAt(output: string): string | null {
  const raw = readStringLine(output, /reset\s*:\s*([^\n\r]+)/iu);
  if (!raw) {
    return null;
  }

  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.replaceAll(",", ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
