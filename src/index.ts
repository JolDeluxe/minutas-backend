import express from "express";
import http from "http";
import morgan from "morgan";
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
// import asignaciones from "./routes/asignaciones_rutas";
// import imagenes from "./routes/imagenes_rutas";
// import metricas from "./routes/metricas_rutas";
// import pdf from "./routes/pdf_rutas";

const app = express();
const httpServer = http.createServer(app);

app.use(corsMiddleware);
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.send("Minutas Backend: ONLINE 🚀");
});

app.use("/api/auth", auth);
app.use("/api/usuarios", usuarios);
app.use("/api/minutas", minutas);
app.use("/api/tareas", tareas);
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