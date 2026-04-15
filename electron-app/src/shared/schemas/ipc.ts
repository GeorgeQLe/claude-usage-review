import { z } from "zod";
import { appSettingsSchema, overlaySettingsSchema } from "./settings.js";

export const addAccountPayloadSchema = z.object({
  label: z.string().min(1)
});

export const accountIdPayloadSchema = z.object({
  accountId: z.string().min(1)
});

export const renameAccountPayloadSchema = z.object({
  accountId: z.string().min(1),
  label: z.string().min(1)
});

export const saveClaudeCredentialsPayloadSchema = z.object({
  accountId: z.string().min(1),
  sessionKey: z.string().min(1),
  orgId: z.string().min(1)
});

export const testClaudeConnectionPayloadSchema = z.object({
  sessionKey: z.string().min(1),
  orgId: z.string().min(1)
});

export const updateSettingsPayloadSchema = z.object({
  patch: appSettingsSchema.partial().extend({
    overlay: overlaySettingsSchema.partial().optional()
  })
});

export const providerCommandPayloadSchema = z.object({
  providerId: z.string().min(1)
});

export const claudeConnectionTestResultSchema = z.object({
  ok: z.boolean(),
  status: z.enum(["not_implemented", "invalid"]),
  message: z.string()
});

export const providerDiagnosticsResultSchema = z.object({
  providerId: z.string().min(1),
  status: z.enum(["not_configured", "ready", "degraded"]),
  messages: z.array(z.string()),
  lastCheckedAt: z.string().datetime().nullable()
});

export const providerDetectionResultSchema = z.object({
  providerId: z.string().min(1),
  detected: z.boolean(),
  confidence: z.enum(["exact", "high_confidence", "estimated", "observed_only"]),
  message: z.string()
});

export const wrapperSetupResultSchema = z.object({
  providerId: z.string().min(1),
  command: z.string().nullable(),
  instructions: z.array(z.string()),
  verified: z.boolean()
});

export const wrapperVerificationResultSchema = z.object({
  providerId: z.string().min(1),
  verified: z.boolean(),
  message: z.string()
});

export const diagnosticsExportResultSchema = z.object({
  generatedAt: z.string().datetime(),
  summary: z.string(),
  entries: z.array(z.string())
});
