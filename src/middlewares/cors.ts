import cors from "cors";
import { env } from "../env";

const whitelist = [
   "http://localhost:5173",
   "http://localhost:5174",
   "http://localhost:3000",
   "http://localhost:5000",
   "http://192.168.137.1:5000",
   "http://200.1.0.72:5000",
   "https://diseno-minutas.netlify.app", // Tu URL de Netlify
   ];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Permitir si no hay origen (como apps móviles o herramientas de test)
    // o si está en la whitelist o si es un subdominio de netlify
    if (
      !origin || 
      env.NODE_ENV === "development" || 
      whitelist.includes(origin) ||
      origin.endsWith(".netlify.app")
    ) {
      callback(null, true);
    } else {
      console.error(`❌ Bloqueado por CORS: ${origin}`);
      callback(new Error("No permitido por CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

export const corsMiddleware = cors(corsOptions);