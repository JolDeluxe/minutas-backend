import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url({ message: "URL de BD inválida" }),
    JWT_SECRET: z.string().min(1),
    JWT_ACCESS_EXPIRES: z.string().default("15d"),
    JWT_REFRESH_EXPIRES: z.string().default("1y"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    SYS_ADMIN_USER: z.string().min(1).default("ADMIN"),
    SYS_ADMIN_PASS: z.string().min(1),

    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),

    // SMTP opcional — solo requerido cuando se active el envío de PDF
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),

    VAPID_PUBLIC_KEY: z.string().min(1),
    VAPID_PRIVATE_KEY: z.string().min(1),
    VAPID_SUBJECT: z.string().url().or(z.string().startsWith("mailto:")),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});