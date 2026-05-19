import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { Rol, Departamento, Linea } from "@prisma/client";
import type { UpdateUsuarioInput, UpdateUsuarioParams } from "./zod";
import { validarReglasEdicion } from "./helper";
import { registrarAccion, registrarError } from "../../utils/logger";
import { uploadUserProfileImage, deleteImageByUrl } from "../../utils/cloudinary";

export const updateUsuario = async (req: Request, res: Response) => {
  try {
    const solicitante = req.user!;
    const { id } = req.params as unknown as UpdateUsuarioParams;
    const datos = req.body as UpdateUsuarioInput;

    const usuarioActual = await prisma.usuario.findUnique({ where: { id } });
    if (!usuarioActual) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    try {
      validarReglasEdicion(solicitante, usuarioActual, datos as { rol?: Rol; departamento?: Departamento | null });
    } catch (error: any) {
      return res.status(403).json({ error: error.message });
    }

    const esMismoUsuario = solicitante.id === id;
    const dataToUpdate: Record<string, any> = {};

    // Imagen nueva
    if (req.file) {
      try {
        dataToUpdate.imagen = await uploadUserProfileImage(req.file.buffer);
        if (usuarioActual.imagen) {
          deleteImageByUrl(usuarioActual.imagen).catch(console.error);
        }
      } catch {
        return res.status(500).json({ error: "Error al procesar la imagen." });
      }
    }

    // Eliminación explícita de imagen
    if (datos.imagen === null) {
      dataToUpdate.imagen = null;
      if (usuarioActual.imagen) {
        deleteImageByUrl(usuarioActual.imagen).catch(console.error);
      }
    }

    // Email
    if (datos.email !== undefined) {
      if (datos.email && datos.email !== usuarioActual.email) {
        const emailOcupado = await prisma.usuario.findFirst({
          where: { email: datos.email, id: { not: id } },
        });
        if (emailOcupado) {
          return res.status(400).json({ error: "El correo ya está en uso." });
        }
      }
      dataToUpdate.email = datos.email;
    }

    // Username
    if (datos.username && datos.username !== usuarioActual.username) {
      const userOcupado = await prisma.usuario.findUnique({ where: { username: datos.username } });
      if (userOcupado) {
        return res.status(400).json({ error: "El nombre de usuario ya existe." });
      }
      dataToUpdate.username = datos.username;
    }

    // Contraseña
    if (datos.password && datos.password.trim() !== "") {
      dataToUpdate.password = await bcrypt.hash(datos.password, 10);
    }

    // Campos planos
    if (datos.nombre !== undefined) dataToUpdate.nombre = datos.nombre;

    // Rol, estado, departamento y línea solo los puede cambiar GERENCIA (no en auto-edición)
    if (!esMismoUsuario) {
      if (datos.rol !== undefined) dataToUpdate.rol = datos.rol as Rol;
      if (datos.estado !== undefined) dataToUpdate.estado = datos.estado;
      if (datos.departamento !== undefined) dataToUpdate.departamento = datos.departamento as Departamento | null;
      if (datos.linea !== undefined) dataToUpdate.linea = datos.linea as Linea | null;
    }

    const usuarioActualizado = await prisma.usuario.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true, nombre: true, username: true,
        email: true, rol: true, estado: true, departamento: true, linea: true, imagen: true,
      },
    });

    await registrarAccion("EDITAR_USUARIO", solicitante.id, `Editó usuario ID: ${id}`);

    return res.json({ status: "success", data: usuarioActualizado });
  } catch (error) {
    await registrarError("EDITAR_USUARIO_ERROR", req.user?.id || null, error);
    return res.status(500).json({ error: "Error interno al editar el usuario" });
  }
};