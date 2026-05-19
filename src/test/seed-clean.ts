import { PrismaClient, Rol, Departamento } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando purga y seeding de usuarios...");

  // 1. Eliminar datos operativos y relaciones para evitar violaciones de clave foránea
  console.log("Limpiando datos operativos...");
  await prisma.tareaHistorial.deleteMany({});
  await prisma.tareaAsignacion.deleteMany({});
  await prisma.tareaImagen.deleteMany({});
  await prisma.tareaNota.deleteMany({});
  await prisma.notificacion.deleteMany({});
  await prisma.bitacora.deleteMany({});
  await prisma.pushSubscription.deleteMany({});
  await prisma.notaGeneral.deleteMany({});
  await prisma.tarea.deleteMany({});
  await prisma.minuta.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.usuario.deleteMany({});
  console.log("Todos los datos anteriores han sido eliminados de la base de datos.");

  const defaultPassword = "123456";
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  // 2. Crear ADMIN Global (1 de cada rol en total)
  const admin = await prisma.usuario.create({
    data: {
      nombre: "Administrador Global",
      username: "admin",
      email: "admin@cuadra.com.mx",
      password: hashedPassword,
      rol: Rol.ADMIN,
      departamento: null,
      linea: null,
      estado: "ACTIVO"
    }
  });
  console.log("Creado usuario ADMIN:", admin.username);

  // 3. Crear usuarios de DISEÑO
  const gerenciaDiseno = await prisma.usuario.create({
    data: {
      nombre: "Gerente de Diseño",
      username: "gerente.diseno",
      email: "gerente.diseno@cuadra.com.mx",
      password: hashedPassword,
      rol: Rol.GERENCIA,
      departamento: Departamento.DISENO,
      linea: null,
      estado: "ACTIVO"
    }
  });
  console.log("Creado usuario GERENCIA (Diseño):", gerenciaDiseno.username);

  const jefeDiseno = await prisma.usuario.create({
    data: {
      nombre: "Jefe de Botas",
      username: "jefe.diseno",
      email: "jefe.diseno@cuadra.com.mx",
      password: hashedPassword,
      rol: Rol.JEFE,
      departamento: Departamento.DISENO,
      linea: "BOTA",
      estado: "ACTIVO"
    }
  });
  console.log("Creado usuario JEFE (Diseño - BOTA):", jefeDiseno.username);

  const coordDiseno = await prisma.usuario.create({
    data: {
      nombre: "Coordinador de Calzado",
      username: "coord.diseno",
      email: "coord.diseno@cuadra.com.mx",
      password: hashedPassword,
      rol: Rol.COORDINADOR,
      departamento: Departamento.DISENO,
      linea: "CALZADO",
      estado: "ACTIVO"
    }
  });
  console.log("Creado usuario COORDINADOR (Diseño - CALZADO):", coordDiseno.username);

  // 4. Crear usuarios de MARKETING
  const gerenciaMkt = await prisma.usuario.create({
    data: {
      nombre: "Gerente de Marketing",
      username: "gerente.marketing",
      email: "gerente.marketing@cuadra.com.mx",
      password: hashedPassword,
      rol: Rol.GERENCIA,
      departamento: Departamento.MARKETING,
      linea: null,
      estado: "ACTIVO"
    }
  });
  console.log("Creado usuario GERENCIA (Marketing):", gerenciaMkt.username);

  const jefeMkt = await prisma.usuario.create({
    data: {
      nombre: "Jefe de Ropa Mkt",
      username: "jefe.marketing",
      email: "jefe.marketing@cuadra.com.mx",
      password: hashedPassword,
      rol: Rol.JEFE,
      departamento: Departamento.MARKETING,
      linea: "ROPA",
      estado: "ACTIVO"
    }
  });
  console.log("Creado usuario JEFE (Marketing - ROPA):", jefeMkt.username);

  const coordMkt = await prisma.usuario.create({
    data: {
      nombre: "Coordinador General Mkt",
      username: "coord.marketing",
      email: "coord.marketing@cuadra.com.mx",
      password: hashedPassword,
      rol: Rol.COORDINADOR,
      departamento: Departamento.MARKETING,
      linea: null,
      estado: "ACTIVO"
    }
  });
  console.log("Creado usuario COORDINADOR (Marketing):", coordMkt.username);

  console.log("\n¡Seeding completado!");
  console.log("Todos los usuarios tienen la contraseña por defecto:", defaultPassword);
}

main()
  .catch((e) => {
    console.error("Error al ejecutar seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
