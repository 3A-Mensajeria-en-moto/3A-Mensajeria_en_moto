import { Rol } from '../usuarios/rol';

export enum EstadoEnvio {
  PENDIENTE = 'PENDIENTE',
  ASIGNADO = 'ASIGNADO',
  RETIRADO = 'RETIRADO',
  EN_CAMINO = 'EN_CAMINO',
  ENTREGADO = 'ENTREGADO',
  NO_ENTREGADO = 'NO_ENTREGADO',
}

export interface Transicion {
  desde: EstadoEnvio;
  hacia: EstadoEnvio;
  /** Rol que puede ejecutar el cambio. */
  rol: Rol;
}

/**
 * ÚNICA fuente de verdad de las transiciones permitidas (ver `EstadoEnvio` en el contrato).
 * Para agregar un estado nuevo (ej. DEMORADO): sumarlo al enum y agregar sus filas acá.
 */
export const TRANSICIONES: readonly Transicion[] = [
  { desde: EstadoEnvio.PENDIENTE, hacia: EstadoEnvio.ASIGNADO, rol: Rol.OPERADOR },
  { desde: EstadoEnvio.ASIGNADO, hacia: EstadoEnvio.RETIRADO, rol: Rol.CADETE },
  { desde: EstadoEnvio.ASIGNADO, hacia: EstadoEnvio.NO_ENTREGADO, rol: Rol.CADETE },
  { desde: EstadoEnvio.RETIRADO, hacia: EstadoEnvio.EN_CAMINO, rol: Rol.CADETE },
  { desde: EstadoEnvio.EN_CAMINO, hacia: EstadoEnvio.ENTREGADO, rol: Rol.CADETE },
  { desde: EstadoEnvio.EN_CAMINO, hacia: EstadoEnvio.NO_ENTREGADO, rol: Rol.CADETE },
];

export const transicionPermitida = (desde: EstadoEnvio, hacia: EstadoEnvio, rol: Rol) =>
  TRANSICIONES.some((t) => t.desde === desde && t.hacia === hacia && t.rol === rol);

export const ESTADOS_FINALES: readonly EstadoEnvio[] = [
  EstadoEnvio.ENTREGADO,
  EstadoEnvio.NO_ENTREGADO,
];

/** Asignados al cadete y todavía sin terminar. */
export const ESTADOS_ACTIVOS: readonly EstadoEnvio[] = [
  EstadoEnvio.ASIGNADO,
  EstadoEnvio.RETIRADO,
  EstadoEnvio.EN_CAMINO,
];

/** Título del mail que recibe el cliente cuando el envío pasa a cada estado. */
export const TITULO_AVISO_AL_CLIENTE: Record<EstadoEnvio, string> = {
  [EstadoEnvio.PENDIENTE]: 'Recibimos tu pedido de envío',
  [EstadoEnvio.ASIGNADO]: 'Tu envío fue asignado a un cadete',
  [EstadoEnvio.RETIRADO]: 'El cadete ya retiró tu paquete',
  [EstadoEnvio.EN_CAMINO]: 'Tu envío está en camino',
  [EstadoEnvio.ENTREGADO]: 'Tu envío fue entregado',
  [EstadoEnvio.NO_ENTREGADO]: 'No pudimos entregar tu envío',
};

/** Estados que puede marcar un cadete con POST /envios/{id}/estados. */
export const ESTADOS_DEL_CADETE: readonly EstadoEnvio[] = [
  EstadoEnvio.RETIRADO,
  EstadoEnvio.EN_CAMINO,
  EstadoEnvio.ENTREGADO,
  EstadoEnvio.NO_ENTREGADO,
];
