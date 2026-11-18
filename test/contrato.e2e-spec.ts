import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { generateKeyPair } from 'jose';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';
import { VerificadorTokens } from '../src/auth/verificador-tokens';
import { PuntoDireccion, ResultadoMapas, ServicioMapas } from '../src/mapas/servicio-mapas';
import { MailService, MensajeMail } from '../src/notificaciones/mail.service';
import { Rol } from '../src/usuarios/rol';
import { Usuario } from '../src/usuarios/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { EmisorTokens } from './tokens';

class MailFalso {
  enviados: MensajeMail[] = [];
  async enviar(m: MensajeMail) {
    this.enviados.push(m);
  }
}

class MapasFalso extends ServicioMapas {
  cae = false;
  llamadas = 0;
  async consultar(_o: PuntoDireccion, _d: PuntoDireccion): Promise<ResultadoMapas> {
    this.llamadas++;
    if (this.cae) throw new Error('servicio caído');
    return {
      origen: { latitud: -34.6, longitud: -58.4 },
      destino: { latitud: -34.61, longitud: -58.38 },
      tiempoEstimadoMinutos: 25,
    };
  }
}

/** Las cuentas demo tal como las emite Keycloak (mismos emails que los perfiles del seed). */
const CUENTAS = {
  operador: { email: 'operador@mensajeria.com', nombre: 'Operador Central', roles: ['OPERADOR', 'CLIENTE'] },
  cliente: { email: 'contacto@estudioperez.com', nombre: 'Estudio Contable Pérez', roles: ['CLIENTE'] },
  cliente2: { email: 'libreria@norte.com', nombre: 'Librería Norte', roles: ['CLIENTE'] },
  juan: { email: 'juan@mensajeria.com', nombre: 'Juan Pérez', roles: ['CADETE', 'CLIENTE'] },
  lucia: { email: 'lucia@mensajeria.com', nombre: 'Lucía Fernández', roles: ['CADETE', 'CLIENTE'] },
};

const BODY_ENVIO = {
  origen: { calle: 'Av. Rivadavia 5200', localidad: 'CABA', referencias: 'Timbre 2' },
  destino: { calle: 'Av. Corrientes 1234, piso 3 B', localidad: 'CABA' },
  destinatario: { nombre: 'María Gómez', telefono: '+54 11 5555-1234' },
  descripcion: 'Sobre con documentación contable',
};

describe('API Mensajería de Barrio (contrato OpenAPI)', () => {
  let app: INestApplication;
  const mail = new MailFalso();
  const mapas = new MapasFalso();
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  let envioId: number;

  let emisor: EmisorTokens;

  const api = () => request(app.getHttpServer());
  const como = (rol: string) => ({ Authorization: `Bearer ${tokens[rol]}` });
  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = (token: string) => api().get('/api/v1/auth/me').set(conToken(token));

  beforeAll(async () => {
    emisor = await EmisorTokens.crear();
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .overrideProvider(ServicioMapas)
      .useValue(mapas)
      .overrideProvider(VerificadorTokens)
      .useValue(emisor.verificador())
      .compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();

    for (const [clave, cuenta] of Object.entries(CUENTAS)) {
      tokens[clave] = await emisor.firmar({ sub: `kc-${clave}`, ...cuenta });
      const r = await me(tokens[clave]).expect(200);
      ids[clave] = r.body.id;
    }
  });

  afterAll(() => app.close());

  describe('Auth (tokens OIDC de Keycloak)', () => {
    it('GET /auth/me devuelve el perfil del dueño del token, sin datos sensibles', async () => {
      const r = await api().get('/api/v1/auth/me').set(como('operador')).expect(200);
      expect(r.body).toEqual({
        id: ids.operador,
        nombre: 'Operador Central',
        email: 'operador@mensajeria.com',
        rol: 'OPERADOR', // tiene OPERADOR y CLIENTE (rol por defecto): gana el de más privilegio
      });
    });

    it('el primer login se vincula por email al perfil precargado (conserva el teléfono)', async () => {
      const cadetes = await api().get('/api/v1/cadetes').set(como('operador')).expect(200);
      expect(cadetes.body.find((c: any) => c.id === ids.juan)).toMatchObject({
        nombre: 'Juan Pérez',
        telefono: '+54 11 4444-9876',
      });
    });

    it('sin token → 401 NO_AUTENTICADO; token basura → 401', async () => {
      expect((await api().get('/api/v1/auth/me').expect(401)).body.codigo).toBe('NO_AUTENTICADO');
      await me('basura').expect(401);
    });

    it('token vencido, de otro issuer, de otra audiencia o firmado con otra clave → 401', async () => {
      const base = { sub: 'kc-cliente', ...CUENTAS.cliente };
      const otraClave = (await generateKeyPair('RS256')).privateKey;
      const malos = [
        await emisor.firmar({ ...base, expiraEn: Math.floor(Date.now() / 1000) - 60 }),
        await emisor.firmar({ ...base, issuer: 'http://otro-keycloak/realms/mensajeria' }),
        await emisor.firmar({ ...base, audience: 'otra-app' }),
        await emisor.firmar(base, otraClave),
      ];
      for (const t of malos) {
        expect((await me(t).expect(401)).body.codigo).toBe('NO_AUTENTICADO');
      }
    });

    it('usuario de Keycloak sin ningún rol de la app → 403 SIN_PERMISO', async () => {
      const t = await emisor.firmar({ sub: 'kc-sin-rol', email: 'sinrol@x.com', nombre: 'Sin Rol', roles: [] });
      expect((await me(t).expect(403)).body.codigo).toBe('SIN_PERMISO');
    });

    it('usuario nuevo registrado en Keycloak: se le crea el perfil como CLIENTE en el primer request', async () => {
      const t = await emisor.firmar({ sub: 'kc-nuevo', email: 'Nuevo@Cliente.com', nombre: 'Cliente Nuevo', roles: ['CLIENTE'] });
      const r1 = await me(t).expect(200);
      expect(r1.body).toMatchObject({ email: 'nuevo@cliente.com', nombre: 'Cliente Nuevo', rol: 'CLIENTE' });
      const r2 = await me(t).expect(200);
      expect(r2.body.id).toBe(r1.body.id);
    });

    it('primeros requests en paralelo del mismo usuario no duplican el perfil', async () => {
      const t = await emisor.firmar({ sub: 'kc-paralelo', email: 'paralelo@x.com', nombre: 'Paralelo', roles: ['CLIENTE'] });
      const rs = await Promise.all([1, 2, 3, 4].map(() => me(t)));
      expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);
    });

    it('cambios de nombre o rol en Keycloak se reflejan en el perfil local', async () => {
      const datos = { sub: 'kc-cambia', email: 'cambia@x.com', nombre: 'Antes', roles: ['CLIENTE'] };
      const antes = await me(await emisor.firmar(datos)).expect(200);
      const despues = await me(await emisor.firmar({ ...datos, nombre: 'Después', roles: ['CLIENTE', 'OPERADOR'] })).expect(200);
      expect(despues.body).toMatchObject({ id: antes.body.id, nombre: 'Después', rol: 'OPERADOR' });
    });

    it('email sin verificar que coincide con un perfil existente → 403 EMAIL_NO_VERIFICADO (no lo usurpa)', async () => {
      const t = await emisor.firmar({
        sub: 'kc-impostor',
        email: 'libreria@norte.com',
        nombre: 'Impostor',
        roles: ['CLIENTE'],
        emailVerificado: false,
      });
      expect((await me(t).expect(403)).body.codigo).toBe('EMAIL_NO_VERIFICADO');
    });

    it('usuario desactivado localmente → 403 USUARIO_INACTIVO', async () => {
      const datos = { sub: 'kc-baja', email: 'baja@x.com', nombre: 'Dado de Baja', roles: ['CLIENTE'] };
      const r = await me(await emisor.firmar(datos)).expect(200);
      await app.get<Repository<Usuario>>(getRepositoryToken(Usuario)).update(r.body.id, { activo: false });
      expect((await me(await emisor.firmar(datos)).expect(403)).body.codigo).toBe('USUARIO_INACTIVO');
    });

    it('JSON malformado → 400 con formato de error del contrato', async () => {
      const r = await api()
        .post('/api/v1/envios')
        .set(como('cliente'))
        .set('Content-Type', 'application/json')
        .send('{esto no es json')
        .expect(400);
      expect(r.body).toEqual({ codigo: expect.any(String), mensaje: expect.any(String) });
    });

    it('ruta inexistente → 404 con formato del contrato', async () => {
      const r = await api().get('/api/v1/nada').set(como('cliente')).expect(404);
      expect(r.body.codigo).toBe('NO_ENCONTRADO');
    });
  });

  describe('Alta de envío', () => {
    it('el cliente crea un envío PENDIENTE, consulta mapas una sola vez y devuelve Location', async () => {
      const antes = mapas.llamadas;
      const r = await api().post('/api/v1/envios').set(como('cliente')).send(BODY_ENVIO).expect(201);
      envioId = r.body.id;
      expect(r.headers.location).toBe(`/api/v1/envios/${envioId}`);
      expect(mapas.llamadas - antes).toBe(1);
      expect(r.body).toMatchObject({
        estado: 'PENDIENTE',
        cadete: null,
        tiempoEstimadoMinutos: 25,
        cliente: { id: ids.cliente, nombre: 'Estudio Contable Pérez' },
        origen: { calle: 'Av. Rivadavia 5200', localidad: 'CABA', latitud: -34.6, longitud: -58.4 },
        destinatario: { nombre: 'María Gómez' },
      });
      expect(r.body.historial).toHaveLength(1);
      expect(r.body.historial[0]).toMatchObject({ estado: 'PENDIENTE', realizadoPor: { id: ids.cliente } });
      expect(mail.enviados).toHaveLength(0); // crear no manda mail
    });

    it('si el servicio de mapas falla, el envío se crea igual con null', async () => {
      mapas.cae = true;
      const r = await api().post('/api/v1/envios').set(como('cliente')).send(BODY_ENVIO).expect(201);
      mapas.cae = false;
      expect(r.body.tiempoEstimadoMinutos).toBeNull();
      expect(r.body.origen.latitud).toBeNull();
      expect(r.body.destino.longitud).toBeNull();
    });

    it('solo CLIENTE puede crear → 403', async () => {
      const r = await api().post('/api/v1/envios').set(como('operador')).send(BODY_ENVIO).expect(403);
      expect(r.body.codigo).toBe('SIN_PERMISO');
    });

    it('faltan campos obligatorios → 400 VALIDACION', async () => {
      const r = await api()
        .post('/api/v1/envios')
        .set(como('cliente'))
        .send({ origen: { calle: 'X', localidad: 'Y' } })
        .expect(400);
      expect(r.body.codigo).toBe('VALIDACION');
      expect(r.body.mensaje).toContain('destino');
    });
  });

  describe('Asignación (caso de uso mínimo del corte)', () => {
    it('un cliente no puede asignar → 403', async () => {
      await api()
        .put(`/api/v1/envios/${envioId}/asignacion`)
        .set(como('cliente'))
        .send({ cadeteId: ids.juan })
        .expect(403);
    });

    it('cadete inexistente, de otro rol o inactivo → 422 CADETE_INVALIDO', async () => {
      const repo = app.get<Repository<Usuario>>(getRepositoryToken(Usuario));
      const inactivo = await app.get(UsuariosService).crear({
        nombre: 'Ex Cadete',
        email: 'ex@mensajeria.com',
        rol: Rol.CADETE,
      });
      await repo.update(inactivo.id, { activo: false });

      for (const cadeteId of [9999, ids.cliente, inactivo.id]) {
        const r = await api()
          .put(`/api/v1/envios/${envioId}/asignacion`)
          .set(como('operador'))
          .send({ cadeteId })
          .expect(422);
        expect(r.body.codigo).toBe('CADETE_INVALIDO');
      }
    });

    it('body inválido → 400; envío inexistente → 404', async () => {
      await api().put(`/api/v1/envios/${envioId}/asignacion`).set(como('operador')).send({}).expect(400);
      await api().put('/api/v1/envios/99999/asignacion').set(como('operador')).send({ cadeteId: ids.juan }).expect(404);
    });

    it('el operador asigna: PENDIENTE → ASIGNADO, historial y mail al cliente', async () => {
      const r = await api()
        .put(`/api/v1/envios/${envioId}/asignacion`)
        .set(como('operador'))
        .send({ cadeteId: ids.juan })
        .expect(200);
      expect(r.body.estado).toBe('ASIGNADO');
      expect(r.body.cadete).toEqual({ id: ids.juan, nombre: 'Juan Pérez' });
      expect(r.body.historial.map((h: any) => h.estado)).toEqual(['PENDIENTE', 'ASIGNADO']);
      expect(r.body.historial[1]).toMatchObject({
        realizadoPor: { nombre: 'Operador Central' },
        observacion: 'Asignado a Juan Pérez',
      });
      expect(mail.enviados).toHaveLength(1);
      expect(mail.enviados[0].para).toBe('contacto@estudioperez.com');
      expect(mail.enviados[0].asunto).toContain(`#${envioId}`);
    });

    it('PUT es idempotente: mismo cadete → 200, sin historial nuevo ni segundo mail', async () => {
      const r = await api()
        .put(`/api/v1/envios/${envioId}/asignacion`)
        .set(como('operador'))
        .send({ cadeteId: ids.juan })
        .expect(200);
      expect(r.body.historial).toHaveLength(2);
      expect(mail.enviados).toHaveLength(1);
    });

    it('reasignación a otro cadete: queda en historial, estado igual y sin mail', async () => {
      const r = await api()
        .put(`/api/v1/envios/${envioId}/asignacion`)
        .set(como('operador'))
        .send({ cadeteId: ids.lucia })
        .expect(200);
      expect(r.body.estado).toBe('ASIGNADO');
      expect(r.body.cadete.nombre).toBe('Lucía Fernández');
      expect(r.body.historial).toHaveLength(3);
      expect(r.body.historial[2].observacion).toBe('Reasignado de Juan Pérez a Lucía Fernández');
      expect(mail.enviados).toHaveLength(1);
    });

    it('asignaciones simultáneas del mismo envío no duplican mails ni historial', async () => {
      const nuevo = await api().post('/api/v1/envios').set(como('cliente')).send(BODY_ENVIO).expect(201);
      const mailsAntes = mail.enviados.length;
      const rs = await Promise.all(
        [1, 2, 3, 4].map(() =>
          api()
            .put(`/api/v1/envios/${nuevo.body.id}/asignacion`)
            .set(como('operador'))
            .send({ cadeteId: ids.juan }),
        ),
      );
      expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(mail.enviados.length - mailsAntes).toBe(1);
      const det = await api().get(`/api/v1/envios/${nuevo.body.id}`).set(como('operador')).expect(200);
      expect(det.body.historial).toHaveLength(2);
    });
  });

  describe('Consulta de estado por el cliente', () => {
    it('el cliente ve su envío con estado actual e historial', async () => {
      const r = await api().get(`/api/v1/envios/${envioId}`).set(como('cliente')).expect(200);
      expect(r.body.estado).toBe('ASIGNADO');
      expect(r.body.historial).toHaveLength(3);
    });

    it('el envío de otro cliente → 404 (no 403); id no numérico → 404', async () => {
      await api().get(`/api/v1/envios/${envioId}`).set(como('cliente2')).expect(404);
      await api().get('/api/v1/envios/abc').set(como('cliente')).expect(404);
      await api().get('/api/v1/envios/99999').set(como('cliente')).expect(404);
    });

    it('un cadete solo ve los que tiene asignados', async () => {
      await api().get(`/api/v1/envios/${envioId}`).set(como('lucia')).expect(200);
      await api().get(`/api/v1/envios/${envioId}`).set(como('juan')).expect(404);
    });
  });

  describe('Cambios de estado del cadete', () => {
    const cambiar = (rol: string, body: object, id = envioId) =>
      api().post(`/api/v1/envios/${id}/estados`).set(como(rol)).send(body);

    it('cliente u operador no pueden cambiar estado → 403', async () => {
      await cambiar('cliente', { estado: 'RETIRADO' }).expect(403);
      await cambiar('operador', { estado: 'RETIRADO' }).expect(403);
    });

    it('un cadete al que no está asignado el envío → 404', async () => {
      await cambiar('juan', { estado: 'RETIRADO' }).expect(404);
    });

    it('transición no permitida (ASIGNADO → ENTREGADO) → 409 TRANSICION_INVALIDA', async () => {
      const r = await cambiar('lucia', { estado: 'ENTREGADO' }).expect(409);
      expect(r.body.codigo).toBe('TRANSICION_INVALIDA');
      expect(r.body.mensaje).toBe('No se puede pasar de ASIGNADO a ENTREGADO.');
    });

    it('estados que un cadete no puede marcar (PENDIENTE/ASIGNADO) → 400', async () => {
      await cambiar('lucia', { estado: 'ASIGNADO' }).expect(400);
      await cambiar('lucia', { estado: 'PENDIENTE' }).expect(400);
      await cambiar('lucia', { estado: 'VOLANDO' }).expect(400);
    });

    it('recorre el ciclo feliz con mail en cada cambio', async () => {
      const mailsAntes = mail.enviados.length;
      const r1 = await cambiar('lucia', { estado: 'RETIRADO' }).expect(201);
      expect(r1.headers.location).toBe(`/api/v1/envios/${envioId}/estados`);
      expect(r1.body.estado).toBe('RETIRADO');
      await cambiar('lucia', { estado: 'EN_CAMINO' }).expect(201);

      // NO_ENTREGADO exige motivo
      const sinMotivo = await cambiar('lucia', { estado: 'NO_ENTREGADO' }).expect(422);
      expect(sinMotivo.body.codigo).toBe('OBSERVACION_REQUERIDA');
      await cambiar('lucia', { estado: 'NO_ENTREGADO', observacion: '   ' }).expect(422);

      const fin = await cambiar('lucia', { estado: 'ENTREGADO' }).expect(201);
      expect(fin.body.estado).toBe('ENTREGADO');
      expect(fin.body.historial.map((h: any) => h.estado)).toEqual([
        'PENDIENTE', 'ASIGNADO', 'ASIGNADO', 'RETIRADO', 'EN_CAMINO', 'ENTREGADO',
      ]);
      expect(mail.enviados.length - mailsAntes).toBe(3);
      expect(mail.enviados.at(-1)!.asunto).toContain('entregado');
    });

    it('estado final: no admite más cambios (409) ni reasignación (409 ESTADO_INVALIDO)', async () => {
      await cambiar('lucia', { estado: 'EN_CAMINO' }).expect(409);
      const r = await api()
        .put(`/api/v1/envios/${envioId}/asignacion`)
        .set(como('operador'))
        .send({ cadeteId: ids.juan })
        .expect(409);
      expect(r.body.codigo).toBe('ESTADO_INVALIDO');
    });

    it('NO_ENTREGADO con motivo: el motivo llega en el mail', async () => {
      const nuevo = await api().post('/api/v1/envios').set(como('cliente')).send(BODY_ENVIO).expect(201);
      await api().put(`/api/v1/envios/${nuevo.body.id}/asignacion`).set(como('operador')).send({ cadeteId: ids.lucia }).expect(200);
      await cambiar('lucia', { estado: 'NO_ENTREGADO', observacion: 'Nadie atendió en el domicilio' }, nuevo.body.id).expect(201);
      const ultimo = mail.enviados.at(-1)!;
      expect(ultimo.asunto).toContain('No pudimos entregar');
      expect(ultimo.texto).toContain('Nadie atendió en el domicilio');
    });

    it('GET /envios/{id}/estados devuelve la línea de tiempo ordenada', async () => {
      const r = await api().get(`/api/v1/envios/${envioId}/estados`).set(como('cliente')).expect(200);
      expect(r.body).toHaveLength(6);
      expect(r.body[0]).toMatchObject({ estado: 'PENDIENTE', observacion: null });
      await api().get(`/api/v1/envios/${envioId}/estados`).set(como('cliente2')).expect(404);
    });
  });

  describe('Listados y filtros', () => {
    it('el cliente solo ve sus envíos; el operador ve todos', async () => {
      const propio = await api().get('/api/v1/envios').set(como('cliente')).expect(200);
      const ajeno = await api().get('/api/v1/envios').set(como('cliente2')).expect(200);
      const todos = await api().get('/api/v1/envios').set(como('operador')).expect(200);
      expect(ajeno.body.total).toBe(0);
      expect(propio.body.total).toBe(todos.body.total);
      expect(propio.body.pagina).toBe(1);
      expect(propio.body.tamanio).toBe(20);
      // más reciente primero
      const idsListados = propio.body.items.map((e: any) => e.id);
      expect(idsListados).toEqual([...idsListados].sort((a: number, b: number) => b - a));
    });

    it('filtro por uno o más estados', async () => {
      const uno = await api().get('/api/v1/envios?estado=ENTREGADO').set(como('operador')).expect(200);
      expect(uno.body.items.every((e: any) => e.estado === 'ENTREGADO')).toBe(true);
      expect(uno.body.total).toBe(1);

      const varios = await api()
        .get('/api/v1/envios?estado=ENTREGADO&estado=NO_ENTREGADO')
        .set(como('operador'))
        .expect(200);
      expect(varios.body.total).toBe(2);

      await api().get('/api/v1/envios?estado=VOLANDO').set(como('operador')).expect(400);
    });

    it('paginación', async () => {
      const r = await api().get('/api/v1/envios?tamanio=2&pagina=2').set(como('operador')).expect(200);
      expect(r.body.items).toHaveLength(2);
      expect(r.body).toMatchObject({ pagina: 2, tamanio: 2 });
      await api().get('/api/v1/envios?tamanio=1000').set(como('operador')).expect(400);
      await api().get('/api/v1/envios?pagina=0').set(como('operador')).expect(400);
    });

    it('filtro por fechas (desde/hasta, inclusive) y fecha inválida', async () => {
      const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // fecha en hora Argentina
      const incluye = await api().get(`/api/v1/envios?desde=${hoy}&hasta=${hoy}`).set(como('operador')).expect(200);
      expect(incluye.body.total).toBeGreaterThan(0);
      const futuro = await api().get('/api/v1/envios?desde=2999-01-01').set(como('operador')).expect(200);
      expect(futuro.body.total).toBe(0);
      const pasado = await api().get('/api/v1/envios?hasta=2000-01-01').set(como('operador')).expect(200);
      expect(pasado.body.total).toBe(0);
      await api().get('/api/v1/envios?desde=2026-13-45').set(como('operador')).expect(400);
    });

    it('filtro cadeteId: solo operador (otros → 403); el cadete ve solo los suyos', async () => {
      const r = await api().get(`/api/v1/envios?cadeteId=${ids.juan}`).set(como('operador')).expect(200);
      expect(r.body.items.every((e: any) => e.cadete.id === ids.juan)).toBe(true);
      await api().get(`/api/v1/envios?cadeteId=${ids.juan}`).set(como('cliente')).expect(403);

      const propios = await api().get('/api/v1/envios').set(como('lucia')).expect(200);
      expect(propios.body.items.every((e: any) => e.cadete.id === ids.lucia)).toBe(true);
    });
  });

  describe('Cadetes', () => {
    it('el operador lista cadetes activos con sus envíos activos', async () => {
      const r = await api().get('/api/v1/cadetes').set(como('operador')).expect(200);
      expect(r.body.map((c: any) => c.nombre)).toEqual(['Juan Pérez', 'Lucía Fernández', 'Marcos Díaz']);
      const juan = r.body.find((c: any) => c.id === ids.juan);
      expect(juan).toMatchObject({ activo: true, enviosActivos: 1, telefono: '+54 11 4444-9876' });
      expect(r.body.find((c: any) => c.id === ids.lucia).enviosActivos).toBe(0);
    });

    it('activo=false incluye a los inactivos', async () => {
      const r = await api().get('/api/v1/cadetes?activo=false').set(como('operador')).expect(200);
      expect(r.body).toHaveLength(4);
      expect(r.body.find((c: any) => c.nombre === 'Ex Cadete').activo).toBe(false);
    });

    it('otros roles → 403', async () => {
      await api().get('/api/v1/cadetes').set(como('cliente')).expect(403);
      await api().get('/api/v1/cadetes').set(como('lucia')).expect(403);
    });
  });
});
