# Mensajería de Barrio (Grupo 3A)

## Levantar todo

```bash
docker compose up --build
```

| Servicio | URL | Notas |
|---|---|---|
| Frontend | http://localhost:3000 | nginx sirviendo `mensajeria-frontend.html` |
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
