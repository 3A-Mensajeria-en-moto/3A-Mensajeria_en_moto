import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity';
import { Direccion } from './direccion';
import { EstadoEnvio } from './estado-envio';

@Entity('envios')
export class Envio {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'integer' })
  clienteId: number;

  @ManyToOne(() => Usuario, { nullable: false })
  @JoinColumn({ name: 'clienteId' })
  cliente: Usuario;

  @Column(() => Direccion, { prefix: 'origen' })
  origen: Direccion;

  @Column(() => Direccion, { prefix: 'destino' })
  destino: Direccion;

  @Column({ type: 'varchar', length: 100 })
  destinatarioNombre: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  destinatarioTelefono: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  descripcion: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  estado: EstadoEnvio;

  @Index()
  @Column({ type: 'integer', nullable: true })
  cadeteId: number | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'cadeteId' })
  cadete: Usuario | null;

  /** Calculado una sola vez al crear (el servicio de mapas cobra por consulta). */
  @Column({ type: 'integer', nullable: true })
  tiempoEstimadoMinutos: number | null;

  @Column({ type: 'datetime' })
  creadoEn: Date;

  @Column({ type: 'datetime' })
  actualizadoEn: Date;
}
