import { z } from "zod";

export const overlaySettingsSchema = z.object({
  enabled: z.boolean(),
  layout: z.enum(["compact", "minimal", "sidebar"]),
  opacity: z.number().min(0.2).max(1)
});

export const providerPlaceholderSettingsSchema = z.object({
  enabled: z.boolean(),
  setupPromptDismissed: z.boolean()
});

export const providerPlaceholderMapSchema = z.object({
  codex: providerPlaceholderSettingsSchema,
  gemini: providerPlaceholderSettingsSchema
});

export const migrationPromptSettingsSchema = z.object({
  swiftAppImport: z.boolean(),
  providerImport: z.boolean()
});

export const notificationSettingsSchema = z.object({
  enabled: z.boolean(),
  sessionReset: z.boolean(),
  weeklyReset: z.boolean(),
  authExpired: z.boolean(),
  providerDegraded: z.boolean(),
  thresholdWarnings: z.boolean(),
  sessionWarningPercent: z.number().int().min(1).max(100),
  weeklyWarningPercent: z.number().int().min(1).max(100)
});

export const onboardingSettingsSchema = z.object({
  completed: z.boolean(),
  skipped: z.boolean()
});

export const appSettingsSchema = z.object({
  launchAtLogin: z.boolean(),
  timeDisplay: z.enum(["countdown", "reset-time"]),
  paceTheme: z.enum(["balanced", "strict", "relaxed"]),
  weeklyColorMode: z.enum(["pace-aware", "raw-percentage"]),
  overlay: overlaySettingsSchema,
  providers: providerPlaceholderMapSchema,
  migration: migrationPromptSettingsSchema,
  notifications: notificationSettingsSchema,
  onboarding: onboardingSettingsSchema
});

export const appSettingsPatchSchema = appSettingsSchema.partial().extend({
  overlay: overlaySettingsSchema.partial().optional(),
  providers: providerPlaceholderMapSchema
    .partial()
    .extend({
      codex: providerPlaceholderSettingsSchema.partial().optional(),
      gemini: providerPlaceholderSettingsSchema.partial().optional()
    })
    .optional(),
  migration: migrationPromptSettingsSchema.partial().optional(),
  notifications: notificationSettingsSchema.partial().optional(),
  onboarding: onboardingSettingsSchema.partial().optional()
});
