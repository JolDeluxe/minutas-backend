## `docs/architecture.md`

```md
# Arquitectura del Sistema

# Arquitectura General

El sistema utiliza:
# Thin Client / Fat Backend

Toda lógica crítica vive en backend.

El frontend:
- captura
- visualiza
- organiza
- consume estado

El backend controla:
- reglas de negocio
- estados
- permisos
- métricas
- transitions
- lifecycle

---

# Stack Backend

- Bun
- Express
- Prisma
- JWT
- Socket.io
- Node-cron
- TypeScript

---

# Stack Frontend

- React 19
- Tailwind 4
- Zustand
- Vite
- PWA

---

# Entidades Principales

## Minuta

Contenedor organizacional de entradas.

---

## EntradaOrganizacional

Entidad principal del dominio.

Representa:
- ideas
- análisis
- acuerdos
- tareas
- observaciones
- seguimientos

Puede evolucionar progresivamente.

---

## Asignaciones

Separan:
- seguimiento
- ejecución

---

## Historial

Audita:
- estados
- formalización
- cambios
- asignaciones

---

# Arquitectura UX

La experiencia debe sentirse:
- rápida
- ligera
- conversacional
- tipo timeline

NO:
- burocrática
- ERP pesada
- estilo Jira

---

# Principios Técnicos

## Backend como fuente de verdad

El frontend NO decide:
- transitions
- métricas
- reglas
- permisos

---

## Captura rápida primero

Toda decisión UX debe priorizar:
# velocidad de captura

---

## Evolución progresiva

Las entradas:
- comienzan ligeras
- evolucionan gradualmente
- solo algunas se formalizan

---

# Escalabilidad

El modelo debe permitir:
- nuevos tipos de entrada
- nuevos dashboards
- automatizaciones futuras
- trazabilidad histórica
- análisis organizacional

Sin romper el dominio principal.