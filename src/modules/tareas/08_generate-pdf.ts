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
        minuta: { select: { titulo: true } }
      }
    });

    if (!tarea) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    // Promesa para generar el PDF en memoria y subirlo
    const pdfUrl = await new Promise<string>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", async () => {
        const pdfBuffer = Buffer.concat(buffers);
        try {
          const filename = `Requerimiento_Tarea_${tarea.id}`;
          const url = await uploadPdfDocument(pdfBuffer, filename);
          resolve(url);
        } catch (error) {
          reject(error);
        }
      });

      // --- DISEÑO DEL PDF ---
      
      // Cabecera formal
      doc.fontSize(22).font('Helvetica-Bold').text("Requerimiento de Tarea", { align: "center" });
      doc.moveDown(0.5);
      
      // La solicitud del dueño (Bien claro)
      doc.rect(50, doc.y, 500, 30).fillAndStroke("#f3f4f6", "#d1d5db");
      doc.fillColor("black").fontSize(12).font('Helvetica-Bold')
         .text("SOLICITADO POR: SR. FRANCISCO CUADRA", 50, doc.y - 20, { align: "center" });
      
      doc.moveDown(2);

      // Metadatos de la Tarea
      doc.font('Helvetica-Bold').fontSize(14).text("Detalles de la Solicitud");
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(12);
      doc.text(`ID de Tarea: #${tarea.id}`);
      doc.text(`Área Asignada: ${tarea.area}`);
      doc.text(`Prioridad: ${tarea.prioridad || "No especificada"}`);
      doc.text(`Fecha de Vencimiento: ${tarea.fechaVencimiento ? new Date(tarea.fechaVencimiento).toLocaleDateString() : "No especificada"}`);
      
      if (tarea.minuta) {
        doc.text(`Origen (Minuta): ${tarea.minuta.titulo}`);
      }
      
      doc.moveDown(1.5);

      // Descripción clara
      doc.font('Helvetica-Bold').fontSize(14).text("Instrucciones / Descripción:");
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(12).text(tarea.descripcion, { align: "justify" });
      
      doc.moveDown(3);

      // Pie de página
      doc.fontSize(10).fillColor("gray")
         .text("Este documento es de uso oficial para dar seguimiento a los acuerdos establecidos en junta.", { align: "center" });

      doc.end();
    });

    // Opcional: Guardar la URL en la base de datos si creaste el campo pdfUrl
    // await prisma.tarea.update({ where: { id }, data: { pdfUrl } });

    return res.json({ 
      status: "success", 
      message: "PDF generado correctamente",
      data: { pdfUrl } 
    });

  } catch (error) {
    await registrarError("GENERACION_PDF_MANUAL", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al generar el documento PDF" });
  }
};