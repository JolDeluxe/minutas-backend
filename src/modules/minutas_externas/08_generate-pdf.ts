import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
// @ts-ignore
import SVGtoPDF from "svg-to-pdfkit";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import path from "path";
import fs from "fs";
import { uploadPdfDocument } from "../../utils/cloudinary";
import { PassThrough } from "stream";
import axios from "axios";

const fmt = (date: Date | string | null | undefined): string => {
  if (!date) return "N/A";
  const d = new Date(date as string);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
};

const C = {
  headerBg: "#FAF5EF",
  topBar:   "#2E1208",
  goldBar:  "#C49A3C",
  primary:  "#2E1208",
  brown:    "#7B3D1E",
  gold:     "#C49A3C",
  cream:    "#F3EDE4",
  rule:     "#D4B896",
  muted:    "#9A6A4A",
  white:    "#FFFFFF",
} as const;

const generatePdfExternaDocument = async (
  minuta: any,
  writeStream: NodeJS.WritableStream
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const MARGIN   = 50;
    const HEADER_H = 110;
    const FOOTER_R = 52;

    const doc = new PDFDocument({
      margin:        MARGIN,
      size:          "LETTER",
      autoFirstPage: true,
      bufferPages:   true,
    });

    doc.pipe(writeStream);

    doc.on("end", () => resolve());
    doc.on("error", reject);

    const PW      = doc.page.width;
    const PH      = doc.page.height;
    const CW      = PW - MARGIN * 2;
    const MAX_Y   = PH - FOOTER_R - 10;

    const IMG_GAP = 12;
    const IMG_W   = Math.floor((CW - IMG_GAP) / 2);
    const IMG_H   = Math.round(IMG_W * 0.75);

    const fechaStr  = fmt(minuta.fechaProgramada ?? minuta.createdAt);

    const drawHeader = () => {
      doc.rect(0, 0, PW, 6).fill(C.topBar);
      doc.rect(0, 6, PW, HEADER_H - 12).fill(C.headerBg);
      doc.rect(0, HEADER_H - 6, PW, 6).fill(C.goldBar);

      // Logo centrado
      const logoPath = path.join(process.cwd(), "public", "img", "Grupo_Cuadra.svg");
      if (fs.existsSync(logoPath)) {
        const svg = fs.readFileSync(logoPath, "utf-8");
        const logoW = 200;
        const logoX = (PW - logoW) / 2;
        SVGtoPDF(doc, svg, logoX, 25, { width: logoW, height: 60, preserveAspectRatio: "xMidYMid meet" });
      }

      doc.x = MARGIN;
      doc.y = HEADER_H + 30;
    };

    drawHeader();

    // Título Central Ejecutiva
    doc.fillColor(C.primary).fontSize(20).font("Helvetica-Bold")
       .text(minuta.tema || minuta.objetivo || "Minuta de Junta Externa", { align: "center", width: CW });
    
    doc.moveDown(0.5);
    doc.fillColor(C.muted).fontSize(10).font("Helvetica")
       .text(`Derivado de la junta convocada para el día ${fechaStr}.`, { align: "center", width: CW });
    
    doc.moveDown(1.5);

    // Dibuja Bloques de Información Fluidos
    const drawBlock = (title: string, content: string) => {
      if (!content) return;
      
      if (doc.y > MAX_Y - 60) {
        doc.addPage();
        drawHeader();
      }
      
      doc.fillColor(C.gold).fontSize(11).font("Helvetica-Bold")
         .text(title.toUpperCase(), MARGIN, doc.y, { width: CW });
      doc.moveDown(0.4);
      doc.fillColor(C.primary).fontSize(11).font("Helvetica")
         .text(content, { width: CW, align: "justify", lineGap: 3 });
      doc.moveDown(1.5);
    };

    drawBlock("Objetivo de la Sesión", minuta.objetivo);
    
    // Convertir participantes JSON a texto si es array
    let partTxt = minuta.participantes || minuta.integrantes || minuta.asistentes;
    if (typeof partTxt === "string" && partTxt.startsWith("[")) {
      try {
        const arr = JSON.parse(partTxt);
        partTxt = arr.join("\n• ");
        if (arr.length > 0) partTxt = `• ${partTxt}`;
      } catch (e) {}
    }
    
    drawBlock("Participantes Requeridos", partTxt);

    // Pie de Información Estructural
    if (doc.y > MAX_Y - 80) {
      doc.addPage();
      drawHeader();
    }

    doc.moveTo(MARGIN, doc.y).lineTo(PW - MARGIN, doc.y)
       .lineWidth(0.8).strokeColor(C.rule).stroke();
    doc.moveDown(1.2);

    const blockWidth = CW / 2;
    const startY = doc.y;
    
    doc.fillColor(C.muted).fontSize(8).font("Helvetica-Bold")
       .text("ÁREA CONVOCADA", MARGIN, startY, { width: blockWidth, align: "left" });
       
    doc.fillColor(C.muted).fontSize(8).font("Helvetica-Bold")
       .text("DEPARTAMENTO O LÍNEA", MARGIN + blockWidth, startY, { width: blockWidth, align: "left" });
       
    const valueY = startY + 12;
    
    doc.fillColor(C.primary).fontSize(10).font("Helvetica")
       .text(minuta.area || "N/A", MARGIN, valueY, { width: blockWidth, align: "left" });
       
    doc.fillColor(C.primary).fontSize(10).font("Helvetica")
       .text(minuta.departamento || "N/A", MARGIN + blockWidth, valueY, { width: blockWidth, align: "left" });

    doc.x = MARGIN;
    doc.y = valueY + 25;

    // ── Loop de tareas (async por descarga de imágenes) ─────────────────────
    const processTasks = async () => {
      const tareas = minuta.tareas || [];
      if (tareas.length > 0) {
        doc.moveDown(1);
        doc.moveTo(MARGIN, doc.y).lineTo(PW - MARGIN, doc.y)
           .lineWidth(0.8).strokeColor(C.rule).stroke();
        doc.moveDown(1.5);

        doc.fillColor(C.primary).fontSize(13).font("Helvetica-Bold")
           .text("Tareas y Acuerdos Registrados", MARGIN, doc.y, { width: CW });
        doc.moveDown(1);

        for (const [idx, tarea] of tareas.entries()) {
          // Salto de página si no queda espacio
          if (doc.y > MAX_Y - 120) {
            doc.addPage();
            drawHeader();
          }

          const NUM    = String(idx + 1).padStart(2, "0");
          const blockY = doc.y;

          // ── Encabezado del punto ──────────────────────────────────────────
          doc.rect(MARGIN,     blockY, 4,      26).fill(C.gold);   // barra dorada
          doc.rect(MARGIN + 4, blockY, CW - 4, 26).fill(C.cream);  // fondo crema

          doc.fillColor(C.primary).fontSize(10).font("Helvetica-Bold")
             .text(`PUNTO #${NUM}`, MARGIN + 14, blockY + 8, { width: CW - 30 });

          doc.x = MARGIN;
          doc.y = blockY + 34;

          // ── Metadatos (dos columnas) ──────────────────────────────────────
          const metaY = doc.y;
          const halfW = CW / 2 - 8;

          doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
             .text("ÁREA DESTINO", MARGIN, metaY, { width: halfW });
          doc.fillColor(C.primary).fontSize(10).font("Helvetica")
             .text(tarea.area || "N/A", MARGIN, metaY + 11, { width: halfW });

          doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
             .text("LÍNEA / DEPARTAMENTO", MARGIN + CW / 2, metaY, { width: halfW });
          doc.fillColor(C.primary).fontSize(10).font("Helvetica")
             .text(tarea.departamento ?? "N/A", MARGIN + CW / 2, metaY + 11, { width: halfW });

          doc.x = MARGIN;
          doc.y = metaY + 32;

          // ── Descripción ───────────────────────────────────────────────────
          doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
             .text("ACUERDO / DESCRIPCIÓN", MARGIN, doc.y, { width: CW });
          doc.moveDown(0.5);
          doc.fillColor(C.primary).fontSize(10).font("Helvetica")
             .text(tarea.descripcion, MARGIN, doc.y, { width: CW, align: "justify" });
          doc.moveDown(1.2);

          // ── Fecha Vencimiento y Estado ────────────────────────────────────
          const vencStr = fmt(tarea.fechaVencimiento);
          const estadoStr = tarea.estado === 'CERRADA' ? 'COMPLETADA' : 'PENDIENTE';
          
          if (doc.y > MAX_Y - 20) {
            doc.addPage();
            drawHeader();
          }
          doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
             .text(`FECHA VENCIMIENTO: ${vencStr.toUpperCase()}    |    ESTADO: ${estadoStr}`, MARGIN, doc.y, { width: CW });
          doc.moveDown(1.2);

          // ── Notas (si existen) ─────────────────────────────────────────────
          const notas = tarea.notas || [];
          if (notas.length > 0) {
            if (doc.y > MAX_Y - 30) {
              doc.addPage();
              drawHeader();
            }
            doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
               .text("NOTAS DE SEGUIMIENTO", MARGIN, doc.y, { width: CW });
            doc.moveDown(0.5);
            for (const nota of notas) {
              if (doc.y > MAX_Y - 20) {
                doc.addPage();
                drawHeader();
              }
              doc.fillColor(C.primary).fontSize(9).font("Helvetica")
                 .text(`• ${nota.contenido} (${fmt(nota.createdAt)})`, { width: CW - 10, align: "left", lineGap: 2 });
            }
            doc.moveDown(1.2);
          }

          // ── Imágenes ──────────────────────────────────────────────────────
          const imagenes = tarea.imagenes || [];
          if (imagenes.length > 0) {
            if (doc.y > MAX_Y - 40) {
              doc.addPage();
              drawHeader();
            }
            doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
               .text("EVIDENCIA VISUAL", MARGIN, doc.y, { width: CW });
            doc.moveDown(0.8);

            let imgX    = MARGIN;
            let imgRowY = doc.y;

            for (const img of imagenes) {
              try {
                if (imgX + IMG_W > PW - MARGIN) {
                  imgRowY += IMG_H + IMG_GAP;
                  imgX     = MARGIN;
                }

                if (imgRowY + IMG_H > MAX_Y) {
                  doc.addPage();
                  drawHeader();
                  imgRowY = doc.y;
                  imgX    = MARGIN;
                }

                const res2     = await axios.get(img.url, { responseType: "arraybuffer" });
                const imgBuf   = Buffer.from(res2.data as ArrayBuffer);

                doc.rect(imgX, imgRowY, IMG_W, IMG_H)
                   .lineWidth(0.5).strokeColor(C.rule).stroke();

                doc.image(imgBuf, imgX + 2, imgRowY + 2, {
                  fit:    [IMG_W - 4, IMG_H - 4],
                  align:  "center",
                  valign: "center",
                });

                imgX += IMG_W + IMG_GAP;

              } catch (e) {
                console.error("Error cargando imagen en PDF:", e);
              }
            }

            doc.x = MARGIN;
            doc.y = imgRowY + IMG_H + 20;
          }

          // ── Separador entre tareas ─────────────────────────────────────────
          doc.moveDown(1);
          doc.moveTo(MARGIN, doc.y).lineTo(PW - MARGIN, doc.y)
             .lineWidth(0.5).strokeColor(C.rule).stroke();
          doc.moveDown(1.8);
        }
      }

      // Numeración de páginas al final
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor(C.muted).fontSize(8).font("Helvetica")
           .text(
             `Página ${i + 1} de ${pages.count}`,
             MARGIN,
             PH - 35,
             { align: "center", width: CW }
           );
      }

      doc.flushPages();
      doc.end();
    };

    processTasks().catch(reject);
  });
};

export const generarPdfMinutaExterna = async (req: Request, res: Response) => {
  try {
    const minutaId = Number(req.params.id);

    if (isNaN(minutaId))
      return res.status(400).json({ error: "ID inválido" });

    const minuta = await prisma.minutaExterna.findUnique({
      where: { id: minutaId },
      include: {
        tareas: {
          where: { estado: { notIn: ["DESCARTADA", "CANCELADA"] } },
          orderBy: { createdAt: "asc" },
          include: {
            notas: { orderBy: { createdAt: "desc" } },
            imagenes: { orderBy: { orden: "asc" } },
          },
        },
      },
    });

    if (!minuta)
      return res.status(404).json({ error: "Minuta Externa no encontrada" });

    const ds  = fmt(minuta.fechaProgramada ?? minuta.createdAt).replace(/\//g, "-");
    const filename = `Aviso_Junta_${minutaId}_${ds}_${Date.now()}`;

    console.log(`[Generar PDF] Subiendo a Cloudinary: ${filename}...`);
    
    const passThrough = new PassThrough();
    const buffers: Buffer[] = [];
    passThrough.on("data", (chunk) => buffers.push(chunk));
    
    const pdfPromise = new Promise<string>((resolve, reject) => {
      passThrough.on("end", async () => {
        const pdfBuffer = Buffer.concat(buffers);
        try {
          const url = await uploadPdfDocument(pdfBuffer, filename);
          resolve(url);
        } catch (error) {
          reject(error);
        }
      });
      passThrough.on("error", reject);
    });

    generatePdfExternaDocument(minuta, passThrough).catch(err => {
      passThrough.emit("error", err);
    });

    const pdfUrl = await pdfPromise;

    console.log(`[Generar PDF] Generado con éxito: ${pdfUrl}`);
    return res.json({ status: "success", data: { pdfUrl } });

  } catch (error) {
    await registrarError("GENERAR_PDF_MINUTA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al generar PDF en Cloudinary" });
  }
};