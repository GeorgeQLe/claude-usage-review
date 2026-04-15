import { z } from "zod";
import { providerCardSchema } from "./provider.js";

export const usageStateSchema = z.object({
  activeProviderId: z.string().min(1).nullable(),
  providers: z.array(providerCardSchema),
  lastUpdatedAt: z.string().datetime().nullable(),
  warning: z.string().nullable()
});
