import { Rol, EstadoTarea, TipoNotificacion, Estatus, Area, Departamento } from "@prisma/client";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { persistirYEmitir } from "./helper";
import type { TareaConRelaciones } from "./types";

// ── Helpers Internos ──────────────────────────────────────────────────────────

const obtenerJefesPorLinea = async (linea: string | null): Promise<number[]> => {
  const usuarios = await prisma.usuario.findMany({
    where: {
      rol: Rol.JEFE,
      estado: Estatus.ACTIVO,
      ...(linea ? { linea } : {}),
    },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
};

const obtenerIdsGerencia = async (): Promise<number[]> => {
  const usuarios = await prisma.usuario.findMany({
    where: { rol: Rol.GERENCIA, estado: Estatus.ACTIVO },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
};

const recortar = (texto: string, max = 70): string =>
  texto.length > max ? `${texto.substring(0, max)}...` : texto;

// ── Servicios Públicos ────────────────────────────────────────────────────────

/**
 * Notifica a los Jefes de las líneas afectadas que hay nuevas tareas
 * pendientes de organización post-junta (inicio de Fase 2).
 */
export const notificarNuevasTareas = async (
  minutaId: number | null,
  lineasAfectadas: (string | null)[],
  cantidad: number
): Promise<void> => {
  try {
    const lineasUnicas = [...new Set(lineasAfectadas.filter(Boolean))] as string[];
    const idsJefesSet = new Set<number>();

    if (lineasUnicas.length > 0) {
      for (const linea of lineasUnicas) {
        const ids = await obtenerJefesPorLinea(linea);
        ids.forEach((id) => idsJefesSet.add(id));
      }
    } else {
      const todos = await obtenerJefesPorLinea(null);
      todos.forEach((id) => idsJefesSet.add(id));
    }

    if (idsJefesSet.size === 0) return;

    const titulo = "📋 Nuevas Tareas de Junta";
    const cuerpo = `Se registraron ${cantidad} tarea${cantidad !== 1 ? "s" : ""} ${
      minutaId ? `(Minuta #${minutaId})` : ""
    }. Requieren organización.`;

    await persistirYEmitir(
      [...idsJefesSet],
      TipoNotificacion.NUEVAS_ENTRADAS,
      titulo,
      cuerpo,
      undefined,
      minutaId ? `/minutas/${minutaId}` : undefined
    );
  } catch (error) {
    await registrarError("NOTIF_NUEVAS_TAREAS", null, error);
  }
};

/**
 * Notifica a los responsables recién asignados a una tarea (Fase 2 - post-junta).
 */
export const notificarAsignacion = async (
  tareaId: number,
  idsNuevosResponsables: number[],
  descripcion: string,
  linea: string | null
): Promise<void> => {
  if (idsNuevosResponsables.length === 0) return;

  try {
    const lineaTexto = linea ? ` [${linea}]` : "";
    const titulo = "📌 Nueva Tarea Asignada";
    const cuerpo = `Se te asignó:${lineaTexto} "${recortar(descripcion)}"`;

    await persistirYEmitir(
      idsNuevosResponsables,
      TipoNotificacion.TAREA_ASIGNADA,
      titulo,
      cuerpo,
      tareaId,
      "/tareas/mis-tareas"
    );
  } catch (error) {
    await registrarError("NOTIF_ASIGNACION", null, error);
  }
};

/**
 * Notifica sobre cambios de estado relevantes en una tarea.
 */
export const notificarCambioEstado = async (
  tarea: TareaConRelaciones,
  nuevoEstado: EstadoTarea,
  actorId: number
): Promise<void> => {
  try {
    const descripcionCorta = `"${recortar(tarea.descripcion)}"`;
    const idsAsignados = (tarea.asignaciones ?? [])
      .map((a) => a.usuario.id)
      .filter((id) => id !== actorId);
      
    switch (nuevoEstado) {
      case EstadoTarea.EN_REVISION: {
        // Notificar al Jefe de la línea de la tarea
        const idsJefes = await obtenerJefesPorLinea(tarea.linea);
        
        // Gerencia solo si asignaron la tarea o la crearon
        const idsGerencia = await obtenerIdsGerencia();
        const fueAsignadaPorGerencia = (tarea.asignaciones ?? []).some(
          a => a.asignadoPorId && idsGerencia.includes(a.asignadoPorId)
        ) || idsGerencia.includes(tarea.creadoPorId);

        const destinatariosSet = new Set<number>();
        idsJefes.filter(id => id !== actorId).forEach(id => destinatariosSet.add(id));
        
        if (fueAsignadaPorGerencia) {
          idsGerencia.filter(id => id !== actorId).forEach(id => destinatariosSet.add(id));
        }

        const destinatarios = [...destinatariosSet];
        
        if (destinatarios.length > 0) {
          await persistirYEmitir(
            destinatarios,
            TipoNotificacion.REVISION_PENDIENTE,
            "✅ Tarea Completada — Pendiente de Cierre",
            `La tarea ${descripcionCorta} fue completada y requiere ser cerrada.`,
            tarea.id,
            "/tareas/por-aprobar"
          );
        }
        break;
      }

      case EstadoTarea.CERRADA: {
        // Notificar a los responsables asignados que la tarea fue cerrada
        if (idsAsignados.length > 0) {
          await persistirYEmitir(
            idsAsignados,
            TipoNotificacion.TAREA_CERRADA,
            "🔒 Tarea Cerrada",
            `La tarea ${descripcionCorta} ha sido cerrada definitivamente.`,
            tarea.id,
            "/tareas/mis-tareas"
          );
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    await registrarError("NOTIF_CAMBIO_ESTADO", null, error);
  }
};

/**
 * Nueva función: Notificar descarte de tarea.
 */
export const notificarTareaDescartada = async (
  tareaId: number,
  descripcion: string,
  actorId: number
): Promise<void> => {
  try {
    const tarea = await prisma.tarea.findUnique({
      where: { id: tareaId },
      include: { asignaciones: true }
    });
    if (!tarea) return;

    const idsAsignados = tarea.asignaciones
      .map((a) => a.usuarioId)
      .filter((id) => id !== actorId);

    if (idsAsignados.length > 0) {
      await persistirYEmitir(
        idsAsignados,
        TipoNotificacion.ENTRADA_DESCARTADA,
        "🗑️ Tarea Descartada",
        `No es necesario seguir trabajando en la tarea: "${recortar(descripcion)}"`,
        tareaId,
        "/tareas/mis-tareas"
      );
    }
  } catch (error) {
    await registrarError("NOTIF_TAREA_DESCARTADA", null, error);
  }
};

/**
 * Nueva función: Notificar organización de minuta al finalizar.
 */
export const notificarMinutaOrganizacion = async (
  minutaId: number,
  departamento: Departamento
): Promise<void> => {
  try {
    const jefesYGerentes = await prisma.usuario.findMany({
      where: {
        estado: Estatus.ACTIVO,
        departamento,
        rol: { in: [Rol.JEFE, Rol.GERENCIA] }
      },
      select: { id: true, rol: true, linea: true }
    });

    for (const usuario of jefesYGerentes) {
      const actionUrl = usuario.rol === Rol.GERENCIA 
        ? `/minutas/${minutaId}` 
        : `/minutas/${minutaId}?linea=${usuario.linea || ''}`;

      await persistirYEmitir(
        [usuario.id],
        TipoNotificacion.NUEVAS_ENTRADAS,
        "📋 Minuta Finalizada",
        `La minuta #${minutaId} ha finalizado. Requiere organización de entradas.`,
        undefined,
        actionUrl
      );
    }
  } catch (error) {
    await registrarError("NOTIF_MINUTA_ORGANIZACION", null, error);
  }
};

export const notificarLineaCambiada = async (
  tareaId: number,
  descripcion: string,
  lineaAnterior: string | null,
  lineaNueva: string | null
): Promise<void> => {
  if (!lineaNueva || lineaAnterior === lineaNueva) return;

  try {
    const idsNuevosJefes = await obtenerJefesPorLinea(lineaNueva);
    if (idsNuevosJefes.length === 0) return;

    await persistirYEmitir(
      idsNuevosJefes,
      TipoNotificacion.LINEA_CAMBIADA,
      "🔀 Nueva Tarea en tu Línea",
      `La tarea "${recortar(descripcion)}" fue movida a la línea ${lineaNueva}.`,
      tareaId,
      "/tareas/por-aprobar"
    );
  } catch (error) {
    await registrarError("NOTIF_LINEA_CAMBIADA", null, error);
  }
};

export const notificarVencimientoProximo = async (
  tareas: Array<{
    id: number;
    descripcion: string;
    linea: string | null;
    fechaVencimiento: Date;
    asignaciones: Array<{ usuario: { id: number } }>;
  }>
): Promise<void> => {
  if (tareas.length === 0) return;

  try {
    for (const tarea of tareas) {
      const idsAsignados = tarea.asignaciones.map((a) => a.usuario.id);
      const idsJefes = await obtenerJefesPorLinea(tarea.linea);
      const destinatarios = [...new Set([...idsAsignados, ...idsJefes])];

      if (destinatarios.length === 0) continue;

      const fechaStr = tarea.fechaVencimiento.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      await persistirYEmitir(
        destinatarios,
        TipoNotificacion.VENCIMIENTO_PROXIMO,
        "⏰ Tarea Por Vencer",
        `La tarea "${recortar(tarea.descripcion)}" vence el ${fechaStr}.`,
        tarea.id,
        "/tareas/mis-tareas"
      );
    }
  } catch (error) {
    await registrarError("NOTIF_VENCIMIENTO_PROXIMO", null, error);
  }
};

export const notificarTareaActualizada = async (
  tareaId: number,
  descripcion: string,
  idsResponsables: number[],
  actorId: number
): Promise<void> => {
  const destinatarios = idsResponsables.filter((id) => id !== actorId);
  if (destinatarios.length === 0) return;

  try {
    await persistirYEmitir(
      destinatarios,
      TipoNotificacion.TAREA_MODIFICADA,
      "📝 Tarea Actualizada",
      `La tarea "${recortar(descripcion)}" tuvo cambios en sus detalles.`,
      tareaId,
      "/tareas/mis-tareas"
    );
  } catch (error) {
    await registrarError("NOTIF_TAREA_ACTUALIZADA", null, error);
  }
};