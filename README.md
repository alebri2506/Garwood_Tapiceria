# GARWEB · Tapicería de Interiores Garwood LLC

| Carpeta | Qué es |
|---|---|
| [frontend/](frontend/README.md) | React + Vite + TypeScript (PWA en una sola app con vistas por rol) |
| [backend/](backend/README.md) | API Node.js + Express + Prisma (PostgreSQL / Supabase) |
| `docker-compose.yml` | Base de datos, API y web en contenedores |
| `docker/db-init/` | Crea la base `garweb_test` (pruebas) la primera vez que arranca PostgreSQL |

## Requisitos

| Programa | Versión | Para qué |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | reciente | Base de datos, API y web en contenedores |
| [Node.js](https://nodejs.org/) | 22 LTS o más nuevo | Instalar dependencias, migrar, cargar datos y desarrollar |
| Git | cualquiera | Bajar el código |

Los comandos funcionan igual en PowerShell, Git Bash o la terminal de VS Code. Todos se escriben **desde la carpeta
raíz del proyecto** salvo que el paso diga otra cosa.

## Opción A · Levantar todo con Docker (para usar o mostrar el sistema)

**1. Abrir Docker Desktop** y esperar a que diga *Engine running*.

**2. Crear los archivos de configuración** (solo la primera vez):

```bash
cp backend/.env.example backend/.env
```

```bash
cp frontend/.env.example frontend/.env
```

Abra `backend/.env` y complete `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` con dos cadenas distintas. Para generar
cada una:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Opcional, para ver el mapa real de Google: cree un archivo `.env` en la raíz con `VITE_GOOGLE_MAPS_API_KEY=...` y
`VITE_GOOGLE_MAPS_MAP_ID=...`. Sin él se ve un mapa ilustrado y todo lo demás funciona.

**3. Construir y levantar los contenedores** (la primera vez tarda unos minutos):

```bash
docker compose up -d --build
```

La API aplica sola las migraciones al arrancar. Para ver que los tres estén arriba:

```bash
docker compose ps
```

**4. Cargar los datos de prueba** (solo la primera vez, o después de borrar la base):

```bash
cd backend
```

```bash
npm install
```

```bash
npm run db:seed
```

```bash
cd ..
```

El seed se corre desde su equipo porque la imagen de la API no trae las herramientas de desarrollo. Usa
`backend/.env`, que apunta a la base del contenedor (`localhost:5433`).

**5. Abrir el sistema:**

- Web: http://localhost:8090
- API (comprobación): http://localhost:3000/api/salud

## Opción B · Modo desarrollo (para programar, con recarga automática)

Solo la base va en Docker; la API y la web corren en su equipo y se recargan al guardar.

**1.** Hacer el paso 2 de la opción A (archivos `.env`).

**2. Levantar solo la base de datos:**

```bash
docker compose up -d db
```

**3. API**, en una terminal:

```bash
cd backend
```

```bash
npm install
```

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Queda en http://localhost:3000 (deje esta terminal abierta).

**4. Web**, en otra terminal:

```bash
cd frontend
```

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:5173. Vite pasa las llamadas a `/api` hacia la API del paso 3.

> Si deja `VITE_API_URL` vacío en `frontend/.env`, la web usa una **API simulada** en memoria y no necesita backend
> ni base (útil para revisar solo el diseño).

## Usuarios de prueba

Contraseña de todos: `Sofa2026` (solo para desarrollo). Cada uno entra a la vista de su rol.

| Usuario | Rol | Vista |
|---|---|---|
| `admin` | Administrador | `/admin` |
| `tapicero` | Tapicero | `/taller` |
| `conductor` | Conductor | `/conductor` |
| `laura.mendez@correo.com` | Cliente | `/cliente/pedidos` |

Los correos (avisos, recuperación de contraseña, invitaciones) se imprimen en el log de la API mientras no se
configure `SMTP_HOST`:

```bash
docker compose logs -f api
```

## Comandos del día a día

| Qué quiere hacer | Comando (desde la raíz) |
|---|---|
| Levantar todo de nuevo tras cambiar código | `docker compose up -d --build` |
| Apagar los contenedores (los datos se conservan) | `docker compose down` |
| Ver los logs de la API | `docker compose logs -f api` |
| Borrar la base y las fotos y empezar de cero | `docker compose down -v` y luego los pasos 3 y 4 de la opción A |
| Pruebas automáticas del backend (usan la base `garweb_test`) | `cd backend` y `npx vitest run` |
| Revisar tipos del frontend | `cd frontend` y `npx tsc --noEmit -p .` |

## Problemas frecuentes

- **`Cannot connect to the Docker daemon` / `error during connect`**: Docker Desktop no está abierto. Ábralo y
  repita el comando.
- **El puerto 5433, 3000 u 8090 ya está en uso**: otro programa lo ocupa. Ciérrelo o cambie el puerto de la
  izquierda en `docker-compose.yml` (por ejemplo `"8091:80"`).
- **La web abre pero no deja iniciar sesión**: falta el seed (paso 4) o los secretos JWT en `backend/.env`.
- **`npm run db:seed` falla con `Can't reach database server`**: la base no está arriba; corra
  `docker compose up -d db`.

## Base de datos en Supabase

Para aplicar el esquema y los datos en la base de Supabase se usa `backend/.env.supabase` (no se sube al repositorio;
las contraseñas nunca se comparten por chat). Pasos en
[backend/README.md](backend/README.md#desplegar-la-base-en-supabase):

```bash
cd backend
```

```bash
npm run supabase:deploy
```

```bash
npm run supabase:seed
```
