import express from "express";
import http from "http";
import morgan from "morgan";
import path from "path";
import { env } from "./env";
import { corsMiddleware } from "./middlewares/cors";
import { iniciarTareasProgramadas } from "./utils/scheduler";
import { inicializarSistema } from "./utils/setup";
import { initSocket } from "./utils/socket";

// Rutas
import auth from "./routes/auth_rutas";
import usuarios from "./routes/usuarios_rutas";
import minutas from "./routes/minutas_rutas";
import tareas from "./routes/tareas_rutas";
import dashboard from "./routes/dashboard_rutas";
import recordatorios from "./routes/recordatorios_rutas";
import configuracion from "./modules/configuracion/routes";
import notificaciones from "./routes/notificaciones_rutas";
import tareasGenerales from "./routes/tareas_generales_rutas";
// import asignaciones from "./routes/asignaciones_rutas";
// import imagenes from "./routes/imagenes_rutas";
// import metricas from "./routes/metricas_rutas";
// import pdf from "./routes/pdf_rutas";

const app = express();
const httpServer = http.createServer(app);

app.use(corsMiddleware);
app.use(express.json());
app.use(morgan("dev"));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/", (_req, res) => {
  res.send("Minutas Backend: ONLINE 🚀");
});

app.use("/api/auth", auth);
app.use("/api/usuarios", usuarios);
app.use("/api/minutas", minutas);
app.use("/api/tareas", tareas);
app.use("/api/tareas-generales", tareasGenerales);
app.use("/api/dashboard", dashboard);
app.use("/api/recordatorios", recordatorios);
app.use("/api/configuracion", configuracion);
app.use("/api/notificaciones", notificaciones);
// app.use("/api/asignaciones", asignaciones);
// app.use("/api/imagenes", imagenes);
// app.use("/api/metricas", metricas);
// app.use("/api/pdf", pdf);

const startServer = async () => {
  try {
    await inicializarSistema();
    initSocket(httpServer);

    httpServer.listen(env.PORT, "0.0.0.0", () => {
      console.log(`Servidor Minutas corriendo en http://localhost:${env.PORT}`);
      console.log(`Ambiente: ${env.NODE_ENV}`);
      iniciarTareasProgramadas();
    });
  } catch (error) {
    console.error("❌ Error fatal al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();
