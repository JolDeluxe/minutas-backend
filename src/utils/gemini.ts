// minutas-backend/src/utils/gemini.ts
/**
 * Servicio de integración con la API de Gemini (Google AI).
 * Utiliza axios para realizar peticiones directas al endpoint REST.
 * No requiere SDK de Gemini — compatible con cualquier entorno de Node.
 */

import axios from "axios";
import { env } from "../env";

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";


/**
 * Genera texto usando Gemini dado un prompt estructurado.
 * @param prompt Texto del prompt a enviar al modelo.
 * @returns Texto de respuesta del modelo.
 * @throws Error si la API key no está configurada o la llamada falla.
 */
export const callGemini = async (prompt: string): Promise<string> => {
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada en el entorno.");
  }

  const response = await axios.post(
    GEMINI_BASE_URL,
    {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      timeout: 30_000,
    }
  );

  const text: string =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    throw new Error("Gemini no devolvió texto en la respuesta.");
  }

  return text.trim();
};

// ─────────────────────────────────────────────────────────────────────
// PROMPT FACTORY: Resumen de Minuta
// Recibe las tareas de la minuta y genera 3 secciones en JSON.
// ─────────────────────────────────────────────────────────────────────

export interface ResumenMinutaPayload {
  temasTratados: string;
  acuerdos: string;
  proximosPasos: string;
}

/**
 * Construye el prompt y llama a Gemini para generar el resumen de una minuta.
 */
export const generarResumenConGemini = async (params: {
  tituloMinuta: string;
  fechaMinuta: string;
  tareas: Array<{
    descripcion: string;
    tipo: string;
    clasificacion?: string | null;
    area: string;
    estado?: string | null;
    asignaciones?: Array<{ usuario: { nombre: string } }>;
  }>;
}): Promise<ResumenMinutaPayload> => {
  const { tituloMinuta, fechaMinuta, tareas } = params;

  // Construir contexto textual de las tareas
  const contextoTareas = tareas
    .map((t, i) => {
      const responsables =
        t.asignaciones && t.asignaciones.length > 0
          ? t.asignaciones.map((a) => a.usuario.nombre).join(", ")
          : "Sin responsable asignado";
      return `${i + 1}. [${t.tipo}/${t.clasificacion ?? "N/A"}] ${t.descripcion} (Área: ${t.area} | Estado: ${t.estado ?? "N/A"} | Responsable(s): ${responsables})`;
    })
    .join("\n");

  const prompt = `
Eres un asistente organizacional experto en análisis de minutas de junta empresarial.
Analiza las siguientes entradas registradas en la minuta titulada "${tituloMinuta}" del ${fechaMinuta} y genera un resumen ejecutivo en español formal.

ENTRADAS DE LA MINUTA:
${contextoTareas}

INSTRUCCIONES ESTRICTAS:
1. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código markdown.
2. El JSON debe tener exactamente esta estructura:
{
  "temasTratados": "Párrafo conciso describiendo los temas principales que se trataron en la junta, basándote en las descripciones y clasificaciones de las entradas.",
  "acuerdos": "Párrafo describiendo los acuerdos y compromisos alcanzados, identificando especialmente las entradas de tipo POLITICA, RECORDATORIO y TAREA organizadas.",
  "proximosPasos": "Lista en prosa de las acciones concretas a seguir, priorizando las tareas pendientes y recordatorios activos."
}
3. Usa lenguaje profesional y conciso, máximo 3-4 oraciones por sección.
4. Si hay pocas entradas, basa el resumen en lo disponible.
5. No inventes información que no esté en las entradas.
`;

  const rawText = await callGemini(prompt);

  // Parsear el JSON respuesta
  try {
    // Limpiar posibles bloques markdown que Gemini a veces incluye
    const cleaned = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      temasTratados: parsed.temasTratados ?? "",
      acuerdos: parsed.acuerdos ?? "",
      proximosPasos: parsed.proximosPasos ?? "",
    };
  } catch {
    // Si el JSON falla, intentar extraer manualmente
    throw new Error(
      `Gemini devolvió formato inesperado: ${rawText.substring(0, 200)}`
    );
  }
};
