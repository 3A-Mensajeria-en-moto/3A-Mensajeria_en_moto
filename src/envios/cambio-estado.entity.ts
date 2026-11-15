import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity';
import { Envio } from './envio.entity';
import { EstadoEnvio } from './estado-envio';

/** Una fila del historial del envío. */
@Entity('cambios_estado')
export class CambioEstado {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'integer' })
  envioId: number;

  @ManyToOne(() => Envio, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envioId' })
  envio: Envio;

  @Column({ type: 'varchar', length: 20 })
  estado: EstadoEnvio;

  @Column({ type: 'datetime' })
  fecha: Date;

  @Column({ type: 'integer' })
  realizadoPorId: number;

  @ManyToOne(() => Usuario, { nullable: false })
  @JoinColumn({ name: 'realizadoPorId' })
  realizadoPor: Usuario;

  @Column({ type: 'varchar', length: 300, nullable: true })
  observacion: string | null;
}
