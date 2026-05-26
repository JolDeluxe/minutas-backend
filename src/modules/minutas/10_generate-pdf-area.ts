import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
// @ts-ignore – sin tipos; crea src/types/svg-to-pdfkit.d.ts → declare module 'svg-to-pdfkit';
import SVGtoPDF from "svg-to-pdfkit";
import axios from "axios";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { uploadPdfDocument } from "../../utils/cloudinary";
import path from "path";
import fs from "fs";
import { Area } from "@prisma/client";

// ─── Helper fecha ────────────────────────────────────────────────────────────

const fmt = (date: Date | string | null | undefined): string => {
  if (!date) return "N/A";
  const d = new Date(date as string);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
};

// ─── Paleta Grupo Cuadra ──────────────────────────────────────────────────────
//  Header CLARO para que el logo negro sea legible.
//  Barras decorativas café/dorado conservan la identidad de marca.
const C = {
  headerBg: "#FAF5EF",  // Crema cálido       → fondo header (logo negro visible)
  topBar:   "#2E1208",  // Café muy oscuro     → franja superior 4 px
  goldBar:  "#C49A3C",  // Dorado cálido       → franja inferior header 4 px
  primary:  "#2E1208",  // Café oscuro         → texto principal
  brown:    "#7B3D1E",  // Café cognac         → etiquetas / detalles
  gold:     "#C49A3C",  // Dorado              → acentos / barra de punto
  cream:    "#F3EDE4",  // Crema oscura        → fondo bloque tarea
  rule:     "#D4B896",  // Beige               → líneas divisoras
  muted:    "#9A6A4A",  // Café medio          → texto secundario
  white:    "#FFFFFF",
} as const;

// ─── Controlador ─────────────────────────────────────────────────────────────

export const generarPdfPorArea = async (req: Request, res: Response) => {
  try {
    const minutaId = Number(req.params.id);
    const area     = req.params.area as Area;

    if (isNaN(minutaId) || !area)
      return res.status(400).json({ error: "Faltan parámetros válidos" });

    const minuta = await prisma.minuta.findUnique({ where: { id: minutaId } });
    if (!minuta)
      return res.status(404).json({ error: "Minuta no encontrada" });

    const tareas = await prisma.tarea.findMany({
      where: {
        minutaId, area,
        OR:   [{ estado: { not: "CANCELADA" } }, { estado: null }],
        tipo: { in: ["TAREA", "SIN_ORGANIZAR"] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        creadoPor: { select: { nombre: true } },
        imagenes:  { select: { url: true } },
      },
    });

    if (tareas.length === 0)
      return res.status(404).json({ error: `No hay tareas para el área ${area}` });

    // ── Generar PDF ──────────────────────────────────────────────────────────
    const pdfUrl = await new Promise<string>((resolve, reject) => {

      // Dimensiones clave
      const MARGIN   = 50;   // margen uniform (pt)
      const HEADER_H = 92;   // alto del header (pt)
      const FOOTER_R = 52;   // espacio reservado al pie de página (pt)

      const doc = new PDFDocument({
        margin:        MARGIN,
        size:          "LETTER",
        autoFirstPage: true,
        bufferPages:   true,   // necesario para escribir footer al final
      });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      doc.on("end", async () => {
        try {
          const ds  = fmt(minuta.fechaRealizada ?? minuta.fechaProgramada).replace(/\//g, "-");
          const url = await uploadPdfDocument(Buffer.concat(buffers), `Tareas_${area}_${ds}`);
          resolve(url);
        } catch (e) { reject(e); }
      });

      const PW      = doc.page.width;          // 612 pt
      const PH      = doc.page.height;         // 792 pt
      const CW      = PW - MARGIN * 2;         // 512 pt  — ancho útil
      const MAX_Y   = PH - FOOTER_R - 10;      // y límite antes del footer

      // Grid de imágenes: 2 columnas, proporción 4:3
      const IMG_GAP = 12;
      const IMG_W   = Math.floor((CW - IMG_GAP) / 2);   // ~250 pt
      const IMG_H   = Math.round(IMG_W * 0.75);          // ~187 pt

      const areaLabel = area.replace(/_/g, " ");
      const fechaStr  = fmt(minuta.fechaRealizada ?? minuta.fechaProgramada ?? minuta.createdAt);

      // ── Función: dibujar header ─────────────────────────────────────────────
      // Se llama en la primera página; el footer gestiona las siguientes.
      const drawHeader = () => {
        // Franja superior café oscuro
        doc.rect(0, 0, PW, 4).fill(C.topBar);

        // Fondo crema del header
        doc.rect(0, 4, PW, HEADER_H - 8).fill(C.headerBg);

        // Franja inferior dorada
        doc.rect(0, HEADER_H - 4, PW, 4).fill(C.goldBar);

        // Logo — izquierda, centrado verticalmente en el área crema
        const logoPath = path.join(process.cwd(), "public", "img", "Grupo_Cuadra.svg");
        if (fs.existsSync(logoPath)) {
          const svg = fs.readFileSync(logoPath, "utf-8");
          // y=18 centra el logo de 56 pt en la zona crema (HEADER_H=92 → zona crema 4-88, centro≈46, 46-28=18)
          SVGtoPDF(doc, svg, MARGIN, 18, { height: 56 });
        }

        // Texto área — derecha
        doc.fillColor(C.primary).fontSize(15).font("Helvetica-Bold")
           .text(areaLabel, 0, 22, { align: "right", width: PW - MARGIN });
        doc.fillColor(C.muted).fontSize(8).font("Helvetica")
           .text(`DEPARTAMENTO: ${minuta.departamento ?? "—"}`, 0, 46, { align: "right", width: PW - MARGIN });
        doc.fillColor(C.brown).fontSize(8).font("Helvetica")
           .text(`Fecha: ${fechaStr}`, 0, 62, { align: "right", width: PW - MARGIN });

        // ⚠️  Resetear cursor al inicio del área de contenido
        //     Después de .text() con coordenadas absolutas, PDFKit queda en esa y.
        //     Forzamos la posición correcta aquí.
        doc.x = MARGIN;
        doc.y = HEADER_H + 18;
      };

      drawHeader();

      // ── Introducción ────────────────────────────────────────────────────────
      doc.fillColor(C.primary).fontSize(13).font("Helvetica-Bold")
         .text("Resumen de Seguimiento", MARGIN, doc.y, { width: CW });

      doc.moveDown(0.7);

      // Sin "continued: true" — más estable en PDFKit
      doc.fillColor(C.muted).fontSize(10).font("Helvetica")
         .text(
           `Puntos y acuerdos asignados al área de ${areaLabel} derivados de la ` +
           `minuta "${minuta.titulo}" levada acabo el ${fechaStr}.`,
           MARGIN, doc.y, { width: CW, align: "justify" }
         );

      doc.moveDown(1.4);
      doc.moveTo(MARGIN, doc.y).lineTo(PW - MARGIN, doc.y)
         .lineWidth(0.8).strokeColor(C.rule).stroke();
      doc.moveDown(1.4);

      // ── Loop de tareas (async por descarga de imágenes) ─────────────────────
      const processTasks = async () => {
        for (const [idx, tarea] of tareas.entries()) {

          // Salto de página si no queda espacio para al menos el encabezado + descripción
          if (doc.y > MAX_Y - 120) {
            doc.addPage();
            doc.x = MARGIN;
            doc.y = MARGIN;
          }

          const NUM    = String(idx + 1).padStart(2, "0");
          const blockY = doc.y;

          // ── Encabezado del punto ──────────────────────────────────────────
          doc.rect(MARGIN,     blockY, 4,      26).fill(C.gold);   // barra dorada
          doc.rect(MARGIN + 4, blockY, CW - 4, 26).fill(C.cream);  // fondo crema

          // Texto dentro del encabezado — coordenada absoluta para no desplazar cursor
          doc.fillColor(C.primary).fontSize(10).font("Helvetica-Bold")
             .text(`PUNTO #${NUM}`, MARGIN + 14, blockY + 8, { width: CW - 30 });

          // Avanzar cursor manualmente debajo del bloque
          doc.x = MARGIN;
          doc.y = blockY + 34;

          // ── Metadatos (dos columnas) ──────────────────────────────────────
          const metaY = doc.y;
          const halfW = CW / 2 - 8;

          doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
             .text("CLASIFICACIÓN", MARGIN, metaY, { width: halfW });
          doc.fillColor(C.primary).fontSize(10).font("Helvetica")
             .text(tarea.clasificacion ?? "General", MARGIN, metaY + 11, { width: halfW });

          doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
             .text("LÍNEA", MARGIN + CW / 2, metaY, { width: halfW });
          doc.fillColor(C.primary).fontSize(10).font("Helvetica")
             .text(tarea.linea ?? "N/A", MARGIN + CW / 2, metaY + 11, { width: halfW });

          doc.x = MARGIN;
          doc.y = metaY + 32;

          // ── Descripción ───────────────────────────────────────────────────
          doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
             .text("ACUERDO / DESCRIPCIÓN", MARGIN, doc.y, { width: CW });
          doc.moveDown(0.5);
          doc.fillColor(C.primary).fontSize(10).font("Helvetica")
             .text(tarea.descripcion, MARGIN, doc.y, { width: CW, align: "justify" });
          doc.moveDown(1.4);

          // ── Imágenes ──────────────────────────────────────────────────────
          if (tarea.imagenes.length > 0) {
            doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
               .text("EVIDENCIA VISUAL", MARGIN, doc.y, { width: CW });
            doc.moveDown(0.8);

            let imgX    = MARGIN;
            let imgRowY = doc.y;

            for (const img of tarea.imagenes) {
              try {
                // ¿La imagen no cabe horizontalmente? → nueva fila
                if (imgX + IMG_W > PW - MARGIN) {
                  imgRowY += IMG_H + IMG_GAP;
                  imgX     = MARGIN;
                }

                // ¿La fila no cabe en la página? → nueva página
                if (imgRowY + IMG_H > MAX_Y) {
                  doc.addPage();
                  doc.x   = MARGIN;
                  imgRowY = MARGIN;
                  imgX    = MARGIN;
                }

                const res2     = await axios.get(img.url, { responseType: "arraybuffer" });
                const imgBuf   = Buffer.from(res2.data as ArrayBuffer);

                // Marco sutil
                doc.rect(imgX, imgRowY, IMG_W, IMG_H)
                   .lineWidth(0.5).strokeColor(C.rule).stroke();

                // Imagen escalada para caber SIEMPRE dentro del marco
                // fit: [w, h] garantiza que la imagen escala preservando aspecto
                doc.image(imgBuf, imgX + 2, imgRowY + 2, {
                  fit:    [IMG_W - 4, IMG_H - 4],
                  align:  "center",
                  valign: "center",
                });

                imgX += IMG_W + IMG_GAP;

              } catch {
                // Imagen no disponible — se omite
              }
            }

            // Avanzar cursor manualmente al terminar las imágenes
            doc.x = MARGIN;
            doc.y = imgRowY + IMG_H + 20;
          }

          // ── Separador entre tareas ─────────────────────────────────────────
          doc.moveDown(1);
          doc.moveTo(MARGIN, doc.y).lineTo(PW - MARGIN, doc.y)
             .lineWidth(0.5).strokeColor(C.rule).stroke();
          doc.moveDown(1.8);
        }
        doc.flushPages();
        doc.end();
      };

      processTasks().catch(reject);
    });

    return res.json({ status: "success", data: { pdfUrl } });

  } catch (error) {
    await registrarError("GENERAR_PDF_AREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al generar PDF por Área" });
  }
};