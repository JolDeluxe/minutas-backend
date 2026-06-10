import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
// @ts-ignore
import SVGtoPDF from "svg-to-pdfkit";
import axios from "axios";
import path from "path";
import fs from "fs";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { uploadPdfDocument } from "../../utils/cloudinary";
import type { TareaIdParams } from "./zod";

// ─── Paleta Grupo Cuadra ──────────────────────────────────────────────────────
const C = {
  headerBg: "#FAF5EF",  // Crema cálido
  topBar:   "#2E1208",  // Café muy oscuro
  goldBar:  "#C49A3C",  // Dorado cálido
  primary:  "#2E1208",  // Café oscuro
  brown:    "#7B3D1E",  // Café cognac
  gold:     "#C49A3C",  // Dorado
  cream:    "#F3EDE4",  // Crema oscura
  rule:     "#D4B896",  // Beige
  muted:    "#9A6A4A",  // Café medio
  white:    "#FFFFFF",
} as const;

export const generarPdfTarea = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as TareaIdParams;

    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: {
        creadoPor: { select: { nombre: true } },
        minuta: { select: { titulo: true, fechaRealizada: true, fechaProgramada: true } },
        imagenes: true
      },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    const pdfUrl = await new Promise<string>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });
      const buffers: Buffer[] = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", async () => {
        const pdfBuffer = Buffer.concat(buffers);
        try {
          const filename = `Tarea_${tarea.id}_${Date.now()}`;
          const url = await uploadPdfDocument(pdfBuffer, filename);
          resolve(url);
        } catch (error) {
          reject(error);
        }
      });

      const generateContent = async () => {
        const PW = doc.page.width;
        const MARGIN = 50;
        const leftColX = MARGIN;
        const rightColX = PW / 2;

        // Franja superior café oscuro
        doc.rect(0, 0, PW, 4).fill(C.topBar);

        // Fondo crema del header
        doc.rect(0, 4, PW, 84).fill(C.headerBg);

        // Franja inferior dorada
        doc.rect(0, 88, PW, 4).fill(C.goldBar);

        // Logo — derecha
        const logoPath = path.join(process.cwd(), "public", "img", "Grupo_Cuadra.svg");
        if (fs.existsSync(logoPath)) {
          const svg = fs.readFileSync(logoPath, "utf-8");
          const logoX = PW - MARGIN - 181.58; 
          SVGtoPDF(doc, svg, logoX, 18, { width: 181.58, height: 56, preserveAspectRatio: "xMidYMid meet" });
        }

        // Texto header — izquierda
        doc.fillColor(C.primary).fontSize(16).font("Helvetica-Bold")
           .text("DETALLE DE TAREA", MARGIN, 22, { align: "left", width: PW - MARGIN - 200 });
        doc.fillColor(C.muted).fontSize(9).font("Helvetica")
           .text(`ID: #${String(tarea.id).padStart(4, '0')}`, MARGIN, 46, { align: "left", width: PW - MARGIN - 200 });
        
        const fecha = tarea.minuta?.fechaRealizada || tarea.minuta?.fechaProgramada || tarea.createdAt;
        const fechaStr = new Date(fecha).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.fillColor(C.brown).fontSize(9).font("Helvetica")
           .text(`Fecha: ${fechaStr}`, MARGIN, 62, { align: "left", width: PW - MARGIN - 200 });

        let currentY = 120;

        // ÁREA DESTINO
        doc.fillColor(C.gold)
           .fontSize(11)
           .font("Helvetica-Bold")
           .text("ÁREA DESTINO:", leftColX, currentY);
        
        doc.fillColor(C.primary)
           .fontSize(15)
           .font("Helvetica-Bold")
           .text(tarea.area || "No especificada", leftColX, currentY + 14);

        if (tarea.linea) {
          doc.fillColor(C.gold)
             .fontSize(11)
             .font("Helvetica-Bold")
             .text("LÍNEA:", rightColX, currentY);
          
          doc.fillColor(C.primary)
             .fontSize(15)
             .font("Helvetica-Bold")
             .text(tarea.linea || "No especificada", rightColX, currentY + 14);
        }

        currentY += 45;

        // Divider
        doc.moveTo(leftColX, currentY).lineTo(PW - MARGIN, currentY).lineWidth(1).strokeColor(C.rule).stroke();
        currentY += 15;

        // Descripción
        doc.fillColor(C.brown).fontSize(11).font("Helvetica-Bold").text("DESCRIPCIÓN:", leftColX, currentY);
        currentY += 18;

        const descHeight = doc.heightOfString(tarea.descripcion, {
          width: PW - 130,
          align: 'justify'
        });
        const rectHeight = Math.max(50, descHeight + 30);

        doc.rect(leftColX, currentY, PW - 100, rectHeight).fill(C.cream);
        doc.fillColor(C.primary)
           .fontSize(11)
           .font("Helvetica")
           .text(tarea.descripcion, leftColX + 15, currentY + 15, {
              width: PW - 130,
              align: 'justify'
           });

        currentY += rectHeight + 25;

        // Evidencia visual (Imágenes)
        if (tarea.imagenes && tarea.imagenes.length > 0) {
          if (currentY > doc.page.height - 120) {
            doc.addPage();
            currentY = 50;
          }

          doc.fillColor(C.brown).fontSize(11).font("Helvetica-Bold")
             .text("EVIDENCIA VISUAL / IMÁGENES:", leftColX, currentY);
          currentY += 18;

          let imgX = leftColX;
          let imgRowY = currentY;

          const IMG_GAP = 12;
          const CW = PW - 100;
          const IMG_W = Math.floor((CW - IMG_GAP) / 2);
          const IMG_H = Math.round(IMG_W * 0.75);
          const MAX_Y = doc.page.height - 70;

          for (const img of tarea.imagenes) {
            try {
              if (imgX + IMG_W > PW - 50) {
                imgRowY += IMG_H + IMG_GAP;
                imgX = leftColX;
              }

              if (imgRowY + IMG_H > MAX_Y) {
                doc.addPage();
                imgRowY = 50;
                imgX = leftColX;
              }

              const res2 = await axios.get(img.url, { responseType: "arraybuffer" });
              const imgBuf = Buffer.from(res2.data as ArrayBuffer);

              doc.rect(imgX, imgRowY, IMG_W, IMG_H)
                 .lineWidth(0.5).strokeColor(C.rule).stroke();

              doc.image(imgBuf, imgX + 2, imgRowY + 2, {
                fit: [IMG_W - 4, IMG_H - 4],
                align: "center",
                valign: "center",
              });

              imgX += IMG_W + IMG_GAP;
            } catch {
              // Ignorar si falla la descarga
            }
          }
        }

        // Pie de página en todas las páginas
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(8)
             .fillColor(C.muted)
             .text(
               `Página ${i + 1} de ${pages.count}  |  Sistema de Gestión Interna Grupo Cuadra`,
               50,
               doc.page.height - 40,
               { align: 'center', width: PW - 100 }
             );
        }

        doc.end();
      };

      generateContent().catch(reject);
    });

    await prisma.tarea.update({
      where: { id },
      data: { pdfUrl },
    });

    return res.json({
      status: "success",
      data: { pdfUrl },
    });
  } catch (error) {
    await registrarError("GENERAR_PDF_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al generar PDF" });
  }
};