import { z } from "zod";

/** The save payload. `itemId` names a published research item. */
export const saveItemSchema = z.object({
  itemId: z.string().trim().min(1, "An item id is required.").max(200, "The item id is too long."),
});

export type SaveItemPayload = z.infer<typeof saveItemSchema>;
