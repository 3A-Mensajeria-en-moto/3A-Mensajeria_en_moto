import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Rol } from './rol';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20 })
  rol: Rol;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefono: string | null;

  /** false si el usuario ya no trabaja / está de licencia: no puede loguearse ni recibir envíos. */
  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
