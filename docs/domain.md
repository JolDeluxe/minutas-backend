# Dominio del Sistema

## Naturaleza del Sistema

El sistema NO es:
- gestor tradicional de tareas
- Jira
- Trello
- ERP corporativo

El sistema SÍ es:
# una plataforma de memoria organizacional y seguimiento ejecutivo

Su objetivo es:
- capturar conversaciones de juntas
- evitar pérdida de iniciativas
- mantener trazabilidad
- organizar seguimiento
- formalizar trabajo progresivamente

---

# Problema Real

Durante juntas ejecutivas surgen:
- ideas
- observaciones
- acuerdos
- investigaciones
- análisis
- correcciones
- solicitudes
- tareas potenciales

Actualmente:
- muchas conversaciones se pierden
- no existe seguimiento consistente
- no todo requiere trabajo operativo inmediato
- la captura debe ser extremadamente rápida

---

# Conceptos Centrales

## Minuta

La minuta representa:
- memoria operativa
- timeline organizacional
- contenedor conversacional

NO representa una lista de tareas.

---

## Entrada Organizacional

Toda información capturada durante una junta genera una:
# Entrada Organizacional

Una entrada puede representar:
- idea
- observación
- análisis
- investigación
- corrección
- acuerdo
- seguimiento
- tarea formal

Todas las entradas comienzan ligeras.
Algunas evolucionan a trabajo formal.

---

# Evolución Organizacional

Una entrada puede:
- mantenerse como seguimiento ligero
- revisarse
- descartarse
- formalizarse
- convertirse en trabajo operativo

La formalización NO crea una nueva entidad.
La misma entrada evoluciona agregando capacidades operativas.

---

# Seguimiento vs Ejecución

## Seguimiento

Representa:
- mantener visible un tema
- revisar avances
- evitar pérdida organizacional

NO implica ejecutar trabajo.

---

## Ejecución

Representa trabajo operativo real:
- diseñar
- corregir
- producir
- investigar
- analizar

---

# Tipos de Fecha

## fechaSeguimiento

Representa:
- fecha de revisión
- próxima junta
- referencia conversacional

NO genera métricas.

---

## fechaVencimiento

Representa:
- deadline operativo real
- compromiso formal

SÍ genera métricas.

Solo aplica a entradas formalizadas.

---

# Formalización

Una entrada formalizada:
- tiene responsables operativos
- tiene deadlines reales
- genera métricas
- participa en ejecución

---

# Estados Conceptuales

Aplican a TODAS las entradas.

```ts
enum EstadoConceptual {
  CAPTURADO
  EN_REVISION
  CERRADO
  DESCARTADO
}
Estados Operativos

SOLO aplican a entradas formalizadas.

enum EstadoOperativo {
  PENDIENTE
  EN_PROGRESO
  COMPLETADO
}
Clasificaciones
enum Clasificacion {
  INVESTIGACION
  CORRECCION
  ANALISIS
  MUESTRA
  POLITICAS
  OTROS
}
Filosofía Operativa

NO todo:

necesita responsable operativo
necesita deadline
necesita métricas
necesita workflow pesado

PERO:
nada debe perderse.

Modelo Mental Correcto

El sistema funciona como:

memoria organizacional viva

Donde:

algunas cosas solo se recuerdan
algunas se revisan
algunas evolucionan a trabajo real