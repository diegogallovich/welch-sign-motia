import { z } from "zod";

export const ShopVoxEventSchema = z.object({
    id: z.string(),
    name: z.string(),
})