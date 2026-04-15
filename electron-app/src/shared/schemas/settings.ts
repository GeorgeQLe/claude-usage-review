import { z } from "zod";

export const overlaySettingsSchema = z.object({
  enabled: z.boolean(),
  layout: z.enum(["compact", "minimal", "sidebar"]),
  opacity: z.number().min(0.2).max(1)
});

export const appSettingsSchema = z.object({
  launchAtLogin: z.boolean(),
  timeDisplay: z.enum(["countdown", "reset-time"]),
  paceTheme: z.enum(["balanced", "strict", "relaxed"]),
  weeklyColorMode: z.enum(["pace-aware", "raw-percentage"]),
  overlay: overlaySettingsSchema
});
