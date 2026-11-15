import { Module } from '@nestjs/common';
import { MapasSimuladoService } from './mapas-simulado.service';
import { ServicioMapas } from './servicio-mapas';

@Module({
  providers: [{ provide: ServicioMapas, useClass: MapasSimuladoService }],
  exports: [ServicioMapas],
})
export class MapasModule {}
