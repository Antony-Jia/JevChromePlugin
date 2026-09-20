import { z } from "zod";

export const JevResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), z.object({
    type: z.enum(["score", "noul", "choice"])
  }).passthrough())
}).passthrough();
