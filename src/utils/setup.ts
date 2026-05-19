import { prisma } from "../db";
import { Rol } from "@prisma/client";
import bcrypt from "bcryptjs";
import { env } from "../env";

export const inicializarSistema = async () => {
  console.log("⚙️  Verificando integridad del sistema TRACE...");

  try {
    const hashedPassword = await bcrypt.hash(env.SYS_ADMIN_PASS, 10);

    const admin = await prisma.usuario.upsert({
      where: { username: env.SYS_ADMIN_USER },
      update: {
        rol: Rol.ADMIN,
        departamento: null,
        password: hashedPassword,
      },
      create: {
        nombre: "Administrador del Sistema",
        username: env.SYS_ADMIN_USER,
        email: null,
        password: hashedPassword,
        rol: Rol.ADMIN,
        departamento: null,
      },
    });

    console.log(`✅ Admin verificado: ${admin.username} (ID: ${admin.id})`);
  } catch (error) {
    console.error("🔥 ERROR CRÍTICO al inicializar TRACE:", error);
    process.exit(1);
  }
};