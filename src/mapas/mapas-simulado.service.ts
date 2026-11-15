import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PuntoDireccion, ResultadoMapas, ServicioMapas } from './servicio-mapas';

/**
 * Simulación del servicio de mapas (el enunciado pide simular el sistema externo).
 * Genera coordenadas deterministas alrededor de CABA a partir de la dirección y
 * estima el tiempo con la distancia en línea recta.
 */
@Injectable()
export class MapasSimuladoService extends ServicioMapas {
  async consultar(origen: PuntoDireccion, destino: PuntoDireccion): Promise<ResultadoMapas> {
    const o = this.geocodificar(origen);
    const d = this.geocodificar(destino);
    const km = this.distanciaKm(o, d);
    return {
      origen: o,
      destino: d,
      tiempoEstimadoMinutos: Math.max(5, Math.round(5 + km * 4)),
    };
  }

  private geocodificar(p: PuntoDireccion) {
    const hash = createHash('sha1').update(`${p.calle}|${p.localidad}`.toLowerCase()).digest();
    const lat = -34.6 + (hash.readUInt16BE(0) / 65535 - 0.5) * 0.12;
    const lng = -58.45 + (hash.readUInt16BE(2) / 65535 - 0.5) * 0.12;
    return { latitud: Number(lat.toFixed(6)), longitud: Number(lng.toFixed(6)) };
  }

  private distanciaKm(a: { latitud: number; longitud: number }, b: { latitud: number; longitud: number }) {
    const R = 6371;
    const rad = (x: number) => (x * Math.PI) / 180;
    const dLat = rad(b.latitud - a.latitud);
    const dLng = rad(b.longitud - a.longitud);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
}
