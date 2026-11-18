/**
 * Caso de uso mínimo: "Un operador asigna un envío a un cadete y el cliente ve el cambio de estado."
 *
 * Cada iteración recorre el caso completo contra el sistema levantado con docker compose:
 *   1. El cliente crea un envío (queda PENDIENTE).
 *   2. El operador ve los envíos pendientes y los cadetes disponibles.
 *   3. El operador asigna el envío al cadete.
 *   4. El cliente consulta el envío y ve el estado ASIGNADO, con el cadete y el historial.
 *   5. Al cliente le llega el mail del cambio de estado (se busca en Mailpit).
 *
 * Uso (con el sistema levantado):
 *   k6 run k6/caso-uso-minimo.js                              # un recorrido
 *   k6 run --vus 10 --duration 1m k6/caso-uso-minimo.js       # carga: 10 usuarios simultáneos durante 1 minuto
 *
 * Variables (-e NOMBRE=valor): API_URL, KEYCLOAK_URL, MAILPIT_URL, VERIFICAR_MAIL (true|false).
 *
 * Login: se hace una sola vez por rol en setup() con el cliente "mensajeria-k6" del realm (usuario y contraseña,
 * solo desarrollo) y todos los VUs comparten esos tokens. Si cada VU hiciera login con el mismo usuario al mismo
 * tiempo, la protección contra fuerza bruta de Keycloak bloquearía la cuenta.
 */
import http from 'k6/http';
import { check, fail, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const API = (__ENV.API_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');
const KEYCLOAK = (__ENV.KEYCLOAK_URL || 'http://localhost:8180').replace(/\/$/, '');
const MAILPIT = (__ENV.MAILPIT_URL || 'http://localhost:8025').replace(/\/$/, '');
const TOKEN_URL = `${KEYCLOAK}/realms/mensajeria/protocol/openid-connect/token`;
const CLIENT_ID = 'mensajeria-k6';
const PASSWORD = __ENV.PASSWORD || 'secreto123';
const VERIFICAR_MAIL = (__ENV.VERIFICAR_MAIL || 'true') === 'true';

// Un usuario por rol (los del realm de Keycloak, ver README).
const USUARIOS = {
  operador: 'operador@mensajeria.com',
  cliente: 'contacto@estudioperez.com',
  cadete: 'juan@mensajeria.com',
};

// Sin escenarios: por defecto 1 VU / 1 iteración; --vus y --duration desde la línea de comandos para carga.
export const options = {
  thresholds: {
    // Todos los recorridos deben terminar bien.
    caso_uso_completo: ['rate==1'],
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    // Solo los requests a nuestra API (no los de Keycloak ni Mailpit).
    'http_req_duration{tipo:api}': ['p(95)<500'],
  },
};

const casoUsoCompleto = new Rate('caso_uso_completo');
const duracionCasoUso = new Trend('duracion_caso_uso', true);

/* ------------------------------ tokens ------------------------------ */

function pedirToken(datos, nombre) {
  const res = http.post(TOKEN_URL, { client_id: CLIENT_ID, scope: 'openid', ...datos }, {
    tags: { tipo: 'keycloak', name: nombre },
  });
  if (res.status !== 200) fail(`Keycloak rechazó el pedido de token (${nombre}): ${res.status} ${res.body}`);
  const t = res.json();
  return { access: t.access_token, refresh: t.refresh_token, vence: Date.now() + t.expires_in * 1000 };
}

// Copia por VU de los tokens de setup(); cada VU los renueva con el refresh token cuando están por vencer.
let tokens = null;

function token(rol) {
  if (tokens[rol].vence - Date.now() < 30_000) {
    tokens[rol] = pedirToken({ grant_type: 'refresh_token', refresh_token: tokens[rol].refresh }, 'keycloak: refresh');
  }
  return tokens[rol].access;
}

/* ------------------------------ helpers ------------------------------ */

function api(rol, metodo, ruta, nombre, cuerpo) {
  return http.request(metodo, API + ruta, cuerpo ? JSON.stringify(cuerpo) : null, {
    headers: { Authorization: `Bearer ${token(rol)}`, 'Content-Type': 'application/json' },
    tags: { tipo: 'api', name: nombre },
  });
}

/** Lee un campo (o todo, sin ruta) del JSON de la respuesta sin romper si el cuerpo no es JSON. */
function campo(res, ruta) {
  try {
    return ruta === undefined ? res.json() : res.json(ruta);
  } catch {
    return undefined;
  }
}

function nuevoEnvio() {
  return {
    origen: { calle: 'Av. Rivadavia 5200', localidad: 'CABA', referencias: 'Timbre 2' },
    destino: { calle: 'Av. Corrientes 1234, piso 3 B', localidad: 'CABA' },
    destinatario: { nombre: 'María Gómez', telefono: '+54 11 5555-1234' },
    descripcion: `Prueba k6 (VU ${__VU}, iteración ${__ITER})`,
  };
}

/* ------------------------------ setup ------------------------------ */

export function setup() {
  const iniciales = {};
  for (const [rol, usuario] of Object.entries(USUARIOS)) {
    iniciales[rol] = pedirToken({ grant_type: 'password', username: usuario, password: PASSWORD }, 'keycloak: login');
  }
  tokens = iniciales;

  // El id del cadete sale de su propio perfil (/auth/me también lo vincula si es su primer ingreso).
  const yo = api('cadete', 'GET', '/auth/me', 'GET /auth/me');
  if (yo.status !== 200 || campo(yo, 'rol') !== 'CADETE') {
    fail(`No se pudo obtener el perfil del cadete: ${yo.status} ${yo.body}`);
  }
  return { tokens: iniciales, cadeteId: campo(yo, 'id'), cadeteNombre: campo(yo, 'nombre') };
}

/* ------------------------------ recorrido ------------------------------ */

export default function (datos) {
  if (!tokens) tokens = JSON.parse(JSON.stringify(datos.tokens));
  const { cadeteId, cadeteNombre } = datos;
  const inicio = Date.now();
  let ok = true;
  const verificar = (valor, checks) => {
    const r = check(valor, checks);
    ok = ok && r;
    return r;
  };

  let envioId;
  group('1. El cliente crea un envío', () => {
    const r = api('cliente', 'POST', '/envios', 'POST /envios', nuevoEnvio());
    verificar(r, {
      'crear: 201': (x) => x.status === 201,
      'crear: queda PENDIENTE y sin cadete': (x) => campo(x, 'estado') === 'PENDIENTE' && campo(x, 'cadete') === null,
    });
    envioId = campo(r, 'id');
  });
  if (!envioId) {
    casoUsoCompleto.add(false);
    return;
  }

  group('2. El operador ve pendientes y cadetes', () => {
    const pendientes = api('operador', 'GET', '/envios?estado=PENDIENTE', 'GET /envios?estado=PENDIENTE');
    verificar(pendientes, {
      'pendientes: 200': (x) => x.status === 200,
      'pendientes: todos en PENDIENTE': (x) => (campo(x, 'items') || []).every((e) => e.estado === 'PENDIENTE'),
    });
    const cadetes = api('operador', 'GET', '/cadetes', 'GET /cadetes');
    verificar(cadetes, {
      'cadetes: 200': (x) => x.status === 200,
      'cadetes: el cadete está activo': (x) => (campo(x) || []).some((c) => c.id === cadeteId && c.activo),
    });
  });

  group('3. El operador asigna el envío al cadete', () => {
    const r = api('operador', 'PUT', `/envios/${envioId}/asignacion`, 'PUT /envios/{id}/asignacion', { cadeteId });
    verificar(r, {
      'asignar: 200': (x) => x.status === 200,
      'asignar: queda ASIGNADO': (x) => campo(x, 'estado') === 'ASIGNADO',
      'asignar: al cadete elegido': (x) => campo(x, 'cadete.id') === cadeteId,
    });
  });

  group('4. El cliente ve el cambio de estado', () => {
    const r = api('cliente', 'GET', `/envios/${envioId}`, 'GET /envios/{id}');
    verificar(r, {
      'consultar: 200': (x) => x.status === 200,
      'consultar: el cliente ve ASIGNADO': (x) => campo(x, 'estado') === 'ASIGNADO',
      'consultar: ve qué cadete lo lleva': (x) => campo(x, 'cadete.nombre') === cadeteNombre,
      'consultar: historial PENDIENTE → ASIGNADO': (x) =>
        JSON.stringify((campo(x, 'historial') || []).map((h) => h.estado)) === '["PENDIENTE","ASIGNADO"]',
    });
  });

  if (VERIFICAR_MAIL) {
    group('5. Al cliente le llega el mail', () => {
      // El mail se manda en segundo plano (no demora la respuesta de la API): se reintenta unos segundos.
      const consulta = encodeURIComponent(`to:${USUARIOS.cliente} subject:"Envío #${envioId}:"`);
      let encontrado = false;
      for (let i = 0; i < 20 && !encontrado; i++) {
        const r = http.get(`${MAILPIT}/api/v1/search?query=${consulta}`, {
          tags: { tipo: 'mailpit', name: 'mailpit: buscar' },
        });
        encontrado = r.status === 200 && campo(r, 'messages_count') > 0;
        if (!encontrado) sleep(0.25);
      }
      verificar(encontrado, { 'mail: le llegó al cliente el aviso de asignación': (x) => x === true });
    });
  }

  casoUsoCompleto.add(ok);
  duracionCasoUso.add(Date.now() - inicio);
}
