import { z } from "zod";
import { providerSettingsSchema } from "./provider.js";

export const overlayBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(160).max(900),
  height: z.number().int().min(80).max(900)
});

export const overlaySettingsSchema = z.object({
  enabled: z.boolean(),
  visible: z.boolean(),
  layout: z.enum(["compact", "minimal", "sidebar"]),
  opacity: z.number().min(0.2).max(1),
  bounds: overlayBoundsSchema.nullable()
});

export const providerPlaceholderSettingsSchema = providerSettingsSchema;

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
