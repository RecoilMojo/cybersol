import { z } from "zod";

export const p2eAuthFields = {
  nonce: z
    .string()
    .min(16)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid nonce"),
  issuedAt: z
    .string()
    .min(20)
    .max(40)
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, "Invalid timestamp"),
  signature: z.string().min(64).max(128),
};
