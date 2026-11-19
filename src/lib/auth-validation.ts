import { z } from "zod";

const password = z.string().min(8, "Password must have at least 8 characters").max(72, "Password is too long");

export const registerSchema = z.object({
  orgName: z.string().trim().min(2).max(150),
  orgType: z.enum(["DONOR", "NGO"]),
  address: z.string().trim().min(5).max(1000),
  contactPerson: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().min(7).max(20),
  fullName: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase().max(255),
  password,
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});
