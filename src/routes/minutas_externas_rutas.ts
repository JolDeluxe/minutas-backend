import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import {
  createMinutaExternaSchema,
  updateMinutaExternaSchema,
  listMinutasExternasSchema,
  minutaExternaIdSchema,
  createTareaExternaSchema,
  updateTareaExternaSchema,
  tareaExternaIdSchema,
  createTareaExternaNotaSchema,
} from "../modules/minutas_externas/zod";

import { listarMinutasExternas } from "../modules/minutas_externas/01_list";
import { crearMinutaExterna } from "../modules/minutas_externas/02_create";
import { getMinutaExternaById } from "../modules/minutas_externas/03_get-by-id";
import { updateMinutaExterna } from "../modules/minutas_externas/04_update";
import { cerrarMinutaExterna } from "../modules/minutas_externas/05_close";
import { eliminarMinutaExterna } from "../modules/minutas_externas/06_delete";
import { generarPdfMinutaExterna } from "../modules/minutas_externas/08_generate-pdf";

import {
  createTareasExternas,
  updateTareaExterna,
  deleteTareaExterna,
  toggleNotificadoExterna,
  createTareaExternaNota,
  updateTareaExternaNota,
  deleteTareaExternaNota
} from "../modules/minutas_externas/07_tareas";

const router = Router();
router.use(authenticate);

// ─── MINUTAS EXTERNAS ─────────────────────────────────────────────────────────
router.get("/", validate(listMinutasExternasSchema), listarMinutasExternas);
router.post("/", validate(createMinutaExternaSchema), crearMinutaExterna);
router.get("/:id", validate(minutaExternaIdSchema), getMinutaExternaById);
router.put("/:id", validate(updateMinutaExternaSchema), updateMinutaExterna);
router.patch("/:id/cerrar", validate(minutaExternaIdSchema), cerrarMinutaExterna);
router.delete("/:id", validate(minutaExternaIdSchema), eliminarMinutaExterna);
router.get("/:id/pdf", validate(minutaExternaIdSchema), generarPdfMinutaExterna);

import { upload } from "../middlewares/upload";

// ─── TAREAS DE MINUTAS EXTERNAS ───────────────────────────────────────────────
router.post("/:minutaId/tareas", upload.any(), validate(createTareaExternaSchema), createTareasExternas);
router.put("/tareas/:id", validate(updateTareaExternaSchema), updateTareaExterna);
router.delete("/tareas/:id", validate(tareaExternaIdSchema), deleteTareaExterna);

// Endpoint rápido para el checkbox de "Completada" (usa notificadoAt por compatibilidad o estado)
router.patch("/tareas/:id/notificado", validate(tareaExternaIdSchema), toggleNotificadoExterna);

// Notas de tareas externas
router.post("/notas/tarea", validate(createTareaExternaNotaSchema), createTareaExternaNota);
router.put("/notas/tarea/:id", updateTareaExternaNota);
router.delete("/notas/tarea/:id", deleteTareaExternaNota);

export default router;
