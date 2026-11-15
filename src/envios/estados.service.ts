import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UsuarioToken } from '../common/decoradores';
import { ApiError } from '../common/errores';
import { Mutex } from '../common/mutex';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Rol } from '../usuarios/rol';
import { UsuariosService } from '../usuarios/usuarios.service';
import { CambioEstado } from './cambio-estado.entity';
import { CambioEstadoDto } from './dto/envios.dto';
import { Envio } from './envio.entity';
import { EnviosService } from './envios.service';
import { EstadoEnvio, TITULO_AVISO_AL_CLIENTE, transicionPermitida } from './estado-envio';

/**
 * Único lugar donde se mueve el estado de un envío (asignación y cambios del cadete).
 * Las operaciones se serializan con un mutex: es un único servidor, así que alcanza
 * para evitar que dos requests simultáneos pisen el estado del mismo envío.
 */
@Injectable()
export class EstadosService {
  private readonly mutex = new Mutex();

  constructor(
    private readonly usuarios: UsuariosService,
    private readonly dataSource: DataSource,
    private readonly envios: EnviosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** PUT /envios/{id}/asignacion — idempotente. */
  asignar(envioId: number, cadeteId: number, operador: UsuarioToken) {
    return this.mutex.ejecutar(async () => {
      const envio = await this.envios.obtenerVisible(envioId, operador);

      const reasignacion = envio.estado === EstadoEnvio.ASIGNADO;
      if (!reasignacion && !transicionPermitida(envio.estado, EstadoEnvio.ASIGNADO, Rol.OPERADOR)) {
        throw new ApiError(409, 'ESTADO_INVALIDO', `No se puede asignar un envío en estado ${envio.estado}.`);
      }

      const cadete = await this.usuarios.buscarCadete(cadeteId);
      if (!cadete) {
        throw new ApiError(422, 'CADETE_INVALIDO', `El cadete ${cadeteId} no existe.`);
      }
      if (!cadete.activo) {
        throw new ApiError(422, 'CADETE_INVALIDO', `El cadete ${cadeteId} no está activo.`);
      }

      // Mismo cadete otra vez: no cambia nada, no hay historial nuevo ni segundo mail.
      if (reasignacion && envio.cadeteId === cadete.id) return this.envios.detalle(envioId);

      const ahora = new Date();
      const observacion = reasignacion
        ? `Reasignado de ${envio.cadete?.nombre ?? 'otro cadete'} a ${cadete.nombre}`
        : `Asignado a ${cadete.nombre}`;

      await this.dataSource.transaction(async (m) => {
        await m.update(Envio, envioId, {
          estado: EstadoEnvio.ASIGNADO,
          cadeteId: cadete.id,
          actualizadoEn: ahora,
        });
        await m.save(
          m.create(CambioEstado, {
            envioId,
            estado: EstadoEnvio.ASIGNADO,
            fecha: ahora,
            realizadoPorId: operador.id,
            observacion,
          }),
        );
      });

      // La reasignación no cambia el estado, así que no se avisa al cliente.
      if (!reasignacion) this.avisarAlCliente(envio, EstadoEnvio.ASIGNADO);
      return this.envios.detalle(envioId);
    });
  }

  /** POST /envios/{id}/estados — solo cadete, solo sobre sus envíos. */
  cambiarEstado(envioId: number, dto: CambioEstadoDto, cadete: UsuarioToken) {
    return this.mutex.ejecutar(async () => {
      // Para un cadete, "visible" = asignado a él; si no, 404.
      const envio = await this.envios.obtenerVisible(envioId, cadete);

      if (!transicionPermitida(envio.estado, dto.estado, Rol.CADETE)) {
        throw new ApiError(409, 'TRANSICION_INVALIDA', `No se puede pasar de ${envio.estado} a ${dto.estado}.`);
      }
      const observacion = dto.observacion?.trim() || null;
      if (dto.estado === EstadoEnvio.NO_ENTREGADO && !observacion) {
        throw new ApiError(422, 'OBSERVACION_REQUERIDA', 'Indicá el motivo por el que no se pudo entregar.');
      }

      const ahora = new Date();
      await this.dataSource.transaction(async (m) => {
        await m.update(Envio, envioId, { estado: dto.estado, actualizadoEn: ahora });
        await m.save(
          m.create(CambioEstado, {
            envioId,
            estado: dto.estado,
            fecha: ahora,
            realizadoPorId: cadete.id,
            observacion,
          }),
        );
      });

      this.avisarAlCliente(envio, dto.estado, observacion);
      return this.envios.detalle(envioId);
    });
  }

  /** Dispara el mail sin esperar al servidor SMTP; NotificacionesService nunca lanza. */
  private avisarAlCliente(envio: Envio, estado: EstadoEnvio, motivo?: string | null) {
    void this.notificaciones.notificarCambioEstado({
      envioId: envio.id,
      clienteNombre: envio.cliente.nombre,
      clienteEmail: envio.cliente.email,
      titulo: TITULO_AVISO_AL_CLIENTE[estado],
      origen: `${envio.origen.calle}, ${envio.origen.localidad}`,
      destino: `${envio.destino.calle}, ${envio.destino.localidad}`,
      destinatario: envio.destinatarioNombre,
      // Solo una no-entrega lleva motivo en el mail al cliente.
      motivo: estado === EstadoEnvio.NO_ENTREGADO ? motivo : null,
    });
  }
}
