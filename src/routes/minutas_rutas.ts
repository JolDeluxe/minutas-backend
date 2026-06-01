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
import { reabrirMinuta } from "../modules/minutas/08_reopen";
import { finalizarMinuta } from "../modules/minutas/09_finish";
import { generarPdfPorArea } from "../modules/minutas/10_generate-pdf-area";

const router = Router();

router.use(authenticate);

// GET  /api/minutas
router.get("/",           validate(listMinutasSchema),   listarMinutas);
// POST /api/minutas
router.post("/",          validate(createMinutaSchema),  crearMinuta);

// ─── RUTAS CON SUB-RECURSOS (Deben ir antes que :id) ───
// GET  /api/minutas/:id/pdf-area/:area
router.get("/:id/pdf-area/:area", (req, res, next) => {
  console.log(`[DEBUG] Request PDF AREA: id=${req.params.id}, area=${req.params.area}`);
  next();
}, generarPdfPorArea);

// GET  /api/minutas/:id/compare
router.get("/:id/compare", validate(minutaIdSchema),     compararConAnterior);

// ─── RUTAS DE ESTADO ───
router.patch("/:id/cerrar", validate(minutaIdSchema),    cerrarMinuta);
router.post("/:id/iniciar", validate(minutaIdSchema),    iniciarMinuta);
router.post("/:id/cancelar", validate(minutaIdSchema),   cancelarMinuta);
router.patch("/:id/reabrir", validate(minutaIdSchema),   reabrirMinuta);
router.post("/:id/finalizar", validate(minutaIdSchema),  finalizarMinuta);

// ─── RUTA BASE POR ID (Atrapa todo lo demás) ───
// GET  /api/minutas/:id
router.get("/:id",        validate(minutaIdSchema),      getMinutaById);

export default router;