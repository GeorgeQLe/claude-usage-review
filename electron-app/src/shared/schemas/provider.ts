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

export const providerCardSchema = z.object({
  providerId: z.string().min(1),
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
  adapterMode: z.enum(["passive", "accuracy"]),
  confidenceExplanation: z.string(),
  actions: z.array(z.string())
});
