import { z } from "zod";

export const createProfileSchema = z.object({
  bio: z.string().max(300).optional(),
  website: z.string().url("Invalid website URL").optional(),
  country: z.string().optional(),
});

export const updateProfileSchema = createProfileSchema.partial();