import { type Request, type Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";

export const getProfile = async (req: Request, res: Response) => {
  const usuarioId = req.user?.id;

  try {
    if (!usuarioId) {
      return res.status(401).json({ status: "error", message: "Token inválido o expirado" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nombre: true,
        username: true,
        email: true,
        rol: true,
        imagen: true,
        departamento: true,
        linea: true,
        createdAt: true,
      },
    });

    if (!usuario) {
      return res.status(404).json({ status: "error", message: "Usuario no encontrado" });
    }

    return res.json({ status: "success", data: usuario });
  } catch (error) {
    await registrarError("GET_PROFILE_ERROR", usuarioId || null, error);
    return res.status(500).json({ status: "error", message: "Error interno al obtener perfil" });
  }
};