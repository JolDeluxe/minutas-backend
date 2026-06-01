import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { uploadPdfDocument } from "../../utils/cloudinary";
import type { TareaIdParams } from "./zod";

export const generarPdfTarea = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as TareaIdParams;

    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: {
        creadoPor: { select: { nombre: true } },
        minuta: { select: { titulo: true, fechaRealizada: true, fechaProgramada: true } },
        asignaciones: { include: { usuario: { select: { nombre: true } } } },
        imagenes: true
      },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Entrada no encontrada" });
    }

    const pdfUrl = await new Promise<string>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const buffers: Buffer[] = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", async () => {
        const pdfBuffer = Buffer.concat(buffers);
        try {
          const filename = `Entrada_Externa_${tarea.id}`;
          const url = await uploadPdfDocument(pdfBuffer, filename);
          resolve(url);
        } catch (error) {
          reject(error);
        }
      });

      // Colors
      const primaryColor = '#1e293b'; // slate-800
      const secondaryColor = '#64748b'; // slate-500
      const accentColor = '#8b5cf6'; // purple-500 (good for external)
      const lightGray = '#f1f5f9';

      // Encabezado (Header)
      doc.rect(0, 0, doc.page.width, 100).fill(primaryColor);

      doc.fillColor('#ffffff')
         .fontSize(24)
         .font("Helvetica-Bold")
         .text("TAREA EXTERNA", 50, 30);
      
      doc.fontSize(12)
         .font("Helvetica")
         .text(`ID: #${String(tarea.id).padStart(4, '0')}`, 50, 60);

      const fecha = tarea.minuta?.fechaRealizada || tarea.minuta?.fechaProgramada || tarea.createdAt;
      const fechaStr = new Date(fecha).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
      
      doc.text(fechaStr, 0, 60, { align: 'right', width: doc.page.width - 50 });

      doc.moveDown(4);

      // ÁREA — protagonismo principal
      doc.fillColor(accentColor)
         .fontSize(16)
         .font("Helvetica-Bold")
         .text("ÁREA:", 50, 130);
      
      doc.fillColor(primaryColor)
         .fontSize(22)
         .font("Helvetica-Bold")
         .text(tarea.linea || "No especificada", 50, 150);

      // Divider
      doc.moveTo(50, 185).lineTo(doc.page.width - 50, 185).lineWidth(2).strokeColor(lightGray).stroke();

      // Details Section
      let currentY = 205;
      const leftColX = 50;
      const rightColX = doc.page.width / 2;

      // Dirección — ahora en la sección de detalles
      doc.fillColor(secondaryColor).fontSize(10).font("Helvetica-Bold").text("DIRECCIÓN", leftColX, currentY);
      doc.fillColor(primaryColor).fontSize(12).font("Helvetica").text(tarea.area || "No especificada", leftColX, currentY + 15);

      doc.fillColor(secondaryColor).fontSize(10).font("Helvetica-Bold").text("CLASIFICACIÓN", rightColX, currentY);
      doc.fillColor(primaryColor).fontSize(12).font("Helvetica").text(tarea.clasificacion || "No especificada", rightColX, currentY + 15);

      currentY += 45;
      
      if (tarea.minuta) {
        doc.fillColor(secondaryColor).fontSize(10).font("Helvetica-Bold").text("MINUTA DE ORIGEN", leftColX, currentY);
        doc.fillColor(primaryColor).fontSize(12).font("Helvetica").text(tarea.minuta.titulo, leftColX, currentY + 15);
        currentY += 45;
      }

      doc.fillColor(secondaryColor).fontSize(10).font("Helvetica-Bold").text("CREADO POR", leftColX, currentY);
      doc.fillColor(primaryColor).fontSize(12).font("Helvetica").text(tarea.creadoPor.nombre, leftColX, currentY + 15);
      
      currentY += 45;

      // Divider
      doc.moveTo(50, currentY).lineTo(doc.page.width - 50, currentY).lineWidth(2).strokeColor(lightGray).stroke();
      currentY += 20;

      // Description
      doc.fillColor(secondaryColor).fontSize(12).font("Helvetica-Bold").text("DESCRIPCIÓN:", leftColX, currentY);
      currentY += 20;

      doc.rect(leftColX, currentY, doc.page.width - 100, 150).fill(lightGray);
      doc.fillColor(primaryColor)
         .fontSize(12)
         .font("Helvetica")
         .text(tarea.descripcion, leftColX + 15, currentY + 15, {
            width: doc.page.width - 130,
            align: 'justify'
         });

      // Footer
      doc.fontSize(10)
         .fillColor(secondaryColor)
         .text("Generado automáticamente por el Sistema de Minutas", 50, doc.page.height - 50, { align: 'center' });

      doc.end();
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