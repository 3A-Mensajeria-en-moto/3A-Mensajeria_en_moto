# Mensajería de Barrio (Grupo 3A)

## Levantar todo

```bash
docker compose up --build
```

| Servicio | URL | Notas |
|---|---|---|
| Frontend | http://localhost:3000 | nginx sirviendo `frontend/index.html` |
| API | http://localhost:8080/api/v1 | NestJS + SQLite (volumen `backend-data`) |
| Keycloak | http://localhost:8180 | consola de admin: `admin` / `admin` |
| Mailpit | http://localhost:8025 | mails de Keycloak y de la app. Si el puerto está ocupado: `MAILPIT_PORT=8026 docker compose up` |

## Usuarios de prueba

Entrar en http://localhost:3000 → **Ingresar**. Todos tienen la contraseña `secreto123`.

| Rol | Usuario | Qué puede hacer |
|---|---|---|
| Operador | `operador@mensajeria.com` | Ver todos los envíos y asignarlos a un cadete |
| Cliente | `contacto@estudioperez.com` | Crear envíos y seguir su estado |
| Cadete | `juan@mensajeria.com` | Marcar retirado / en camino / entregado / no entregado |

Hay más para probar visibilidad entre usuarios: otro cliente (`libreria@norte.com`) y otros cadetes
(`lucia@mensajeria.com`, `marcos@mensajeria.com`).

Recorrido del caso de uso mínimo: el **cliente** crea un envío → el **operador** lo asigna a Juan → el **cliente** ve
el estado "Asignado" y le llega un mail (verlo en Mailpit) → el **cadete** lo avanza y cada cambio genera otro mail.

### De dónde salen

- **Cuentas (login y rol):** están definidas en [`keycloak/realm-mensajeria.json`](keycloak/realm-mensajeria.json), que
  es parte del repo. Keycloak lo importa la primera vez que arranca, así que cualquiera que clone el proyecto y haga
  `docker compose up` tiene exactamente estos usuarios.
- **Perfiles de negocio (teléfono de los cadetes, etc.):** los carga el backend al arrancar con la base vacía
  (`src/seed/seed.service.ts`) y se vinculan con la cuenta de Keycloak por email en el primer login.
- Después del primer arranque, todo vive en los volúmenes de Docker (`keycloak-data` y `backend-data`): sobrevive a
  `docker compose down` / `up`. Lo que se cree desde la app o la consola de Keycloak queda solo ahí, no en el repo.
- Para volver al estado inicial (o si se edita el JSON del realm, que solo se importa si el realm no existe):
  `docker compose down -v` y de nuevo `docker compose up --build`.

## Prueba del caso de uso mínimo (k6)

[`k6/caso-uso-minimo.js`](k6/caso-uso-minimo.js) recorre, contra el sistema levantado: el cliente crea un envío → el
operador ve los pendientes y los cadetes → lo asigna a Juan → el cliente ve el estado ASIGNADO (con cadete e historial)
→ al cliente le llega el mail (lo busca en Mailpit).

Requiere [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) instalado y el sistema levantado:

```bash
k6 run k6/caso-uso-minimo.js                          # un recorrido
k6 run --vus 10 --duration 1m k6/caso-uso-minimo.js   # carga: 10 usuarios simultáneos durante 1 minuto
```

Si Mailpit no está en el 8025, agregar `-e MAILPIT_URL=http://localhost:8026` (o `-e VERIFICAR_MAIL=false` para no
chequear mails). Pasa si **todos** los recorridos terminan bien y el p95 de la API es < 500 ms.

El login se hace una vez por rol con el cliente `mensajeria-k6` del realm, que acepta usuario y contraseña directamente
(password grant). Existe solo para estas pruebas: en producción no se crearía.

La carga es a propósito muy superior a la real (~80 envíos por día): con 10 usuarios durante 1 minuto se completaron
2640 recorridos (con su mail) sin errores y con p95 de la API ≈ 11 ms. Deja esos envíos en la base: para una demo
limpia, `docker compose down -v`.

## Autenticación (Keycloak, OpenID Connect)

- El frontend usa `keycloak-js` con **Authorization Code + PKCE** (cliente público `mensajeria-frontend`).
  Login, registro, verificación de email y "olvidé mi contraseña" son pantallas de Keycloak.
- La API solo valida el access token: firma con las claves del realm (JWKS), `iss`, `aud = mensajeria-api` y vencimiento.
- **Roles**: roles de realm `CLIENTE`, `OPERADOR`, `CADETE`. Todo usuario nuevo recibe `CLIENTE`; para hacer a alguien
  cadete u operador, agregarle el rol en Keycloak (Users → Role mapping). Si tiene varios, gana el de más privilegio.
- **Perfil local**: la tabla `usuarios` guarda los datos de negocio (id usado por los envíos, teléfono, activo).
  Se crea en el primer request del usuario, o se vincula por email (verificado) con un perfil precargado por el seed
  o por `npm run usuario:crear`. Nombre, email y rol se copian de Keycloak en cada request.
- La configuración del realm está en `keycloak/realm-mensajeria.json` y se importa la primera vez que arranca Keycloak.

## Desarrollo sin Docker

```bash
docker compose up keycloak mailpit frontend   # todo menos el backend (el front apunta a localhost:8080)
cp .env.example .env
npm install
npm run start:dev
npm test                              # no necesita Keycloak: los tests firman sus propios tokens
```
