import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { listRecordatorios } from "../modules/recordatorios/01_list";

const router = Router();

// Aplicar autenticación global para todo el dominio de recordatorios
router.use(authenticate);

// Listado exclusivo de recordatorios con reglas de visibilidad departamental
router.get("/", listRecordatorios);

export default router;
