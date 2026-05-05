// minutas-backend/src/test/user-test.ts

import { env } from "../env"; // Usamos tu configuración de entorno
import { Rol } from "@prisma/client";

const BASE_URL = `http://localhost:${env.PORT}/api`;

const luchadores = [
  "John Cena",
  "The Undertaker",
  "Triple H",
  "Shawn Michaels",
  "Steve Austin",
  "Dwayne Johnson",
  "Roman Reigns",
  "Seth Rollins",
  "Randy Orton",
  "Brock Lesnar",
];

async function runTest() {
  console.log("🚀 Iniciando prueba de inserción de usuarios (WWE Edition)...\n");

  let token = "";

  // 1. Iniciar sesión como Administrador (GERENCIA) para obtener el token
  try {
    console.log(`🔑 Intentando login con el admin del sistema: ${env.SYS_ADMIN_USER}...`);
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: env.SYS_ADMIN_USER, // Corregido a 'identifier'
        password: env.SYS_ADMIN_PASS,
      }),
    });

    // Definimos como 'any' para evitar el error de unknown en el test
    const loginData = (await loginRes.json()) as any; 

    if (!loginRes.ok) {
      throw new Error(loginData.message || "Fallo en el login");
    }

    token = loginData.accessToken; // El token viene directo en la raíz
    console.log("✅ Login exitoso. Token obtenido.\n");
  } catch (error) {
    console.error("❌ Error de autenticación. ¿Está corriendo el servidor y las credenciales son correctas?", error);
    process.exit(1);
  }

  // 2. Insertar a los 10 luchadores
  let exitosos = 0;
  let fallidos = 0;

  for (const [index, nombre] of luchadores.entries()) {
    try {
      // Alternamos roles para tener variedad en las pruebas
      const rolAsignado = index % 3 === 0 ? Rol.JEFE : Rol.COORDINADOR;
      
      // Creamos un email ficticio basado en el nombre
      const email = `${nombre.toLowerCase().replace(/\s+/g, ".")}@wwe.test.com`;

      const reqBody = {
        nombre: nombre,
        password: "123456", // Contraseña solicitada
        email: email,
        rol: rolAsignado,
        // No enviamos 'username' para probar que tu generador automático funciona
      };

      const res = await fetch(`${BASE_URL}/usuarios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`, // Inyectamos el token
        },
        body: JSON.stringify(reqBody),
      });

      const data = (await res.json()) as any;

      if (res.ok) {
        console.log(`✅ Creado [${data.data.id}]: ${data.data.nombre} -> Username generado: ${data.data.username}`);
        exitosos++;
      } else {
        console.error(`❌ Error al crear a ${nombre}:`, data.error);
        fallidos++;
      }
    } catch (error) {
      console.error(`❌ Error de red al intentar crear a ${nombre}:`, error);
      fallidos++;
    }
  }

  console.log("\n📊 Resumen de la prueba:");
  console.log(`✔️  Exitosos: ${exitosos}`);
  console.log(`❌  Fallidos: ${fallidos}`);
  
  if (exitosos === 10) {
    console.log("🏆 ¡Prueba superada! El módulo de creación de usuarios funciona perfectamente.");
  }
}

// Ejecutar la prueba
runTest();