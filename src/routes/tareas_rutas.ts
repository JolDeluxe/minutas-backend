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
} from "../modules/tareas/zod";
import { listTareas }        from "../modules/tareas/01_list";
import { crearTarea }        from "../modules/tareas/02_create";
import { getTareaById }      from "../modules/tareas/03_get-by-id";
import { updateTarea }       from "../modules/tareas/04_update";
import { changeEstadoTarea } from "../modules/tareas/05_change-status";
import { deleteTarea }       from "../modules/tareas/06_delete";
import { addImagenTarea, deleteImagenTarea } from "../modules/tareas/07_imagenes";
import { generarPdfTarea }   from "../modules/tareas/08_generate-pdf";

const router = Router();
router.use(authenticate);

// GET    /api/tareas
// Se corrigió "listarTareas" por "listTareas"
router.get("/",    validate(listTareasSchema),   listTareas);

// POST   /api/tareas  (soporta FormData con hasta 3 imágenes O JSON sin imágenes)
router.post("/",   upload.array("imagenes", 3), validate(createTareaSchema), crearTarea);

// GET    /api/tareas/:id/pdf (Genera el PDF en Cloudinary y devuelve la URL) <-- NUEVA RUTA
router.get("/:id/pdf", validate(tareaIdSchema),  generarPdfTarea);

// GET    /api/tareas/:id
router.get("/:id", validate(tareaIdSchema),      getTareaById);

// PUT    /api/tareas/:id
router.put("/:id", validate(updateTareaSchema),  updateTarea);

// PATCH  /api/tareas/:id/estado
router.patch("/:id/estado",  validate(changeEstadoSchema), changeEstadoTarea);

// DELETE /api/tareas/:id
router.delete("/:id",        validate(tareaIdSchema),      deleteTarea);

// POST   /api/tareas/:id/imagenes
router.post("/:id/imagenes", upload.single("imagen"), validate(tareaIdSchema), addImagenTarea);

// DELETE /api/tareas/:id/imagenes/:imagenId
router.delete("/:id/imagenes/:imagenId", validate(imagenIdSchema), deleteImagenTarea);

export default router;