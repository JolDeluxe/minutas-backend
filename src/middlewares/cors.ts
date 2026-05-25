import cors from "cors";
import { env } from "../env";

const whitelist = [
   "http://localhost:5173",
   "http://localhost:5174",
   "http://localhost:3000",
   "http://localhost:5000", // Añadido por si acaso
   "http://192.168.137.1:5000", // Añadido para tu red
   "http://200.1.0.72:5000", // Añadido para tu red
   ];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (env.NODE_ENV === "development" || !origin || whitelist.includes(origin)) {
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