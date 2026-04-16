import { z } from "zod";

export const claudeUsageLimitSchema = z.object({
  utilization: z.number().min(0),
  resetsAt: z.string().datetime().nullable()
});

export type ClaudeUsageLimit = z.infer<typeof claudeUsageLimitSchema>;

export const claudeUsageDataSchema = z.object({
  fiveHour: claudeUsageLimitSchema,
  sevenDay: claudeUsageLimitSchema,
  sevenDaySonnet: claudeUsageLimitSchema.nullable(),
  sevenDayOpus: claudeUsageLimitSchema.nullable(),
  sevenDayOauthApps: claudeUsageLimitSchema.nullable(),
  sevenDayCowork: claudeUsageLimitSchema.nullable(),
  other: claudeUsageLimitSchema.nullable(),
  extraUsage: claudeUsageLimitSchema.nullable()
});

export type ClaudeUsageData = z.infer<typeof claudeUsageDataSchema>;
