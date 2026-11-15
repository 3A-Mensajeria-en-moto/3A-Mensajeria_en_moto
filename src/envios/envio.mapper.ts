import { CambioEstado } from './cambio-estado.entity';
import { Direccion } from './direccion';
import { Envio } from './envio.entity';
import { Usuario } from '../usuarios/usuario.entity';

const resumen = (u: Usuario) => ({ id: u.id, nombre: u.nombre });

const direccion = (d: Direccion) => ({
  calle: d.calle,
  localidad: d.localidad,
  ...(d.referencias ? { referencias: d.referencias } : {}),
  latitud: d.latitud ?? null,
  longitud: d.longitud ?? null,
});

/** Esquema `Envio` del contrato (listados). Requiere cargadas las relaciones cliente y cadete. */
export const aEnvioDto = (e: Envio) => ({
  id: e.id,
  cliente: resumen(e.cliente),
  origen: direccion(e.origen),
  destino: direccion(e.destino),
  destinatario: {
    nombre: e.destinatarioNombre,
    ...(e.destinatarioTelefono ? { telefono: e.destinatarioTelefono } : {}),
  },
  descripcion: e.descripcion ?? null,
  estado: e.estado,
  cadete: e.cadete ? resumen(e.cadete) : null,
  tiempoEstimadoMinutos: e.tiempoEstimadoMinutos ?? null,
  creadoEn: e.creadoEn,
  actualizadoEn: e.actualizadoEn,
});

/** Esquema `CambioEstado` del contrato. Requiere cargada la relación realizadoPor. */
export const aCambioEstadoDto = (c: CambioEstado) => ({
  estado: c.estado,
  fecha: c.fecha,
  realizadoPor: resumen(c.realizadoPor),
  observacion: c.observacion ?? null,
});

/** Esquema `EnvioDetalle` del contrato (envío + historial). */
export const aEnvioDetalleDto = (e: Envio, historial: CambioEstado[]) => ({
  ...aEnvioDto(e),
  historial: historial.map(aCambioEstadoDto),
});
