import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { Rol, Departamento } from "@prisma/client";
import type { CreateUsuarioInput } from "./zod";
import { generarUsername } from "./utils/userGenerator";
import { validarReglasCreacion } from "./helper";
import { registrarAccion, registrarError } from "../../utils/logger";
import { uploadUserProfileImage } from "../../utils/cloudinary";

export const crearUsuario = async (req: Request, res: Response) => {
  try {
    const solicitante = req.user!;
    const { nombre, email, password, rol, username, departamento, linea } = req.body as CreateUsuarioInput;

    try {
      validarReglasCreacion(solicitante, { rol: rol as Rol, departamento: departamento as Departamento | null });
    } catch (error: any) {
      return res.status(403).json({ error: error.message });
    }

    if (email) {
      const emailExiste = await prisma.usuario.findUnique({ where: { email } });
      if (emailExiste) {
        return res.status(400).json({ error: "El correo ya está registrado." });
      }
    }

    let usernameFinal = "";

    if (username) {
      const existe = await prisma.usuario.findUnique({ where: { username } });
      if (existe) {
        return res.status(400).json({ error: `El usuario '${username}' ya existe.` });
      }
      usernameFinal = username;
    } else {
      const candidatos = generarUsername(nombre);
      let encontrado = false;

      for (const candidato of candidatos) {
        const ocupado = await prisma.usuario.findUnique({ where: { username: candidato } });
        if (!ocupado) {
          usernameFinal = candidato;
          encontrado = true;
          break;
        }
      }

      if (!encontrado) {
        usernameFinal = `${candidatos[0]}${Math.floor(Math.random() * 1000)}`;
      }
    }

    let imagenUrl: string | undefined = undefined;

    if (req.file) {
      try {
        imagenUrl = await uploadUserProfileImage(req.file.buffer);
      } catch {
        return res.status(500).json({ error: "Error al subir la imagen." });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombre,
        username: usernameFinal,
        email: email ?? null,
        password: hashedPassword,
        rol: rol as Rol,
        departamento: departamento as Departamento | null,
        linea: linea as string | null,
        imagen: imagenUrl,
      },
      select: { id: true, username: true, email: true, rol: true, nombre: true, departamento: true, linea: true, imagen: true },
    });

    await registrarAccion(
      "CREAR_USUARIO",
      solicitante.id,
      `Creó usuario: ${usernameFinal} (${rol})`
    );

    return res.status(201).json({ status: "success", data: nuevoUsuario });
  } catch (error) {
    await registrarError("CREAR_USUARIO_ERROR", req.user?.id || null, error);
    return res.status(500).json({ error: "Error al crear usuario" });
  }
};