import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { createMinutaSchema, listMinutasSchema, minutaIdSchema } from "../modules/minutas/zod";
import { listarMinutas } from "../modules/minutas/01_list";
import { crearMinuta }   from "../modules/minutas/02_create";
import { getMinutaById } from "../modules/minutas/03_get-by-id";
import { cerrarMinuta } from "../modules/minutas/04_close";
import { compararConAnterior } from "../modules/minutas/05_compare";
import { iniciarMinuta } from "../modules/minutas/06_start";
import { cancelarMinuta } from "../modules/minutas/07_cancel";

const router = Router();
router.use(authenticate);

// GET  /api/minutas
router.get("/",           validate(listMinutasSchema),   listarMinutas);
// POST /api/minutas
router.post("/",          validate(createMinutaSchema),  crearMinuta);
// GET  /api/minutas/:id
router.get("/:id",        validate(minutaIdSchema),      getMinutaById);
// GET  /api/minutas/:id/compare
router.get("/:id/compare", validate(minutaIdSchema),     compararConAnterior);
// PATCH /api/minutas/:id/cerrar
router.patch("/:id/cerrar", validate(minutaIdSchema),    cerrarMinuta);
// POST /api/minutas/:id/iniciar
router.post("/:id/iniciar", validate(minutaIdSchema),    iniciarMinuta);
// POST /api/minutas/:id/cancelar
router.post("/:id/cancelar", validate(minutaIdSchema),   cancelarMinuta);

export default router;