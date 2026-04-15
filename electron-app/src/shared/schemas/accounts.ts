import { z } from "zod";

export const accountAuthStatusSchema = z.enum(["missing_credentials", "configured", "expired"]);

export const accountSummarySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  orgId: z.string().min(1).nullable(),
  isActive: z.boolean(),
  authStatus: accountAuthStatusSchema
});
