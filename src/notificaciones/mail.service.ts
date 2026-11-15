import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MensajeMail {
  para: string;
  asunto: string;
  texto: string;
}

/**
 * Envío de mails. Con SMTP_HOST configurado usa SMTP real; sin él (desarrollo)
 * escribe el mail en el log para poder ver qué se enviaría.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: nodemailer.Transporter | null;
  private readonly remitente: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.remitente = config.get<string>('MAIL_FROM') ?? 'Mensajería de Barrio <no-reply@localhost>';
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(config.get('SMTP_PORT') ?? 587),
          auth: config.get('SMTP_USER')
            ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') }
            : undefined,
        })
      : null;
  }

  async enviar(mensaje: MensajeMail): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`(simulado) Para: ${mensaje.para} | Asunto: ${mensaje.asunto}\n${mensaje.texto}`);
      return;
    }
    await this.transporter.sendMail({
      from: this.remitente,
      to: mensaje.para,
      subject: mensaje.asunto,
      text: mensaje.texto,
    });
  }
}
