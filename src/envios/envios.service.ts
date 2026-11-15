import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UsuarioToken } from '../common/decoradores';
import { ApiError, noEncontrado } from '../common/errores';
import { ResultadoMapas, ServicioMapas } from '../mapas/servicio-mapas';
import { Rol } from '../usuarios/rol';
import { CambioEstado } from './cambio-estado.entity';
import { CrearEnvioDto, ListarEnviosQuery } from './dto/envios.dto';
import { Envio } from './envio.entity';
import { aCambioEstadoDto, aEnvioDetalleDto, aEnvioDto } from './envio.mapper';
import { ESTADOS_ACTIVOS, EstadoEnvio } from './estado-envio';

const TIMEOUT_MAPAS_MS = 3000;
/** Zona horaria del negocio (Argentina, sin horario de verano): los filtros `desde`/`hasta` se leen en esta hora. */
const OFFSET_NEGOCIO = '-03:00';

@Injectable()
export class EnviosService {
  private readonly logger = new Logger(EnviosService.name);

  constructor(
    @InjectRepository(Envio) private readonly envios: Repository<Envio>,
    @InjectRepository(CambioEstado) private readonly cambios: Repository<CambioEstado>,
    private readonly dataSource: DataSource,
    private readonly mapas: ServicioMapas,
  ) {}

  /** Crea el envío en PENDIENTE. Consulta mapas UNA vez; si falla, el envío se crea igual con datos en null. */
  async crear(dto: CrearEnvioDto, cliente: UsuarioToken) {
    const geo = await this.consultarMapas(dto);
    const ahora = new Date();
    const limpio = (s?: string) => s?.trim() || null;

    const id = await this.dataSource.transaction(async (m) => {
      const envio = await m.save(
        m.create(Envio, {
          clienteId: cliente.id,
          origen: {
            calle: dto.origen.calle.trim(),
            localidad: dto.origen.localidad.trim(),
            referencias: limpio(dto.origen.referencias),
            latitud: geo?.origen.latitud ?? null,
            longitud: geo?.origen.longitud ?? null,
          },
          destino: {
            calle: dto.destino.calle.trim(),
            localidad: dto.destino.localidad.trim(),
            referencias: limpio(dto.destino.referencias),
            latitud: geo?.destino.latitud ?? null,
            longitud: geo?.destino.longitud ?? null,
          },
          destinatarioNombre: dto.destinatario.nombre.trim(),
          destinatarioTelefono: limpio(dto.destinatario.telefono),
          descripcion: limpio(dto.descripcion),
          estado: EstadoEnvio.PENDIENTE,
          cadeteId: null,
          tiempoEstimadoMinutos: geo?.tiempoEstimadoMinutos ?? null,
          creadoEn: ahora,
          actualizadoEn: ahora,
        }),
      );
      await m.save(
        m.create(CambioEstado, {
          envioId: envio.id,
          estado: EstadoEnvio.PENDIENTE,
          fecha: ahora,
          realizadoPorId: cliente.id,
          observacion: null,
        }),
      );
      return envio.id;
    });
    return this.detalle(id);
  }

  async listar(q: ListarEnviosQuery, usuario: UsuarioToken) {
    if (q.cadeteId !== undefined && usuario.rol !== Rol.OPERADOR) {
      throw new ApiError(403, 'SIN_PERMISO', 'El filtro cadeteId solo lo puede usar el operador.');
    }
    const qb = this.envios
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.cliente', 'cliente')
      .leftJoinAndSelect('e.cadete', 'cadete');

    if (usuario.rol === Rol.CLIENTE) qb.andWhere('e.clienteId = :uid', { uid: usuario.id });
    if (usuario.rol === Rol.CADETE) qb.andWhere('e.cadeteId = :uid', { uid: usuario.id });
    if (q.estado?.length) qb.andWhere('e.estado IN (:...estados)', { estados: q.estado });
    if (q.cadeteId !== undefined) qb.andWhere('e.cadeteId = :cadeteId', { cadeteId: q.cadeteId });
    if (q.desde) qb.andWhere('e.creadoEn >= :desde', { desde: this.fecha(q.desde, '00:00:00.000') });
    if (q.hasta) qb.andWhere('e.creadoEn <= :hasta', { hasta: this.fecha(q.hasta, '23:59:59.999') });

    const [items, total] = await qb
      .orderBy('e.id', 'DESC') // más reciente primero
      .skip((q.pagina - 1) * q.tamanio)
      .take(q.tamanio)
      .getManyAndCount();

    return { items: items.map(aEnvioDto), pagina: q.pagina, tamanio: q.tamanio, total };
  }

  /** Cantidad de envíos activos (asignados y sin terminar) por id de cadete. */
  async contarActivosPorCadete(): Promise<Map<number, number>> {
    const filas = await this.envios
      .createQueryBuilder('e')
      .select('e.cadeteId', 'cadeteId')
      .addSelect('COUNT(*)', 'cantidad')
      .where('e.estado IN (:...activos)', { activos: ESTADOS_ACTIVOS })
      .andWhere('e.cadeteId IS NOT NULL')
      .groupBy('e.cadeteId')
      .getRawMany();
    return new Map(filas.map((f) => [Number(f.cadeteId), Number(f.cantidad)]));
  }

  /** Envío + historial, si el usuario puede verlo (si no: 404, para no revelar qué IDs existen). */
  async consultar(id: number, usuario: UsuarioToken) {
    await this.obtenerVisible(id, usuario);
    return this.detalle(id);
  }

  async historial(id: number, usuario: UsuarioToken) {
    await this.obtenerVisible(id, usuario);
    return (await this.cargarHistorial(id)).map(aCambioEstadoDto);
  }

  /** Devuelve la entidad (con cliente y cadete) solo si el rol puede verla. */
  async obtenerVisible(id: number, usuario: UsuarioToken): Promise<Envio> {
    const envio = await this.envios.findOne({
      where: { id },
      relations: { cliente: true, cadete: true },
    });
    const visible =
      !!envio &&
      (usuario.rol === Rol.OPERADOR ||
        (usuario.rol === Rol.CLIENTE && envio.clienteId === usuario.id) ||
        (usuario.rol === Rol.CADETE && envio.cadeteId === usuario.id));
    if (!envio || !visible) throw noEncontrado('El envío no existe.');
    return envio;
  }

  /** Arma la respuesta `EnvioDetalle` (sin chequear visibilidad: usar después de `obtenerVisible`). */
  async detalle(id: number) {
    const envio = await this.envios.findOne({
      where: { id },
      relations: { cliente: true, cadete: true },
    });
    if (!envio) throw noEncontrado('El envío no existe.');
    return aEnvioDetalleDto(envio, await this.cargarHistorial(id));
  }

  private cargarHistorial(envioId: number) {
    return this.cambios.find({
      where: { envioId },
      relations: { realizadoPor: true },
      order: { id: 'ASC' }, // del más antiguo al más reciente
    });
  }

  private fecha(dia: string, hora: string): Date {
    const d = new Date(`${dia}T${hora}${OFFSET_NEGOCIO}`);
    if (Number.isNaN(d.getTime())) {
      throw new ApiError(400, 'VALIDACION', `La fecha ${dia} no es válida.`);
    }
    return d;
  }

  private async consultarMapas(dto: CrearEnvioDto): Promise<ResultadoMapas | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, rechazar) => {
        timer = setTimeout(() => rechazar(new Error('timeout')), TIMEOUT_MAPAS_MS);
      });
      return await Promise.race([
        this.mapas.consultar(
          { calle: dto.origen.calle, localidad: dto.origen.localidad },
          { calle: dto.destino.calle, localidad: dto.destino.localidad },
        ),
        timeout,
      ]);
    } catch (err) {
      this.logger.warn(
        `Servicio de mapas no disponible, el envío se crea sin coordenadas: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
