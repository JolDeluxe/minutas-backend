import { Router } from "express";
import { Rol } from "@prisma/client";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { upload } from "../middlewares/upload";
import { validate } from "../middlewares/validate";

import {
  listUsuariosSchema,
  getUsuarioByIdSchema,
  createUsuarioSchema,
  updateUsuarioSchema,
  patchUsuarioSchema,
} from "../modules/usuarios/zod";

import { listarUsuarios, getUsuarioById } from "../modules/usuarios/01_list";
import { crearUsuario } from "../modules/usuarios/02_create";
import { updateUsuario } from "../modules/usuarios/03_update";
import { changeStatusUsuario } from "../modules/usuarios/04_patch";

const router = Router();

router.use(authenticate);

// GET /api/usuarios
router.get(
  "/",
  authorize([Rol.GERENCIA, Rol.JEFE]),
  validate(listUsuariosSchema),
  listarUsuarios
);

// GET /api/usuarios/:id
router.get(
  "/:id",
  validate(getUsuarioByIdSchema),
  getUsuarioById
);

// POST /api/usuarios
router.post(
  "/",
  authorize([Rol.GERENCIA]),
  upload.single("imagen"),
  validate(createUsuarioSchema),
  crearUsuario
);

// PUT /api/usuarios/:id
router.put(
  "/:id",
  upload.single("imagen"),
  validate(updateUsuarioSchema),
  updateUsuario
);

// PATCH /api/usuarios/:id
router.patch(
  "/:id",
  authorize([Rol.GERENCIA]),
  validate(patchUsuarioSchema),
  changeStatusUsuario
);

export default router;