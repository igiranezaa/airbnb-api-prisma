import { z } from "zod";

export const createListingSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  location: z.string().min(2, "Location is required"),
  pricePerNight: z.number().positive("Price must be positive"),
  guests: z.number().int().min(1, "Must allow at least 1 guest"),
  type: z.enum(["APARTMENT", "HOUSE", "VILLA", "CABIN"]),
  amenities: z.array(z.string()).min(1, "At least one amenity required"),
});

export const updateListingSchema = createListingSchema.partial();