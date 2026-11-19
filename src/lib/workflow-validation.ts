import { z } from "zod";

const id = z.string().regex(/^[1-9]\d*$/, "Choose a valid record ID");

export const reserveSchema = z.object({
  donationId: id,
  requestId: id,
  quantity: z.number().finite().positive().max(9999999999.99)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001,
      "Quantity can have at most two decimal places"),
});

export const scheduleSchema = z.object({
  allocationId: id,
  scheduledAt: z.string().datetime({ offset: true }),
});

export const pickupActionSchema = z.object({
  action: z.enum(["PICKED_UP", "DELIVERED"]),
});

export function databaseRuleError(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const e = error as { code?: string; message?: string };
  if (e.code === "P0001" || e.code === "23514" || e.code === "23505") {
    // The trigger-generated errors contain no secrets; avoid returning raw DB
    // messages for other PostgreSQL errors.
    return e.message || "The operation violates a database constraint";
  }
  return null;
}
