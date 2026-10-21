# Pilas · Turnos para peluquerías

App de turnos para peluquerías y barberías de Turbo, Antioquia. La clienta separa su turno desde el enlace del salón, sin crear cuenta. El salón maneja la agenda de cada estilista, la lista de espera y el cuadre de caja diario.

**Vista previa (datos de ejemplo):** https://jfredmc.github.io/pilas-turnos/

## Arquitectura

```mermaid
flowchart LR
  C["Clienta<br/>(enlace por WhatsApp)"] -->|/s/slug · sin cuenta| W
  D["Dueña / estilistas"] -->|login| W
  W["apps/web<br/>Angular PWA<br/>GitHub Pages"] -->|"fetch + JWT<br/>(solo si PILAS_API_URL)"| A
  W -. "sin API" .-> E[("Datos de ejemplo<br/>en memoria")]
  A["apps/api<br/>NestJS + zod<br/>Render"] -->|Drizzle ORM| P[("PostgreSQL<br/>Render")]
```

Es un monorepo con pnpm workspaces:

| Carpeta | Qué es |
|---|---|
| `apps/web` | Angular standalone con signals, pensado para el celular, instalable (PWA), modo claro/oscuro de un toque y Vitest. |
| `apps/api` | NestJS 11 + Drizzle ORM sobre PostgreSQL, zod, JWT, argon2 y `@nestjs/throttler`. Los tests de integración usan Vitest + Supertest sobre un Postgres real. |

### Modelo de datos (multi-salón)

`salones` → `usuarios` (rol `duena` o `estilista`), `estilistas`, `servicios`, `horarios` (semanales), `clientas`, `citas`, `lista_espera`, `pagos` (abono, saldo, propina · efectivo o Nequi) y `cierres_caja`.
Cada consulta del panel se filtra por el `salonId` del token, así que un salón nunca ve los datos de otro.
Los choques de horario se validan en el código y además en la base, con una restricción `EXCLUDE USING gist` (`btree_gist`). Si llegan dos reservas al mismo cupo al mismo tiempo, solo una queda.

### Endpoints (`/api`)

| Método y ruta | Acceso | Para qué |
|---|---|---|
| `GET /health` | público | Estado de la API y de la base. |
| `GET /publico/:slug` | público | Salón, servicios y estilistas. |
| `GET /publico/:slug/disponibilidad?servicioId&estilistaId&fecha` | público | Cupos libres cada 30 minutos. |
| `POST /publico/:slug/reservas` | público, límite de ritmo | Reserva sin cuenta. Exige `consentimiento: true` y crea el abono Nequi pendiente. |
| `POST /publico/:slug/espera` | público | Anotarse en la lista de espera. |
| `DELETE /publico/:slug/mis-datos` | público | Ley 1581: la clienta borra sus datos con su celular y el código de su cita. |
| `POST /auth/login`, `GET /auth/yo` | — | Login con email y contraseña (argon2) y JWT. |
| `GET /salon`, `GET /salon/agenda?fecha` | dueña y estilista | La estilista solo ve sus propias citas. |
| `PATCH /salon/citas/:id` | dueña y estilista | Cambia el estado. Al marcar "atendida" se registran el saldo y la propina. |
| `POST /salon/pagos/:id/confirmar` | dueña | Confirma que el abono de Nequi llegó. |
| `GET/POST/DELETE /salon/espera` | dueña y estilista | Lista de espera del salón. |
| `GET /salon/caja?fecha`, `POST /salon/caja/cierre` | caja: ambas · cierre: dueña | Cuadre por estilista: ventas, comisión, propinas, efectivo y Nequi. |
| `GET/DELETE /salon/clientas/:id` | dueña | Ley 1581: consultar o borrar los datos de una clienta. Sus citas quedan anónimas para no descuadrar la caja. |
| `GET/PATCH /config/salon` | dueña | Nombre, slug (enlace), WhatsApp, abono sí/no y monto, número de Nequi. |
| `GET/POST/PATCH/DELETE /config/servicios` | dueña | Servicios con precio (COP) y duración. Si un servicio tiene citas, borrarlo lo desactiva. |
| `GET/POST/PATCH /config/estilistas`, `PUT /config/estilistas/:id/horario` | dueña | Estilistas (comisión %, activa) y horario semanal. |
| `GET/POST/DELETE /config/excepciones` | dueña | Días libres, festivos de todo el salón u horario especial un día. |
| `GET/POST/DELETE /config/usuarios`, `POST /config/usuarios/:id/restablecer` | dueña | Invitar estilistas con contraseña temporal (se debe cambiar al primer ingreso). |
| `POST /auth/cambiar-password` | con sesión | Cambia la contraseña y emite un token nuevo. Los tokens anteriores dejan de servir. |
| `POST /auth/recuperar`, `POST /auth/restablecer` | público, límite de ritmo | Recuperación por correo: enlace de un solo uso, válido 1 hora (se guarda solo el hash). |

**Seguridad:**
- Validación con zod y mensajes de error en español.
- Límites de ritmo: uno general y otros más estrictos para login, reservas y borrado de datos.
- CORS con una lista blanca de orígenes (`CORS_ORIGINS`).
- `JWT_SECRET` es obligatorio en producción.
- Body JSON de máximo 20 kB y `trust proxy` activado para Render.

**Ley 1581 de 2012:**
- La clienta autoriza el uso de sus datos con una casilla obligatoria. Se guardan la fecha y la versión del aviso.
- La clienta o la dueña pueden borrar esos datos.
- Solo se guardan el nombre y el celular.

## Cómo correrlo

Requisitos: Node 24 (ver `.nvmrc`), pnpm 10 y PostgreSQL 17 (local o en Docker).

```bash
pnpm install

# Base local (o: docker run -d -p 5432:5432 -e POSTGRES_USER=pilas -e POSTGRES_PASSWORD=pilas -e POSTGRES_DB=pilas postgres:17)
createdb pilas && createdb pilas_test

# API
cp apps/api/.env.example apps/api/.env      # ajusta DATABASE_URL
pnpm --filter @pilas/api build
pnpm --filter @pilas/api db:migrate
pnpm --filter @pilas/api db:seed            # salón "salon-ejemplo" con datos de ejemplo
node apps/api/dist/main.js                  # http://localhost:3000/api/health

# Web conectada a la API
PILAS_API_URL=http://localhost:3000 pnpm --filter @pilas/web start
# Web sin API (datos de ejemplo, como en GitHub Pages)
pnpm --filter @pilas/web start
```

El seed local crea `duena@salon-ejemplo.ejemplo.co` y `yuli@salon-ejemplo.ejemplo.co`. La contraseña es `SEED_PASSWORD`; en local, si no la defines, es `pilas-ejemplo-local`.

**Tests:**
- `pnpm --filter @pilas/web test`
- `pnpm --filter @pilas/api test`: usa `DATABASE_URL_TEST`, por defecto `postgres://pilas:pilas@localhost:5432/pilas_test`. Aplica las migraciones y vacía las tablas en cada archivo.

**Migraciones:** se definen en `apps/api/src/db/schema.ts`. Con `pnpm --filter @pilas/api db:generate` se crea el SQL en `apps/api/drizzle/`.

### Correo (recuperación de contraseña)

Con `MAIL_PROVIDER=ses`, la API envía con Amazon SES usando `SES_AWS_REGION`, `SES_FROM_EMAIL` y las credenciales AWS estándar (`AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`). Sin eso, en desarrollo el correo con el enlace se escribe en el log de la API. En producción solo queda un aviso, sin el enlace.

## Despliegue

- **Web:** GitHub Pages (`.github/workflows/pages.yml`). Si defines la variable de repositorio `PILAS_API_URL`, la vista previa usa la API. Si no, sigue con los datos de ejemplo.
- **Datos de ejemplo en Render:** con `SEED_DEMO=true` (ya está en `render.yaml`), la API crea `salon-ejemplo` al arrancar si no existe, con la contraseña `SEED_PASSWORD`. Es idempotente. El plan Free no tiene Shell, por eso se siembra al arrancar.
- **API dormida:** en el plan Free, la API se duerme y tarda unos 50 s en despertar. La web muestra "Despertando el servidor…" mientras tanto y, si no responde en unos 75 s, sigue con los datos de ejemplo.
- **API y base:** Render Blueprint (`render.yaml`), con el servicio `pilas-api` y la base `pilas-db`, ambos en plan gratuito. `JWT_SECRET` se genera solo y `DATABASE_URL` se conecta desde la base. Las migraciones corren al arrancar.

Autor: Jhon Maquilon ([@JFredMC](https://github.com/JFredMC)) · Licencia MIT.
