import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, "Debes ingresar tu usuario o correo"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Formato de correo inválido").min(1, "El correo es obligatorio"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "El token es obligatorio"),
    password: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "La contraseña actual es requerida"),
    newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, "El refresh token es requerido"),
  }),
});

export type LoginInput          = z.infer<typeof loginSchema>["body"];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>["body"];
export type ResetPasswordInput  = z.infer<typeof resetPasswordSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
export type RefreshTokenInput   = z.infer<typeof refreshTokenSchema>["body"];