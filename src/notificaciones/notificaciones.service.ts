import { Injectable, Logger } from '@nestjs/common';
import { MailService } from './mail.service';

export interface DatosNotificacion {
  envioId: number;
  clienteNombre: string;
  clienteEmail: string;
  /** Qué le pasó al envío, en una frase (ej. "Tu envío está en camino"). Lo decide quien notifica. */
  titulo: string;
  origen: string;
  destino: string;
  destinatario: string;
  /** Si viene, se agrega al mail (ej. el motivo de una no-entrega). */
  motivo?: string | null;
}

/**
 * Notificaciones internas (no se exponen como endpoints).
 * Nunca lanza: si el mail falla, el cambio de estado ya quedó registrado y
 * solo se deja el error en el log.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger('Notificaciones');

  constructor(private readonly mail: MailService) {}

  async notificarCambioEstado(d: DatosNotificacion): Promise<void> {
    const lineas = [
      `Hola ${d.clienteNombre},`,
      '',
      `${d.titulo}.`,
      '',
      `Envío #${d.envioId}`,
      `Desde: ${d.origen}`,
      `Hasta: ${d.destino}`,
      `Destinatario: ${d.destinatario}`,
    ];
    if (d.motivo) {
      lineas.push('', `Motivo: ${d.motivo}`);
    }
    lineas.push('', 'Mensajería de Barrio');
    try {
      await this.mail.enviar({
        para: d.clienteEmail,
        asunto: `Envío #${d.envioId}: ${d.titulo}`,
        texto: lineas.join('\n'),
      });
    } catch (err) {
      this.logger.error(
        `No se pudo enviar el mail del envío #${d.envioId} a ${d.clienteEmail}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
