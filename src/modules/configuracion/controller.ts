import type { Request, Response } from "express";

const CATALOGOS_DEPARTAMENTO = {
  DISENO: {
    lineas: [
      { value: "CALZADO", label: "Calzado", color: "#f97316", icon: "footprint" },
      { value: "BOTA", label: "Bota", color: "#8b5cf6", icon: "hiking" },
      { value: "ROPA", label: "Ropa", color: "#ec4899", icon: "checkroom" },
      { value: "ACCESORIOS", label: "Accesorios", color: "#14b8a6", icon: "watch" },
      { value: "OTROS", label: "Otros", color: "#64748b", icon: "more_horiz" },
    ],
    clasificaciones: [
      { value: "IDEA", label: "Idea", color: "#8b5cf6", icon: "emoji_objects" },
      { value: "INVESTIGACION", label: "Investigación", color: "#3b82f6", icon: "travel_explore" },
      { value: "CORRECCION", label: "Corrección", color: "#ef4444", icon: "edit_location_alt" },
      { value: "ANALISIS", label: "Análisis", color: "#f59e0b", icon: "search_insights" },
      { value: "MUESTRA", label: "Muestra", color: "#10b981", icon: "design_services" },
      { value: "BOCETO", label: "Boceto", color: "#f97316", icon: "draw" },
      { value: "POLITICAS", label: "Políticas", color: "#6366f1", icon: "policy" },
      { value: "OTROS", label: "Otros", color: "#64748b", icon: "more_horiz" },
    ],
  },
  MARKETING: {
    lineas: [], // Marketing no usa líneas obligatorias
    clasificaciones: [
      { value: "REDES_SOCIALES", label: "Redes Sociales", color: "#10b981", icon: "share" },
      { value: "DISENO_INSUMOS", label: "Diseño Insumos", color: "#f59e0b", icon: "brush" },
      { value: "TIENDAS", label: "Tiendas", color: "#3b82f6", icon: "store" },
      { value: "CATALOGOS", label: "Catálogos", color: "#ec4899", icon: "menu_book" },
      { value: "OTROS", label: "Otros", color: "#64748b", icon: "more_horiz" },
    ],
  },
};

export const getCatalogos = (req: Request, res: Response) => {
  // Si el usuario no tiene departamento, asumimos DISEÑO por defecto o le mandamos ambos?
  // Lo ideal es mandarle según su departamento, o si es ADMIN, puede elegir?
  // El frontend lo manejará. Enviaremos todo el objeto y el frontend decide basado en el usuario.
  return res.json({
    status: "success",
    data: CATALOGOS_DEPARTAMENTO
  });
};
