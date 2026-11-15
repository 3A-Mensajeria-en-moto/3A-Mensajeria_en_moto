export interface PuntoDireccion {
  calle: string;
  localidad: string;
}

export interface ResultadoMapas {
  origen: { latitud: number; longitud: number };
  destino: { latitud: number; longitud: number };
  tiempoEstimadoMinutos: number;
}

/**
 * Puerto hacia el servicio externo de mapas/geocodificación (cobra por consulta).
 * Se consulta UNA sola vez por envío, al crearlo. Para pasar a un proveedor real
 * (Google Maps, Nominatim, etc.) alcanza con escribir otra implementación y
 * cambiar el provider en MapasModule.
 */
export abstract class ServicioMapas {
  abstract consultar(origen: PuntoDireccion, destino: PuntoDireccion): Promise<ResultadoMapas>;
}
