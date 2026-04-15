import { z } from "zod";
import { appSettingsSchema } from "./settings.js";

export const renameAccountPayloadSchema = z.object({
  accountId: z.string().min(1),
  label: z.string().min(1)
});

export const saveClaudeCredentialsPayloadSchema = z.object({
  accountId: z.string().min(1),
  sessionKey: z.string().min(1),
  orgId: z.string().min(1)
});

export const updateSettingsPayloadSchema = z.object({
  patch: appSettingsSchema.partial()
});

export const providerCommandPayloadSchema = z.object({
  providerId: z.string().min(1)
});
