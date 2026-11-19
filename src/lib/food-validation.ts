import { z } from "zod";

const isoDate = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Enter a valid date and time"
);

const quantity = z.number()
  .finite()
  .positive("Quantity must be greater than zero")
  .max(1000000, "Quantity is too large")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Use no more than two decimal places");

export const donationSchema = z.object({
  foodName: z.string().trim().min(2, "Enter a food name").max(150),
  description: z.string().trim().min(5, "Enter a short description").max(2000),
  category: z.string().trim().min(2).max(60),
  totalQty: quantity,
  unit: z.enum(["kg", "servings"]),
  preparedAt: isoDate.nullable(),
  expiresAt: isoDate,
  pickupAddress: z.string().trim().min(5, "Enter a pickup address").max(1000),
});

export const ngoRequestSchema = z.object({
  description: z.string().trim().min(5, "Describe the food you need").max(2000),
  category: z.string().trim().min(2).max(60),
  requestedQty: quantity,
  unit: z.enum(["kg", "servings"]),
  neededBy: isoDate,
  deliveryAddress: z.string().trim().min(5, "Enter a delivery address").max(1000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
