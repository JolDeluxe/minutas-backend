import type {
  Request,
  Response,
} from "express";

import PDFDocument from "pdfkit";

import { prisma } from "../../db";

import {
  registrarError,
} from "../../utils/logger";

import {
  uploadPdfDocument,
} from "../../utils/cloudinary";

import type {
  TareaIdParams,
} from "./zod";

export const generarPdfTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } =
      req.params as unknown as TareaIdParams;

    const tarea =
      await prisma.tarea.findUnique({
        where: { id },

        include: {
          creadoPor: {
            select: {
              nombre: true,
            },
          },

          minuta: {
            select: {
              titulo: true,
            },
          },

          asignaciones: {
            include: {
              usuario: {
                select: {
                  nombre: true,
                },
              },
            },
          },
        },
      });

    if (!tarea) {
      return res.status(404).json({
        error: "Entrada no encontrada",
      });
    }

    const pdfUrl =
      await new Promise<string>(
        (resolve, reject) => {
          const doc =
            new PDFDocument({
              margin: 50,
            });

          const buffers: Buffer[] = [];

          doc.on(
            "data",
            buffers.push.bind(buffers)
          );

          doc.on(
            "end",
            async () => {
              const pdfBuffer =
                Buffer.concat(buffers);

              try {
                const filename =
                  `Entrada_${tarea.id}`;

                const url =
                  await uploadPdfDocument(
                    pdfBuffer,
                    filename
                  );

                resolve(url);
              } catch (error) {
                reject(error);
              }
            }
          );

          doc
            .fontSize(22)
            .font("Helvetica-Bold")
            .text(
              "Entrada Organizacional",
              {
                align: "center",
              }
            );

          doc.moveDown(1);

          doc
            .fontSize(12)
            .font("Helvetica");

          doc.text(`ID: #${tarea.id}`);

          doc.text(
            `Clasificación: ${
              tarea.clasificacion ??
              "No especificada"
            }`
          );

          doc.text(
            `Área: ${tarea.area}`
          );

          doc.text(
            `Línea: ${
              tarea.linea ??
              "No especificada"
            }`
          );

          doc.text(
            `Tipo: ${tarea.tipo}`
          );

          doc.text(
            `Estado: ${
              tarea.estado ??
              "No aplica"
            }`
          );

          doc.text(
            `Prioridad: ${
              tarea.prioridad ??
              "No especificada"
            }`
          );

          if (tarea.minuta) {
            doc.text(
              `Minuta: ${tarea.minuta.titulo}`
            );
          }

          doc.moveDown(1);

          doc
            .font("Helvetica-Bold")
            .text("Descripción:");

          doc.moveDown(0.5);

          doc
            .font("Helvetica")
            .text(
              tarea.descripcion,
              {
                align: "justify",
              }
            );

          if (
            tarea.asignaciones.length > 0
          ) {
            doc.moveDown(1);

            doc
              .font("Helvetica-Bold")
              .text("Responsables:");

            doc.moveDown(0.5);

            tarea.asignaciones.forEach(
              (asig) => {
                doc
                  .font("Helvetica")
                  .text(
                    `• ${asig.usuario.nombre}`
                  );
              }
            );
          }

          doc.end();
        }
      );

    await prisma.tarea.update({
      where: { id },

      data: {
        pdfUrl,
      },
    });

    return res.json({
      status: "success",

      data: {
        pdfUrl,
      },
    });
  } catch (error) {
    await registrarError(
      "GENERAR_PDF_TAREA",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error:
        "Error al generar PDF",
    });
  }
};