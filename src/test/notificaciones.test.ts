import { describe, it, expect, mock, spyOn } from "bun:test";
import { notificarMinutaOrganizacion, notificarTareaDescartada } from "../modules/notificaciones/services";
import * as helper from "../modules/notificaciones/helper";
import { prisma } from "../db";
import { Departamento, Rol, EstadoMinuta, TipoEntrada } from "@prisma/client";

// Mock del helper para no escribir a BD real ni enviar sockets de verdad
spyOn(helper, "persistirYEmitir").mockResolvedValue(undefined);

describe("Servicios de Notificación", () => {
  it("Debe notificar descarte de tarea correctamente", async () => {
    // Mock prisma
    const originalFindUnique = prisma.tarea.findUnique;
    prisma.tarea.findUnique = mock().mockResolvedValue({
      id: 100,
      descripcion: "Tarea de prueba para descartar",
      asignaciones: [
        { usuarioId: 1 },
        { usuarioId: 2 },
      ]
    }) as any;

    await notificarTareaDescartada(100, "Tarea de prueba para descartar", 1);

    expect(helper.persistirYEmitir).toHaveBeenCalled();
    // Restaurar mock
    prisma.tarea.findUnique = originalFindUnique;
  });

  it("Debe notificar organización de minuta", async () => {
    const originalFindMany = prisma.usuario.findMany;
    prisma.usuario.findMany = mock().mockResolvedValue([
      { id: 1, rol: Rol.JEFE, linea: "BOTAS" },
      { id: 2, rol: Rol.GERENCIA, linea: null },
    ]) as any;

    await notificarMinutaOrganizacion(50, Departamento.DISENO);

    expect(helper.persistirYEmitir).toHaveBeenCalled();
    // Restaurar mock
    prisma.usuario.findMany = originalFindMany;
  });
});
