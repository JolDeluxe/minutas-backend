import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { upload } from "../middlewares/upload";
import { Rol } from "@prisma/client";
import {
  createTareaSchema,
  updateTareaSchema,
  changeEstadoSchema,
  tareaIdSchema,
  imagenIdSchema,
  listTareasSchema,
  deleteTareaSchema,
  createTareaNotaSchema,
} from "../modules/tareas/zod";
import { listTareas }        from "../modules/tareas/01_list";
import { crearTarea }        from "../modules/tareas/02_create";
import { getTareaById }      from "../modules/tareas/03_get-by-id";
import { updateTarea }       from "../modules/tareas/04_update";
import { changeEstadoTarea } from "../modules/tareas/05_change-status";
import { deleteTarea }       from "../modules/tareas/06_delete";
import { addImagenTarea, deleteImagenTarea } from "../modules/tareas/07_imagenes";
import { createTareaNota, updateTareaNota, deleteTareaNota } from "../modules/tareas/10_notas";

const router = Router();

// Solo ADMIN puede usar este módulo
router.use(authenticate);
router.use(authorize([Rol.ADMIN]));

// Listado de tareas generales (sin minuta)
// El cliente pasa onlyGeneral=true para filtrar por minutaId IS NULL
router.get("/", validate(listTareasSchema), listTareas);

// Creación de tareas generales (sin minutaId)
router.post("/", upload.any(), validate(createTareaSchema), crearTarea);

// Detalle por ID
router.get("/:id", validate(tareaIdSchema), getTareaById);

// Actualización de campos
router.put("/:id", validate(updateTareaSchema), updateTarea);

// Cambio de estado
router.patch("/:id/estado", validate(changeEstadoSchema), changeEstadoTarea);

// Eliminación lógica
router.delete("/:id", validate(deleteTareaSchema), deleteTarea);

// Gestión de imágenes
router.post("/:id/imagenes", upload.single("imagen"), validate(tareaIdSchema), addImagenTarea);
router.delete("/:id/imagenes/:imagenId", validate(imagenIdSchema), deleteImagenTarea);

// Notas
router.post("/notas/tarea", validate(createTareaNotaSchema), createTareaNota);
router.put("/notas/tarea/:id", updateTareaNota);
router.delete("/notas/tarea/:id", deleteTareaNota);

export default router;
