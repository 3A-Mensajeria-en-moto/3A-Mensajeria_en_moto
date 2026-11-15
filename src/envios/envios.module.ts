import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MapasModule } from '../mapas/mapas.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { CambioEstado } from './cambio-estado.entity';
import { Envio } from './envio.entity';
import { EnviosController } from './envios.controller';
import { EnviosService } from './envios.service';
import { EstadosService } from './estados.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Envio, CambioEstado]),
    UsuariosModule,
    MapasModule,
    NotificacionesModule,
  ],
  controllers: [EnviosController],
  providers: [EnviosService, EstadosService],
  exports: [EnviosService], // puerta de entrada para otros módulos (ej. cadetes)
})
export class EnviosModule {}
