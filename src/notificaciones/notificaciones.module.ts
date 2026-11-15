import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { NotificacionesService } from './notificaciones.service';

@Module({
  providers: [MailService, NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
