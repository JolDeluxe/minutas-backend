import { PrismaClient, EstadoMinuta, Departamento, Area, Prioridad, EstadoConceptual, EstadoOperativo, EstadoTarea, TipoAsignacion, EstadoAsignacion } from '@prisma/client';

const prisma = new PrismaClient();

// Auxiliares para fechas
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}

const DESCRIPCIONES_DISENO = [
  "Revisar suelas del prototipo de Bota Vaquera 2026.",
  "Corregir pespunte en caña de muestra 094.",
  "Aprobar paleta de colores de pieles exóticas para la temporada de Otoño.",
  "Cotizar hebillas de metal personalizadas con proveedor en León.",
  "Desarrollar patrón de corte digital para bota alta de dama.",
  "Realizar pruebas de confort en plantilla ergonómica de espuma viscoelástica.",
  "Ajustar altura de tacón para botín urbano de caballero.",
  "Revisar resistencia de costuras en cuero graso de muestra #102.",
  "Elaborar ficha técnica de bota chelsea con elásticos reforzados.",
  "Analizar costos de fabricación de la línea casual 2026."
];

const CLASIFICACIONES_DISENO = [
  "DISEÑO DE PRODUCTO",
  "CORRECCION MUESTRA",
  "FICHA TECNICA",
  "PRUEBA CONFORT",
  "MATERIALES EXOTICOS",
  "COTIZACION PROVEEDOR"
];

const DESCRIPCIONES_MARKETING = [
  "Lanzar campaña publicitaria en Instagram de la nueva línea de Ropa.",
  "Aprobar sesión fotográfica con los nuevos modelos de bota urbana.",
  "Diseñar banners para el sitio web corporativo principal.",
  "Redactar nota de prensa para el lanzamiento de la temporada Primavera-Verano.",
  "Analizar el engagement rate de la última semana en TikTok.",
  "Coordinar influencer marketing para el próximo desfile en CDMX.",
  "Planificar newsletter mensual para clientes VIP del programa Cuadra.",
  "Producir video promocional detrás de cámaras en taller de diseño.",
  "Actualizar catálogo digital de productos de exportación.",
  "Ajustar presupuesto de pauta digital para Facebook Ads."
];

const CLASIFICACIONES_MARKETING = [
  "CAMPANA DIGITAL",
  "SESION FOTOGRAFICA",
  "REDES SOCIALES",
  "NEWSLETTER",
  "PRESUSPUESTO PUBLICITARIO",
  "MATERIAL IMPRESO"
];

const DESCRIPCIONES_GENERAL = [
  "Revisar cuellos de botella en la planta de corte Kappa.",
  "Presentar balance de producción mensual a Dirección General.",
  "Planificar mantenimiento preventivo de máquinas de coser en planta Sigma.",
  "Discutir plan de capacitación técnica para nuevos operarios de pespunte.",
  "Evaluar presupuesto para la adquisición de nuevo software de diseño de calzado 3D.",
  "Ajustar tiempos de entrega logística para el cliente de exportación de Texas.",
  "Analizar merma de piel en el corte automatizado de calzado.",
  "Revisar estado de las certificaciones de seguridad laboral en planta Kappa.",
  "Establecer metas de productividad trimestral por departamento.",
  "Discutir feedback de clientes sobre el tallaje de chamarras de piel."
];

const CLASIFICACIONES_GENERAL = [
  "EFICIENCIA OPERATIVA",
  "ESTADO FINANCIERO",
  "MAQUINARIA Y EQUIPO",
  "CAPACITACION PERSONAL",
  "PLANIFICACION TRIMESTRAL",
  "LOGISTICA Y EMBARQUE"
];

async function main() {
  console.log('🌱 Iniciando script de poblado de Minutas y Tareas (Ene 2026 - Hoy)...');

  // 1. Limpieza de tablas relacionadas
  console.log('🧹 Limpiando registros antiguos...');
  await prisma.notaGeneral.deleteMany({});
  await prisma.tareaNota.deleteMany({});
  await prisma.tareaImagen.deleteMany({});
  await prisma.tareaAsignacion.deleteMany({});
  await prisma.tareaHistorial.deleteMany({});
  await prisma.notificacion.deleteMany({});
  await prisma.tarea.deleteMany({});
  await prisma.minuta.deleteMany({});
  console.log('✅ Base de datos limpia de minutas y tareas.');

  // 2. Definición de usuarios y roles
  // Verificamos que los usuarios existan (los IDs que obtuvimos en la consulta previa)
  const users = await prisma.usuario.findMany({ select: { id: true, username: true } });
  const userMap = new Map<string, number>();
  users.forEach(u => userMap.set(u.username, u.id));

  const adminId = userMap.get('admin') || 20;
  const gerenteDisenoId = userMap.get('gerente.diseno') || 21;
  const jefeDisenoId = userMap.get('jefe.diseno') || 22;
  const coordDisenoId = userMap.get('coord.diseno') || 23;
  const gerenteMktId = userMap.get('gerente.marketing') || 24;
  const jefeMktId = userMap.get('jefe.marketing') || 25;
  const coordMktId = userMap.get('coord.marketing') || 26;
  const joelId = userMap.get('joelisaac') || 28;

  console.log('👥 Usando mapa de usuarios:', Object.fromEntries(userMap));

  // Rango: 1 de Enero de 2026 a 19 de Mayo de 2026 (HOY)
  // Nota: El local time es 2026-05-19.
  const today = new Date('2026-05-19T17:00:00-06:00'); 
  const startDate = new Date('2026-01-01T08:00:00-06:00');

  // Estructuras de almacenamiento para encadenamiento posterior
  interface MinutaParams {
    titulo: string;
    lineaDefault: string | null;
    estado: EstadoMinuta;
    fechaProgramada: Date;
    fechaRealizada: Date | null;
    creadoPorId: number;
    cerradoPorId: number | null;
    cerradoAt: Date | null;
    lineType: 'CALZADO' | 'BOTA' | 'MARKETING' | 'GENERAL';
  }

  const minutasToCreate: MinutaParams[] = [];

  // Recorrer el periodo día a día y recolectar las reuniones
  let current = new Date(startDate);
  while (current <= today) {
    const dayOfWeek = current.getDay(); // 0 = Dom, 1 = Lun, 2 = Mar, 3 = Mie, 4 = Jue, 5 = Vie, 6 = Sab
    const yearNum = current.getFullYear();
    const monthNum = current.getMonth() + 1;
    const dayNum = current.getDate();
    const weekNum = getWeekNumber(current);

    const isToday = current.toDateString() === today.toDateString();

    // ─── CANAL 1: DISEÑO CALZADO Y BOTA (Cada Martes) ───
    if (dayOfWeek === 2) {
      // Alternamos o creamos ambas líneas
      const isBota = weekNum % 2 === 0;
      const lineName = isBota ? 'BOTA' : 'CALZADO';
      const creator = isBota ? jefeDisenoId : coordDisenoId;

      let estado: EstadoMinuta = EstadoMinuta.CERRADA;
      if (isToday) {
        estado = EstadoMinuta.ACTIVA; // HOY es Martes 19 de Mayo, la de hoy está ACTIVA
      } else if (current > new Date('2026-05-10T00:00:00-06:00')) {
        // La semana pasada (12 de Mayo) en revisión
        estado = EstadoMinuta.EN_REVISION;
      }

      minutasToCreate.push({
        titulo: `Junta de Diseño - Línea ${lineName} - Semana ${weekNum}`,
        lineaDefault: lineName,
        estado,
        fechaProgramada: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 9, 0, 0),
        fechaRealizada: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 9, 15, 0),
        creadoPorId: creator,
        cerradoPorId: estado === EstadoMinuta.CERRADA ? gerenteDisenoId : null,
        cerradoAt: estado === EstadoMinuta.CERRADA ? new Date(current.getFullYear(), current.getMonth(), current.getDate(), 11, 0, 0) : null,
        lineType: isBota ? 'BOTA' : 'CALZADO'
      });
    }

    // ─── CANAL 2: MARKETING (Cada Jueves) ───
    if (dayOfWeek === 4) {
      let estado: EstadoMinuta = EstadoMinuta.CERRADA;
      if (current > new Date('2026-05-10T00:00:00-06:00')) {
        // La semana pasada (14 de Mayo) en revisión
        estado = EstadoMinuta.EN_REVISION;
      }

      minutasToCreate.push({
        titulo: `Comité de Marketing y Campañas - Semana ${weekNum}`,
        lineaDefault: 'ROPA',
        estado,
        fechaProgramada: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 11, 0, 0),
        fechaRealizada: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 11, 5, 0),
        creadoPorId: jefeMktId,
        cerradoPorId: estado === EstadoMinuta.CERRADA ? gerenteMktId : null,
        cerradoAt: estado === EstadoMinuta.CERRADA ? new Date(current.getFullYear(), current.getMonth(), current.getDate(), 13, 0, 0) : null,
        lineType: 'MARKETING'
      });
    }

    // ─── CANAL 3: ALINEACIÓN GENERAL (Cada 2 Lunes) ───
    if (dayOfWeek === 1 && weekNum % 2 === 0) {
      let estado: EstadoMinuta = EstadoMinuta.CERRADA;
      if (current.toDateString() === new Date('2026-05-18T00:00:00-06:00').toDateString()) {
        // Ayer lunes 18 de mayo
        estado = EstadoMinuta.EN_REVISION;
      }

      minutasToCreate.push({
        titulo: `Alineación de Operaciones y Dirección - Quincenal - Semana ${weekNum}`,
        lineaDefault: null,
        estado,
        fechaProgramada: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 8, 30, 0),
        fechaRealizada: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 8, 45, 0),
        creadoPorId: adminId,
        cerradoPorId: estado === EstadoMinuta.CERRADA ? adminId : null,
        cerradoAt: estado === EstadoMinuta.CERRADA ? new Date(current.getFullYear(), current.getMonth(), current.getDate(), 10, 30, 0) : null,
        lineType: 'GENERAL'
      });
    }

    // Avanzar un día
    current.setDate(current.getDate() + 1);
  }

  // ─── AGREGAR MINUTAS FUTURAS (PROGRAMADAS) ───
  // 1. Marketing programada para este Jueves 21 de Mayo
  minutasToCreate.push({
    titulo: "Comité de Marketing y Lanzamiento Invierno (Planificación)",
    lineaDefault: "ROPA",
    estado: EstadoMinuta.PROGRAMADA,
    fechaProgramada: new Date('2026-05-21T11:00:00-06:00'),
    fechaRealizada: null,
    creadoPorId: jefeMktId,
    cerradoPorId: null,
    cerradoAt: null,
    lineType: 'MARKETING'
  });

  // 2. Diseño Calzado programada para el próximo Martes 26 de Mayo
  minutasToCreate.push({
    titulo: "Alineación de Modelaje y Hormas Calzado Urbano",
    lineaDefault: "CALZADO",
    estado: EstadoMinuta.PROGRAMADA,
    fechaProgramada: new Date('2026-05-26T09:00:00-06:00'),
    fechaRealizada: null,
    creadoPorId: coordDisenoId,
    cerradoPorId: null,
    cerradoAt: null,
    lineType: 'CALZADO'
  });

  // 3. Una minuta que fue cancelada en Abril para simular cancelaciones
  minutasToCreate.push({
    titulo: "Comité Extraordinario de Marketing (Cancelado por asueto)",
    lineaDefault: "ROPA",
    estado: EstadoMinuta.CANCELADA,
    fechaProgramada: new Date('2026-04-09T15:00:00-06:00'),
    fechaRealizada: null,
    creadoPorId: jefeMktId,
    cerradoPorId: null,
    cerradoAt: null,
    lineType: 'MARKETING'
  });

  console.log(`📋 Total de minutas a crear planificadas: ${minutasToCreate.length}`);

  // Ordenar cronológicamente para poder insertar y encadenar correctamente
  minutasToCreate.sort((a, b) => a.fechaProgramada.getTime() - b.fechaProgramada.getTime());

  // Mapa para guardar las últimas minutas por tipo y realizar el encadenamiento minutaAnteriorId
  const ultimasMinutasPorTipo = new Map<string, number>();

  let minutaCount = 0;
  let tareasCount = 0;

  for (const mData of minutasToCreate) {
    // Buscar si hay una minuta anterior de este mismo tipo para encadenarla
    const anteriorId = ultimasMinutasPorTipo.get(mData.lineType) || null;

    const minuta = await prisma.minuta.create({
      data: {
        titulo: mData.titulo,
        lineaDefault: mData.lineaDefault,
        estado: mData.estado,
        fechaProgramada: mData.fechaProgramada,
        fechaRealizada: mData.fechaRealizada,
        creadoPorId: mData.creadoPorId,
        cerradoPorId: mData.cerradoPorId,
        cerradoAt: mData.cerradoAt,
        minutaAnteriorId: anteriorId,
        canceladoPorId: mData.estado === EstadoMinuta.CANCELADA ? mData.creadoPorId : null,
        canceladoAt: mData.estado === EstadoMinuta.CANCELADA ? new Date(mData.fechaProgramada.getTime() + 7200000) : null
      }
    });

    // Guardar esta minuta como la última de este tipo
    ultimasMinutasPorTipo.set(mData.lineType, minuta.id);
    minutaCount++;

    // --- AGREGAR NOTAS GENERALES (POST-ITS) ---
    // Añadimos notas generales en un 30% de las minutas para enriquecer la visualización
    if (mData.estado !== EstadoMinuta.PROGRAMADA && Math.random() < 0.35) {
      await prisma.notaGeneral.createMany({
        data: [
          {
            contenido: `Asistencia completa. El equipo acordó priorizar las entregas de ${mData.lineaDefault || 'las líneas generales'} para fin de mes.`,
            minutaId: minuta.id,
            creadoPorId: mData.creadoPorId,
            createdAt: new Date(minuta.fechaProgramada.getTime() + 1800000)
          },
          {
            contenido: "Recordatorio: La próxima sesión requiere muestras físicas terminadas sin excepciones.",
            minutaId: minuta.id,
            creadoPorId: mData.creadoPorId,
            createdAt: new Date(minuta.fechaProgramada.getTime() + 3000000)
          }
        ]
      });
    }

    // --- GENERAR ENTRADAS (TAREAS) ---
    // Decidir cuántas tareas crear según el estado de la minuta
    let numTareas = 0;
    if (mData.estado === EstadoMinuta.CERRADA) {
      numTareas = Math.floor(Math.random() * 4) + 3; // 3 a 6 tareas
    } else if (mData.estado === EstadoMinuta.EN_REVISION) {
      numTareas = Math.floor(Math.random() * 3) + 3; // 3 a 5 tareas
    } else if (mData.estado === EstadoMinuta.ACTIVA) {
      numTareas = 5; // 5 tareas exactas para la junta de HOY
    } else if (mData.estado === EstadoMinuta.PROGRAMADA) {
      numTareas = Math.floor(Math.random() * 2); // 0 o 1 tareas de agenda
    }

    for (let i = 0; i < numTareas; i++) {
      let desc = "";
      let clasificación = "";
      let depto: Departamento = Departamento.DISENO;
      let area: Area = Area.DISENO;
      let asignadoAId = coordDisenoId;

      if (mData.lineType === 'MARKETING') {
        desc = DESCRIPCIONES_MARKETING[i % DESCRIPCIONES_MARKETING.length]!;
        clasificación = CLASIFICACIONES_MARKETING[i % CLASIFICACIONES_MARKETING.length]!;
        depto = Departamento.MARKETING;
        area = Area.MARKETING;
        asignadoAId = coordMktId;
      } else if (mData.lineType === 'GENERAL') {
        desc = DESCRIPCIONES_GENERAL[i % DESCRIPCIONES_GENERAL.length]!;
        clasificación = CLASIFICACIONES_GENERAL[i % CLASIFICACIONES_GENERAL.length]!;
        // En general alternamos departamentos y coordinadores
        if (i % 2 === 0) {
          depto = Departamento.DISENO;
          area = Area.DISENO;
          asignadoAId = joelId;
        } else {
          depto = Departamento.MARKETING;
          area = Area.MARKETING;
          asignadoAId = coordMktId;
        }
      } else {
        // CALZADO o BOTA
        desc = DESCRIPCIONES_DISENO[i % DESCRIPCIONES_DISENO.length]!;
        clasificación = CLASIFICACIONES_DISENO[i % CLASIFICACIONES_DISENO.length]!;
        depto = Departamento.DISENO;
        area = Area.DISENO;
        // Asignamos al coordinador o a Joel
        asignadoAId = i % 2 === 0 ? coordDisenoId : joelId;
      }

      // Definir estados según la minuta
      let estadoConceptual: EstadoConceptual = EstadoConceptual.CERRADO;
      let estadoOperativo: EstadoOperativo | null = EstadoOperativo.COMPLETADO;
      let estadoTarea: EstadoTarea = EstadoTarea.CERRADO;
      let formalizada = true;

      const nowVal = mData.fechaProgramada;

      if (mData.estado === EstadoMinuta.PROGRAMADA) {
        estadoConceptual = EstadoConceptual.CAPTURADO;
        estadoOperativo = null;
        estadoTarea = EstadoTarea.PENDIENTE;
        formalizada = false;
      } else if (mData.estado === EstadoMinuta.ACTIVA) {
        // En juntas activas, las tareas se capturan pero algunas se empiezan a formalizar
        estadoConceptual = i % 2 === 0 ? EstadoConceptual.CAPTURADO : EstadoConceptual.EN_REVISION;
        estadoOperativo = i % 3 === 0 ? EstadoOperativo.EN_PROGRESO : EstadoOperativo.PENDIENTE;
        estadoTarea = i % 3 === 0 ? EstadoTarea.EN_PROGRESO : EstadoTarea.PENDIENTE;
        formalizada = i % 2 !== 0;
      } else if (mData.estado === EstadoMinuta.EN_REVISION) {
        // En revisión, algunas están en progreso, otras ya se completaron
        estadoConceptual = EstadoConceptual.EN_REVISION;
        estadoOperativo = i % 2 === 0 ? EstadoOperativo.COMPLETADO : EstadoOperativo.EN_PROGRESO;
        estadoTarea = i % 2 === 0 ? EstadoTarea.COMPLETADO : EstadoTarea.EN_PROGRESO;
        formalizada = true;
      } else if (mData.estado === EstadoMinuta.CERRADA) {
        // Minutas cerradas tienen la mayoría completadas, o algunas cerradas operativamente
        if (i === numTareas - 1 && Math.random() < 0.3) {
          // Descartada
          estadoConceptual = EstadoConceptual.DESCARTADO;
          estadoOperativo = null;
          estadoTarea = EstadoTarea.PENDIENTE;
          formalizada = false;
        } else {
          estadoConceptual = EstadoConceptual.CERRADO;
          estadoOperativo = EstadoOperativo.COMPLETADO;
          estadoTarea = EstadoTarea.CERRADO;
          formalizada = true;
        }
      }

      const requiereSeguimiento = formalizada;
      const prioridad = formalizada ? (i % 4 === 0 ? Prioridad.ALTA : i % 3 === 0 ? Prioridad.MEDIA : Prioridad.BAJA) : null;
      const fechaVencimiento = formalizada ? new Date(nowVal.getTime() + 7 * 24 * 60 * 60 * 1000) : null; // 7 días después
      const completadoAt = estadoOperativo === EstadoOperativo.COMPLETADO ? new Date(nowVal.getTime() + 4 * 24 * 60 * 60 * 1000) : null;

      const tarea = await prisma.tarea.create({
        data: {
          descripcion: desc,
          departamento: depto,
          area: area,
          linea: mData.lineaDefault,
          clasificacion: clasificación,
          fechaSeguimiento: requiereSeguimiento ? nowVal : null,
          requiereSeguimiento,
          estadoConceptual,
          formalizada,
          formalizadoAt: formalizada ? nowVal : null,
          formalizadoPorId: formalizada ? mData.creadoPorId : null,
          prioridad,
          estadoOperativo,
          fechaVencimiento,
          completadoAt,
          estado: estadoTarea,
          cerradoAt: estadoConceptual === EstadoConceptual.CERRADO ? completadoAt : null,
          capturaCompleta: formalizada,
          isExternalArea: area !== Area.DISENO && area !== Area.MARKETING,
          minutaId: mData.estado !== EstadoMinuta.CANCELADA ? minuta.id : null, // Si es cancelada, no se asocian
          creadoPorId: mData.creadoPorId,
          createdAt: nowVal,
          updatedAt: nowVal
        }
      });

      tareasCount++;

      // Crear asignación para la tarea si está formalizada
      if (formalizada) {
        await prisma.tareaAsignacion.create({
          data: {
            tipo: TipoAsignacion.EJECUTOR,
            estado: estadoOperativo === EstadoOperativo.COMPLETADO ? EstadoAsignacion.COMPLETADO : (estadoOperativo === EstadoOperativo.EN_PROGRESO ? EstadoAsignacion.EN_PROGRESO : EstadoAsignacion.PENDIENTE),
            completadoAt: estadoOperativo === EstadoOperativo.COMPLETADO ? completadoAt : null,
            tareaId: tarea.id,
            usuarioId: asignadoAId,
            asignadoPorId: mData.creadoPorId,
            createdAt: nowVal,
            updatedAt: nowVal
          }
        });

        // Crear una nota/anexo rápido para simular discusión operativa
        if (Math.random() < 0.25) {
          await prisma.tareaNota.create({
            data: {
              contenido: "El proveedor confirmó que las muestras de hebillas llegarán este viernes.",
              tareaId: tarea.id,
              creadoPorId: asignadoAId,
              createdAt: new Date(nowVal.getTime() + 2 * 24 * 60 * 60 * 1000)
            }
          });
        }
      }
    }
  }

  console.log(`\n🎉 SEED COMPLETADO EXITOSAMENTE!`);
  console.log(`📊 Resumen de inserción:`);
  console.log(`   └─ Minutas creadas: ${minutaCount}`);
  console.log(`   └─ Tareas creadas: ${tareasCount}`);
  console.log(`   └─ Rango temporal: 2026-01-01 a 2026-05-19`);
}

main()
  .catch((e) => {
    console.error('❌ Error fatal en el seed-minutas:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
