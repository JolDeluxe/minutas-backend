import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Estatus } from "@prisma/client";
import type { PatchUsuarioInput, PatchUsuarioParams } from "./zod";
import { validarReglasDesactivacion } from "./helper";
import { registrarAccion, registrarError } from "../../utils/logger";

export const changeStatusUsuario = async (req: Request, res: Response) => {
  try {
    const solicitante = req.user!;
    const { id } = req.params as unknown as PatchUsuarioParams;
    const { estado } = req.body as PatchUsuarioInput;

    const usuarioObjetivo = await prisma.usuario.findUnique({ where: { id } });
    if (!usuarioObjetivo) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    try {
      validarReglasDesactivacion(solicitante, usuarioObjetivo);
    } catch (error: any) {
      return res.status(403).json({ error: error.message });
    }

    const usuarioActualizado = await prisma.usuario.update({
      where: { id },
      data: { estado: estado as Estatus },
      select: { id: true, nombre: true, username: true, rol: true, estado: true },
    });

    await registrarAccion(
      "CAMBIO_ESTADO_USUARIO",
      solicitante.id,
      `Cambió estado a ${estado} para usuario ID: ${id}`
    );

    return res.json({ status: "success", data: usuarioActualizado });
  } catch (error) {
    await registrarError("PATCH_USUARIO_ERROR", req.user?.id || null, error);
    return res.status(500).json({ error: "No se pudo actualizar el estatus" });
  }
};