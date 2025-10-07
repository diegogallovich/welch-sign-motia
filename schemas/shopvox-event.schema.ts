import { z } from "zod";

export const ShopVoxEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  changes: z.record(z.tuple([z.unknown(), z.unknown()])).optional(),
});
