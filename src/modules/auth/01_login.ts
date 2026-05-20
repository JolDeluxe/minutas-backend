import { type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { Estatus } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { generateAccessToken, generateRefreshToken } from "./utils/tokenGenerator";
import type { LoginInput } from "./zod";
import type { TokenPayload } from "./types";

export const login = async (req: Request, res: Response) => {
  try {
    const { identifier, password }: LoginInput = req.body;

    const usuario = await prisma.usuario.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });

    if (!usuario) {
      await registrarAccion("LOGIN_FALLIDO", null, `Usuario no encontrado: ${identifier}`);
      return res.status(401).json({ status: "error", message: "Credenciales inválidas" });
    }

    if (usuario.estado !== Estatus.ACTIVO) {
      await registrarAccion("LOGIN_BLOQUEADO", usuario.id, "Intento de acceso usuario inactivo");
      return res.status(403).json({
        status: "error",
        message: "Usuario desactivado. Contacta al administrador.",
      });
    }

    const isMatch = await bcrypt.compare(password, usuario.password);

    if (!isMatch) {
      await registrarAccion("LOGIN_FALLIDO", usuario.id, "Contraseña incorrecta");
      return res.status(401).json({ status: "error", message: "Credenciales inválidas" });
    }

    const payload: TokenPayload = {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre,
      linea: usuario.linea,
      departamento: usuario.departamento,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken({ id: usuario.id });

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await prisma.refreshToken.create({
      data: {
        hashedToken: await bcrypt.hash(refreshToken, 10),
        usuarioId: usuario.id,
        expiresAt,
      },
    });

    await registrarAccion("LOGIN_EXITOSO", usuario.id, "Inicio de sesión exitoso");

    return res.status(200).json({
      status: "success",
      accessToken,
      refreshToken,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        username: usuario.username,
        rol: usuario.rol,
        email: usuario.email || undefined,
        departamento: usuario.departamento,
        linea: usuario.linea,
        mustChangePassword: usuario.mustChangePassword,
      },
    });
  } catch (error) {
    await registrarError("LOGIN_SYSTEM_ERROR", null, error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor" });
  }
};
