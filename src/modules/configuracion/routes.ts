import { Router } from "express";
import { getCatalogos } from "./controller";
import { authenticate } from "../../middlewares/authenticate";

const router = Router();

router.get("/catalogos", authenticate, getCatalogos);

export default router;
