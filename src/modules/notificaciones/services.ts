import { Rol, EstadoTarea, TipoNotificacion, Linea, Estatus, Area } from "@prisma/client";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { persistirYEmitir } from "./helper";
import type { TareaConRelaciones } from "./types";

// ── Helpers Internos ──────────────────────────────────────────────────────────

const obtenerJefesPorLinea = async (linea: Linea | null): Promise<number[]> => {
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
 *
 * Llamar desde: `src/modules/tareas/02_create.ts`
 */
export const notificarNuevasTareas = async (
  minutaId: number | null,
  lineasAfectadas: (Linea | null)[],
  cantidad: number
): Promise<void> => {
  try {
    const lineasUnicas = [...new Set(lineasAfectadas.filter(Boolean))] as Linea[];

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
      TipoNotificacion.NUEVAS_TAREAS,
      titulo,
      cuerpo
    );
  } catch (error) {
    await registrarError("NOTIF_NUEVAS_TAREAS", null, error);
  }
};

/**
 * Notifica a los responsables recién asignados a una tarea (Fase 2 - post-junta).
 *
 * Llamar desde: `src/modules/tareas/04_update.ts` cuando cambian los responsables.
 */
export const notificarAsignacion = async (
  tareaId: number,
  idsNuevosResponsables: number[],
  descripcion: string,
  linea: Linea | null
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
      tareaId
    );
  } catch (error) {
    await registrarError("NOTIF_ASIGNACION", null, error);
  }
};

/**
 * Notifica sobre cambios de estado relevantes en una tarea interna (área DISEÑO).
 * Las tareas externas no generan notificaciones automáticas.
 * Solo aplica para: COMPLETADO y CERRADO.
 *
 * Llamar desde: `src/modules/tareas/05_change-status.ts`
 */
export const notificarCambioEstado = async (
  tarea: TareaConRelaciones,
  nuevoEstado: EstadoTarea,
  actorId: number
): Promise<void> => {
  try {
    if (tarea.area !== Area.DISENO) return;

    const descripcionCorta = `"${recortar(tarea.descripcion)}"`;
    const idsAsignados = (tarea.asignaciones ?? [])
      .map((a) => a.usuario.id)
      .filter((id) => id !== actorId);
    const idsJefes = await obtenerJefesPorLinea(tarea.linea);
    const idsGerencia = await obtenerIdsGerencia();

    switch (nuevoEstado) {
      case EstadoTarea.COMPLETADO: {
        // Notificar al Jefe y Gerencia: la tarea espera revisión y cierre
        const destinatarios = [
          ...new Set([
            ...idsJefes.filter((id) => id !== actorId),
            ...idsGerencia.filter((id) => id !== actorId),
          ]),
        ];
        if (destinatarios.length > 0) {
          await persistirYEmitir(
            destinatarios,
            TipoNotificacion.REVISION_PENDIENTE,
            "✅ Tarea Completada — Pendiente de Cierre",
            `La tarea ${descripcionCorta} fue completada y requiere ser cerrada.`,
            tarea.id
          );
        }
        break;
      }

      case EstadoTarea.CERRADO: {
        // Notificar a los responsables asignados que la tarea fue cerrada
        if (idsAsignados.length > 0) {
          await persistirYEmitir(
            idsAsignados,
            TipoNotificacion.TAREA_CERRADA,
            "🔒 Tarea Cerrada",
            `La tarea ${descripcionCorta} ha sido cerrada definitivamente.`,
            tarea.id
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
 * Notifica al Jefe de la nueva línea cuando una tarea es reasignada de línea.
 *
 * Llamar desde: `src/modules/tareas/04_update.ts` cuando cambia el campo `linea`.
 */
export const notificarLineaCambiada = async (
  tareaId: number,
  descripcion: string,
  lineaAnterior: Linea | null,
  lineaNueva: Linea | null
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
      tareaId
    );
  } catch (error) {
    await registrarError("NOTIF_LINEA_CAMBIADA", null, error);
  }
};

/**
 * Notifica a responsables y al Jefe de la línea sobre tareas próximas a vencer.
 *
 * Llamar desde: `src/utils/scheduler.ts` (CRON diario).
 */
export const notificarVencimientoProximo = async (
  tareas: Array<{
    id: number;
    descripcion: string;
    linea: Linea | null;
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
        tarea.id
      );
    }
  } catch (error) {
    await registrarError("NOTIF_VENCIMIENTO_PROXIMO", null, error);
  }
};

/**
 * Notifica a los responsables asignados cuando se modifica información relevante
 * de una tarea (descripción, prioridad, fecha de vencimiento).
 *
 * Llamar desde: `src/modules/tareas/04_update.ts`
 */
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
      tareaId
    );
  } catch (error) {
    await registrarError("NOTIF_TAREA_ACTUALIZADA", null, error);
  }
};