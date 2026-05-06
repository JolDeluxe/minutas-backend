import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { registrarError } from "../../utils/logger";

export const generarPDFTareaExterna = async (tarea: any): Promise<void> => {
  try {
    const doc = new PDFDocument({ margin: 50 });
    const dirPath = path.join(__dirname, "../../../uploads/pdfs");
    
    // Crear directorio si no existe
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const filePath = path.join(dirPath, `Tarea_${tarea.id}_Externa.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Cabecera
    doc.fontSize(20).text(`Tarea Externa #${tarea.id}`, { align: "center" });
    doc.moveDown();
    
    // Metadatos
    doc.fontSize(12).text(`Área Destino: ${tarea.area}`);
    doc.text(`Prioridad: ${tarea.prioridad || "N/A"}`);
    doc.text(`Fecha de Vencimiento: ${tarea.fechaVencimiento ? new Date(tarea.fechaVencimiento).toLocaleDateString() : "No definida"}`);
    doc.moveDown();

    // Descripción
    doc.fontSize(14).text("Descripción de la Tarea:", { underline: true });
    doc.fontSize(12).text(tarea.descripcion);
    doc.moveDown();

    // Nota de sistema
    doc.fontSize(10).fillColor("gray")
       .text("Este documento fue generado automáticamente por el Sistema de Minutas.", { align: "center" });

    doc.end();
  } catch (error) {
    await registrarError("GENERACION_PDF", null, error);
    console.error("Error al generar PDF de tarea externa:", error);
  }
};