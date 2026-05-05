import { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { env } from "../../env";
import { generateAccessToken } from "./utils/tokenGenerator";
import type { TokenPayload } from "./types";
import type { RefreshTokenInput } from "./zod";

export const refreshSession = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as RefreshTokenInput;

    const decoded = jwt.verify(refreshToken, env.JWT_SECRET) as { id: number };

    const storedTokens = await prisma.refreshToken.findMany({
      where: {
        usuarioId: decoded.id,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    let tokenValido = null;
    for (const token of storedTokens) {
      const match = await bcrypt.compare(refreshToken, token.hashedToken);
      if (match) {
        tokenValido = token;
        break;
      }
    }

    if (!tokenValido) {
      return res.status(401).json({ status: "error", message: "Sesión inválida o expirada" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        email: true,
        rol: true,
        nombre: true,
        estado: true,
      },
    });

    if (!usuario || usuario.estado !== "ACTIVO") {
      return res.status(401).json({ status: "error", message: "Usuario no disponible" });
    }

    const payload: TokenPayload = {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre,
    };

    const accessToken = generateAccessToken(payload);

    return res.status(200).json({ status: "success", accessToken });
  } catch {
    return res.status(401).json({ status: "error", message: "Sesión caducada" });
  }
};