# GARWEB — guía para Claude Code

Este archivo se lee al inicio de cada chat. Resume qué es el proyecto, cómo se trabaja y dónde está el detalle.

## 1. Qué es
- **GARWEB**: sistema web para **Tapicería de Interiores Garwood LLC** (New Jersey, EE. UU.).
- Es la tesis de Ingeniería Informática (URP) de **Jesús Sánchez** y **Alejandro Briceño**.
- Metodología **RUP**, nivel **MVP**.
- El código debe seguir los **flujos ya aprobados en el prototipo**. No inventes flujos nuevos ni cambies los existentes sin preguntar.

## 2. Cómo responder
- **Idioma:** siempre en **español**, directo y paso a paso, explicando el **porqué** de cada cambio.
- **Antes de tocar código:**
  - di qué archivos vas a cambiar y por qué;
  - si una regla de negocio no está definida aquí ni en `docs/contexto/`, **pregunta** antes de asumir.
- **Tamaño:** cambios pequeños y revisables. No reescribas módulos enteros si no se pidió.
- **Al terminar:**
  - cómo probarlo (qué pantalla abrir, qué hacer);
  - qué comandos correr.

## 3. Estructura del repo
- `frontend/`: React + Vite + TypeScript. Una sola app con vistas por rol: cliente, administrador, taller y conductor. Corre en `http://localhost:5173`.
- `backend/`: API Node.js + Express + Prisma (PostgreSQL). Puerto `3000`.
  - `prisma/`: esquema y migraciones;
  - `src/`: código;
  - `tests/`: pruebas (Vitest).
- `docker/`, `docker-compose.yml`: base de datos local para desarrollo.
- `docs/contexto/`: reglas y decisiones de negocio. **Leer antes de programar un flujo.**
- `docs/prototipo/`: pantallas del prototipo aprobado. Son la referencia visual y de comportamiento.
- `.claude/skills/garweb-contexto/`: contexto completo con los 49 casos de uso, el modelo de datos, el stack y las buenas prácticas.

## 4. Cómo se levanta (local)
1. `docker compose up -d db` (base local).
2. `cd backend && npm run dev`.
3. `cd frontend && npm run dev`.
4. Datos de prueba: `npm run db:seed` (local) · `npm run supabase:deploy` / `npm run supabase:seed` (Supabase). Ver `README.md` → "Problemas frecuentes".

## 5. Reglas que no se rompen
- **Secretos:**
  - nunca leer, mostrar, copiar ni subir el contenido de `.env`, `.env.supabase` ni `.env.local`;
  - los cambios de configuración van en `.env.example`;
  - el repo es **público**.
- **Base de datos:**
  - todo cambio de esquema va en una **migración de Prisma**; nunca a mano en Supabase;
  - nada de borrado físico de datos de negocio: se anula o se marca;
  - los valores de negocio (porcentajes, plazos, tarifas, duración del turno) se leen de la tabla `parametro`, no se escriben fijos.
- **Seguridad y estados:**
  - la autorización por rol se valida en el **backend**;
  - toda escritura queda en la **bitácora**;
  - todo cambio de estado pasa por la máquina de estados.
- **Interfaz:**
  - textos en español claro, sin tecnicismos;
  - usar los mismos textos, estados y nombres que el prototipo.
- **Pruebas:** escribir las de cada regla de negocio nueva y correr lint y tests antes de dar algo por terminado.

## 6. Dónde está cada cosa del negocio

| Tema | Archivo |
|---|---|
| Decisiones recientes, que **prevalecen** sobre el skill si hay diferencias | `docs/contexto/decisiones-recientes.md` |
| Solicitud de cotización del cliente (flujo principal, alternos y excepciones) | `docs/contexto/hu-solicitud-cotizacion.md` |
| Agenda de citas (modos, estados, reprogramación, bloqueos) | `docs/contexto/agenda.md` |
| Mapa de pantallas del prototipo | `docs/prototipo/README.md` |
| Casos de uso, modelo de datos, estados, parámetros | `.claude/skills/garweb-contexto/SKILL.md` |

Prototipo navegable en línea: https://garweb-garwood.netlify.app/
