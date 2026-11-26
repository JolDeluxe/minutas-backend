import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import path from 'path';

const prisma = new PrismaClient();

function formatDate(d: any): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatDateTime(d: any): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function main() {
  console.log('🔌 Conectando a la base de datos vía Prisma...');
  
  // 1. Tareas internas y externas
  const [tareasInternas, tareasExternas, minutasInternas, minutasExternas, notasGenerales] = await Promise.all([
    prisma.tarea.findMany({
      include: {
        minuta: true,
        creadoPor: true,
        asignaciones: {
          include: { usuario: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.tareaExterna.findMany({
      include: {
        minutaExterna: true,
        creadoPor: true
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.minuta.findMany({
      include: {
        creadoPor: true,
        tareas: true
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.minutaExterna.findMany({
      include: {
        creadoPor: true,
        tareas: true
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.notaGeneral.findMany({
      include: {
        minuta: true,
        creadoPor: true
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  console.log(`📊 Datos obtenidos:`);
  console.log(`   • ${minutasInternas.length} Minutas internas | ${minutasExternas.length} Minutas externas`);
  console.log(`   • ${tareasInternas.length} Tareas internas | ${tareasExternas.length} Tareas externas`);
  console.log(`   • ${notasGenerales.length} Notas generales`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Manufacturera de Botas Cuadra';
  workbook.created = new Date();

  const colorHeader = '1F3864';
  const colorZebra = 'F8F9FA';

  // ─────────────────────────────────────────────────────────────
  // HOJA 1: TAREAS Y ACUERDOS
  // ─────────────────────────────────────────────────────────────
  const wsTareas = workbook.addWorksheet('TAREAS Y ACUERDOS', {
    views: [{ showGridLines: true }]
  });

  wsTareas.columns = [
    { header: 'Fecha Junta', key: 'fechaJunta', width: 14 },
    { header: 'Junta / Minuta', key: 'minuta', width: 35 },
    { header: 'Departamento', key: 'departamento', width: 16 },
    { header: 'Área Responsable', key: 'area', width: 18 },
    { header: 'Línea Producto', key: 'linea', width: 16 },
    { header: 'Clasificación', key: 'clasificacion', width: 18 },
    { header: 'Tipo de Registro', key: 'tipo', width: 16 },
    { header: 'Acuerdo o Tarea', key: 'descripcion', width: 45 },
    { header: 'Estatus Actual', key: 'estado', width: 16 },
    { header: 'Prioridad', key: 'prioridad', width: 14 },
    { header: 'Fecha Límite', key: 'fechaLimite', width: 14 },
    { header: 'Persona(s) Asignada(s)', key: 'asignados', width: 28 },
    { header: 'Registrado Por', key: 'creador', width: 22 },
    { header: 'Fecha de Registro', key: 'registro', width: 18 },
  ];

  for (const t of tareasInternas) {
    const asignados = t.asignaciones.map(a => a.usuario?.nombre).filter(Boolean).join(', ') || 'Sin asignar';
    wsTareas.addRow({
      fechaJunta: formatDate(t.minuta?.fechaProgramada || t.minuta?.fechaRealizada || t.createdAt),
      minuta: t.minuta?.titulo || 'Sin Minuta',
      departamento: t.minuta?.departamento || '',
      area: t.area || '',
      linea: t.linea || 'N/A',
      clasificacion: t.clasificacion || '',
      tipo: t.tipo || 'TAREA',
      descripcion: t.descripcion || '',
      estado: t.estado || '',
      prioridad: t.prioridad || 'MEDIA',
      fechaLimite: formatDate(t.fechaVencimiento),
      asignados: asignados,
      creador: t.creadoPor?.nombre || 'Administrador',
      registro: formatDateTime(t.createdAt)
    });
  }

  for (const te of tareasExternas) {
    wsTareas.addRow({
      fechaJunta: formatDate(te.minutaExterna?.fechaProgramada || te.createdAt),
      minuta: te.minutaExterna?.tema || 'Minuta Externa',
      departamento: 'EXTERNO',
      area: te.minutaExterna?.area || 'Externa',
      linea: te.departamento || 'EXTERNO',
      clasificacion: 'SEGUIMIENTO EXTERNO',
      tipo: 'TAREA',
      descripcion: te.descripcion || '',
      estado: te.estado || '',
      prioridad: te.prioridad || 'MEDIA',
      fechaLimite: formatDate(te.fechaVencimiento),
      asignados: 'Área Externa',
      creador: te.creadoPor?.nombre || 'Administrador',
      registro: formatDateTime(te.createdAt)
    });
  }

  // ─────────────────────────────────────────────────────────────
  // HOJA 2: RESUMEN DE JUNTAS
  // ─────────────────────────────────────────────────────────────
  const wsMinutas = workbook.addWorksheet('RESUMEN DE JUNTAS', {
    views: [{ showGridLines: true }]
  });

  wsMinutas.columns = [
    { header: 'Fecha Junta', key: 'fechaJunta', width: 14 },
    { header: 'Título de la Junta', key: 'titulo', width: 40 },
    { header: 'Departamento', key: 'departamento', width: 16 },
    { header: 'Línea Principal', key: 'linea', width: 16 },
    { header: 'Estado Junta', key: 'estado', width: 16 },
    { header: 'Líder / Creador', key: 'lider', width: 22 },
    { header: 'Total Acuerdos', key: 'total', width: 15 },
    { header: 'Completadas', key: 'completadas', width: 14 },
    { header: 'Pendientes', key: 'pendientes', width: 14 },
    { header: 'En Revisión', key: 'revision', width: 14 },
    { header: '% Avance', key: 'avance', width: 12 },
    { header: 'Fecha Realizada / Cierre', key: 'cierre', width: 22 }
  ];

  for (const m of minutasInternas) {
    const tareas = m.tareas || [];
    const completadas = tareas.filter(t => t.estado === 'CERRADA').length;
    const pendientes = tareas.filter(t => t.estado === 'PENDIENTE').length;
    const revision = tareas.filter(t => t.estado === 'EN_REVISION').length;
    const evaluables = completadas + pendientes + revision;
    const avance = evaluables === 0 ? (m.estado === 'CERRADA' ? '100%' : '0%') : `${Math.round((completadas / evaluables) * 100)}%`;

    wsMinutas.addRow({
      fechaJunta: formatDate(m.fechaProgramada || m.createdAt),
      titulo: m.titulo,
      departamento: m.departamento,
      linea: m.lineaDefault || 'General',
      estado: m.estado,
      lider: m.creadoPor?.nombre || 'Administrador',
      total: tareas.length,
      completadas,
      pendientes,
      revision,
      avance,
      cierre: formatDate(m.fechaRealizada)
    });
  }

  for (const me of minutasExternas) {
    const tareas = me.tareas || [];
    const completadas = tareas.filter(t => t.estado === 'CERRADA').length;
    const pendientes = tareas.filter(t => t.estado === 'PENDIENTE').length;
    const revision = tareas.filter(t => t.estado === 'EN_REVISION').length;
    const evaluables = completadas + pendientes + revision;
    const avance = evaluables === 0 ? (me.estado === 'CERRADA' ? '100%' : '0%') : `${Math.round((completadas / evaluables) * 100)}%`;

    wsMinutas.addRow({
      fechaJunta: formatDate(me.fechaProgramada || me.createdAt),
      titulo: me.tema,
      departamento: 'EXTERNO',
      linea: me.departamento || me.area || 'Externo',
      estado: me.estado,
      lider: me.creadoPor?.nombre || 'Administrador',
      total: tareas.length,
      completadas,
      pendientes,
      revision,
      avance,
      cierre: formatDate(me.cerradoAt)
    });
  }

  // ─────────────────────────────────────────────────────────────
  // HOJA 3: POST-ITS Y NOTAS
  // ─────────────────────────────────────────────────────────────
  const wsNotas = workbook.addWorksheet('POST-ITS Y NOTAS', {
    views: [{ showGridLines: true }]
  });

  wsNotas.columns = [
    { header: 'Fecha Junta', key: 'fechaJunta', width: 14 },
    { header: 'Minuta Asociada', key: 'minuta', width: 40 },
    { header: 'Nota o Post-it', key: 'contenido', width: 50 },
    { header: 'Autor de la Nota', key: 'autor', width: 22 },
    { header: 'Fecha y Hora Captura', key: 'fecha', width: 20 }
  ];

  for (const n of notasGenerales) {
    wsNotas.addRow({
      fechaJunta: formatDate(n.minuta?.fechaProgramada || n.createdAt),
      minuta: n.minuta?.titulo || 'General',
      contenido: n.contenido,
      autor: n.creadoPor?.nombre || 'Administrador',
      fecha: formatDateTime(n.createdAt)
    });
  }

  // Estilizar todas las hojas con el formato ejecutivo Cuadra
  for (const ws of [wsTareas, wsMinutas, wsNotas]) {
    const headerRow = ws.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + colorHeader }
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.height = 20;
      const isZebra = rowNumber % 2 === 0;
      row.eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 9 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        };
        if (isZebra) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF' + colorZebra }
          };
        }
      });
    });
  }

  const now = new Date();
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const filename = `Control_General_Minutas_y_Tareas_Cuadra_${dateStr}.xlsx`;
  const outputPath = path.join(process.cwd(), filename);

  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n✅ ¡Archivo Excel generado con éxito!`);
  console.log(`📁 Guardado en: ${outputPath}`);
}

main()
  .catch((e) => {
    console.error('❌ Error generando el Excel:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
