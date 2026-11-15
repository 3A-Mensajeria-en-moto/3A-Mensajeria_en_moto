import { Column } from 'typeorm';

/** Dirección embebida en el envío (columnas origenCalle, destinoCalle, etc.). */
export class Direccion {
  @Column({ type: 'varchar', length: 200 })
  calle: string;

  @Column({ type: 'varchar', length: 100 })
  localidad: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  referencias: string | null;

  /** null si el servicio de mapas no pudo geocodificar. */
  @Column({ type: 'float', nullable: true })
  latitud: number | null;

  @Column({ type: 'float', nullable: true })
  longitud: number | null;
}
