import { z } from "zod";

export const providerStatusSchema = z.enum([
  "configured",
  "missing_configuration",
  "stale",
  "degraded",
  "expired"
]);

export const providerConfidenceSchema = z.enum([
  "exact",
  "high_confidence",
  "estimated",
  "observed_only"
]);

export const providerAdapterModeSchema = z.enum(["passive", "accuracy"]);

export const providerAuthModeSchema = z.enum(["unknown", "oauth-personal", "api-key", "session-cookie", "none"]);

export const providerPlanSchema = z.enum(["unknown", "free", "pro", "team", "enterprise"]);

export const providerIdSchema = z.string().min(1);

export const providerCardSchema = z.object({
  providerId: providerIdSchema,
  displayName: z.string().min(1),
  enabled: z.boolean(),
  status: providerStatusSchema,
  confidence: providerConfidenceSchema,
  headline: z.string(),
  detailText: z.string().nullable(),
  sessionUtilization: z.number().min(0).max(1).nullable(),
  weeklyUtilization: z.number().min(0).max(1).nullable(),
  dailyRequestCount: z.number().int().nonnegative().nullable(),
  requestsPerMinute: z.number().nonnegative().nullable(),
  resetAt: z.string().datetime().nullable(),
  lastUpdatedAt: z.string().datetime().nullable(),
  adapterMode: providerAdapterModeSchema,
  confidenceExplanation: z.string(),
  actions: z.array(z.string())
});

export const providerSettingsSchema = z.object({
  enabled: z.boolean(),
  setupPromptDismissed: z.boolean().default(false),
  accuracyModeEnabled: z.boolean().default(false),
  adapterMode: providerAdapterModeSchema.default("passive"),
  authMode: providerAuthModeSchema.default("unknown"),
  plan: providerPlanSchema.default("unknown"),
  profileLabel: z.string().trim().min(1).nullable().default(null),
  lastRefreshAt: z.string().datetime().nullable().default(null),
  staleAfterMinutes: z.number().int().min(1).max(24 * 60).default(30)
});

export const providerSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  setupPromptDismissed: z.boolean().optional(),
  accuracyModeEnabled: z.boolean().optional(),
  adapterMode: providerAdapterModeSchema.optional(),
  authMode: providerAuthModeSchema.optional(),
  plan: providerPlanSchema.optional(),
  profileLabel: z.string().trim().min(1).nullable().optional(),
  lastRefreshAt: z.string().datetime().nullable().optional(),
  staleAfterMinutes: z.number().int().min(1).max(24 * 60).optional()
});

const unsafeDiagnosticsPattern = /(access[_-]?token|api[_-]?key|authorization|bearer|cookie|session[_-]?key|prompt|response|chat body|oauth[_-]?creds)=?/iu;

export const providerDiagnosticsSchema = z
  .object({
    providerId: providerIdSchema,
    status: z.enum(["not_configured", "ready", "degraded"]),
    messages: z.array(z.string().refine((message) => !unsafeDiagnosticsPattern.test(message), "Diagnostics must be redacted.")),
    lastCheckedAt: z.string().datetime().nullable(),
    redacted: z.literal(true)
  })
  .strict();
