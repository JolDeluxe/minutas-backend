// minutas-backend/src/test/user-test.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  Rol,
  Area,
  Linea,
} from "@prisma/client";

const prisma = new PrismaClient();

const PASSWORD =
  "123456";

const HASH_ROUNDS = 10;

const luchadores = [
  {
    nombre: "John Cena",
    username: "john.cena",
    email: "john.cena@wwe.test",
    rol: Rol.GERENCIA,
    linea: Linea.CALZADO,
  },

  {
    nombre: "The Undertaker",
    username: "the.undertaker",
    email: "the.undertaker@wwe.test",
    rol: Rol.JEFE,
    linea: Linea.BOTA,
  },

  {
    nombre: "Triple H",
    username: "triple.h",
    email: "triple.h@wwe.test",
    rol: Rol.JEFE,
    linea: Linea.ROPA,
  },

  {
    nombre: "Shawn Michaels",
    username: "shawn.michaels",
    email: "shawn.michaels@wwe.test",
    rol: Rol.COORDINADOR,
    linea: Linea.ACCESORIOS,
  },

  {
    nombre: "Steve Austin",
    username: "steve.austin",
    email: "steve.austin@wwe.test",
    rol: Rol.COORDINADOR,
    linea: Linea.CALZADO,
  },

  {
    nombre: "Dwayne Johnson",
    username: "dwayne.johnson",
    email: "dwayne.johnson@wwe.test",
    rol: Rol.COORDINADOR,
    linea: Linea.BOTA,
  },

  {
    nombre: "Roman Reigns",
    username: "roman.reigns",
    email: "roman.reigns@wwe.test",
    rol: Rol.COORDINADOR,
    linea: Linea.ROPA,
  },

  {
    nombre: "Seth Rollins",
    username: "seth.rollins",
    email: "seth.rollins@wwe.test",
    rol: Rol.COORDINADOR,
    linea: Linea.ACCESORIOS,
  },

  {
    nombre: "Randy Orton",
    username: "randy.orton",
    email: "randy.orton@wwe.test",
    rol: Rol.JEFE,
    linea: Linea.CALZADO,
  },

  {
    nombre: "Brock Lesnar",
    username: "brock.lesnar",
    email: "brock.lesnar@wwe.test",
    rol: Rol.COORDINADOR,
    linea: Linea.BOTA,
  },
];

async function main() {
  console.log(
    "🔥 Creando usuarios WWE..."
  );

  const hashedPassword =
    await bcrypt.hash(
      PASSWORD,
      HASH_ROUNDS
    );

  for (const user of luchadores) {
    const creado =
      await prisma.usuario.upsert({
        where: {
          username:
            user.username,
        },

        update: {
          nombre:
            user.nombre,

          email:
            user.email,

          rol:
            user.rol,

          departamento:
            "DISENO",

          linea:
            user.linea,

          password:
            hashedPassword,
        },

        create: {
          nombre:
            user.nombre,

          username:
            user.username,

          email:
            user.email,

          password:
            hashedPassword,

          rol:
            user.rol,

          departamento:
            "DISENO",

          linea:
            user.linea,
        },
      });

    console.log(
      `✅ ${creado.username} | ${creado.rol}`
    );
  }

  console.log("");
  console.log(
    "🏆 Usuarios WWE creados correctamente"
  );

  console.log("");
  console.log(
    "🔑 PASSWORD GLOBAL:"
  );

  console.log(
    PASSWORD
  );
}

main()
  .catch((error) => {
    console.error(
      "❌ Error:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });