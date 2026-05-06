import { prisma } from "../../db";

export const obtenerResumenMinuta = async (minutaId: number): Promise<Record<string, number>> => {
  const grupos = await prisma.tarea.groupBy({
    by:    ["estado"],
    where: { minutaId },
    _count: { id: true },
  });

  return grupos.reduce(
    (acc, curr) => ({ ...acc, [curr.estado]: curr._count.id }),
    {} as Record<string, number>
  );
};