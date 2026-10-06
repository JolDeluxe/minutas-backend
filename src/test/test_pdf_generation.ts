import { prisma } from "../db";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
// @ts-ignore
import SVGtoPDF from "svg-to-pdfkit";
import axios from "axios";

async function testPdfGeneration() {
  console.log("=== INICIANDO PRUEBAS DE GENERACIÓN DE PDF ===");

  // 1. Verificar existencia y carga del logo SVG
  const logoPath = path.join(process.cwd(), "public", "img", "Grupo_Cuadra.svg");
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Logotipo no encontrado en: ${logoPath}`);
  }
  const logoSvg = fs.readFileSync(logoPath, "utf-8");
  console.log(`✓ Logotipo SVG encontrado y cargado (${logoSvg.length} bytes)`);

  // 2. Probar renderizado básico en PDFKit con SVGtoPDF
  const testDoc = new PDFDocument({ margin: 50, size: "LETTER" });
  const chunks: Buffer[] = [];
  testDoc.on("data", (chunk) => chunks.push(chunk));

  let pdfRenderSuccess = false;
  await new Promise<void>((resolve, reject) => {
    testDoc.on("end", () => {
      pdfRenderSuccess = true;
      resolve();
    });
    testDoc.on("error", reject);

    // Dibujar header con SVG
    testDoc.rect(0, 0, testDoc.page.width, 4).fill("#2E1208");
    SVGtoPDF(testDoc, logoSvg, testDoc.page.width - 50 - 181.58, 18, {
      width: 181.58,
      height: 56,
      preserveAspectRatio: "xMidYMid meet",
    });
    testDoc.fillColor("#2E1208").fontSize(16).text("TEST PDF GENERATION", 50, 22);

    testDoc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  console.log(`✓ PDF de prueba generado exitosamente (${pdfBuffer.length} bytes)`);

  // 3. Probar timeout con URL rota / inexistente
  console.log("  -> Probando timeout y tolerancia ante imágenes rotas/no disponibles...");
  let timeoutCaught = false;
  try {
    await axios.get("http://10.255.255.1/broken-image.jpg", {
      responseType: "arraybuffer",
      timeout: 1000,
    });
  } catch (err: any) {
    timeoutCaught = true;
  }
  if (!timeoutCaught) {
    throw new Error("El timeout de imagen no funcionó como se esperaba");
  }
  console.log("✓ Tolerancia y timeout de axios verificado (no se cuelga la petición).");

  console.log("=== PRUEBAS DE PDF COMPLETADAS SATISFACTORIAMENTE ===");
}

testPdfGeneration()
  .catch((e) => {
    console.error("ERROR EN PRUEBAS DE PDF:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
