import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { upload } from "../middlewares/upload";
import {
  createTareaSchema,
  updateTareaSchema,
  changeEstadoSchema,
  tareaIdSchema,
  imagenIdSchema,
  listTareasSchema,
  deleteTareaSchema,
  createNotaGeneralSchema,
  createTareaNotaSchema,
} from "../modules/tareas/zod";
import { listTareas }        from "../modules/tareas/01_list";
import { crearTarea }        from "../modules/tareas/02_create";
import { getTareaById }      from "../modules/tareas/03_get-by-id";
import { updateTarea }       from "../modules/tareas/04_update";
import { changeEstadoTarea } from "../modules/tareas/05_change-status";
import { deleteTarea }       from "../modules/tareas/06_delete";
import { addImagenTarea, deleteImagenTarea } from "../modules/tareas/07_imagenes";
import { generarPdfTarea }   from "../modules/tareas/08_generate-pdf";
import { createNotaGeneral, createTareaNota, updateTareaNota, deleteTareaNota } from "../modules/tareas/10_notas";

const router = Router();

// Aplicar autenticación global para todo el dominio de tareas
router.use(authenticate);

// Listado de tareas con filtros dinámicos
router.get("/", validate(listTareasSchema), listTareas);

// Creación masiva o individual (Soporta FormData para imágenes)
// Se usa upload.any() para soportar fieldnames dinámicos: imagen_tarea_{index}_{i}
router.post("/", upload.any(), validate(createTareaSchema), crearTarea);

// Obtener detalle por ID
router.get("/:id", validate(tareaIdSchema), getTareaById);

// Generar PDF de evidencia en Cloudinary
router.get("/:id/pdf", validate(tareaIdSchema), generarPdfTarea);

// Actualización de campos de dominio
router.put("/:id", validate(updateTareaSchema), updateTarea);

// Cambio de estado (Workflow)
router.patch("/:id/estado", validate(changeEstadoSchema), changeEstadoTarea);

/**
 * Ruta Crítica: Eliminación Física
 * El middleware de validación usa deleteTareaSchema para asegurar tipos numéricos.
 */
router.delete("/:id", validate(deleteTareaSchema), deleteTarea);

// Gestión modular de imágenes post-creación
router.post("/:id/imagenes", upload.single("imagen"), validate(tareaIdSchema), addImagenTarea);
router.delete("/:id/imagenes/:imagenId", validate(imagenIdSchema), deleteImagenTarea);

// ── NOTAS ──
router.post("/notas/general", validate(createNotaGeneralSchema), createNotaGeneral);
router.post("/notas/tarea", validate(createTareaNotaSchema), createTareaNota);
router.put("/notas/tarea/:id", updateTareaNota);
router.delete("/notas/tarea/:id", deleteTareaNota);

export default router;