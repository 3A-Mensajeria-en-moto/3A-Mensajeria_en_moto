import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Rol } from './rol';

/**
 * Perfil local del usuario. La identidad (contraseña, login, registro, verificación
 * de email) vive en Keycloak; acá quedan los datos que usa el negocio y el `id`
 * numérico al que apuntan las FKs de envíos.
 */
@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  /** `sub` del usuario en Keycloak. null si todavía no inició sesión (perfil precargado). */
  @Column({ type: 'varchar', length: 64, unique: true, nullable: true })
  keycloakId: string | null;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  email: string;

  /** Copia del rol de Keycloak (la fuente de verdad), actualizada en cada request. */
  @Column({ type: 'varchar', length: 20 })
  rol: Rol;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefono: string | null;

  /** false si el usuario ya no trabaja / está de licencia: no puede operar ni recibir envíos. */
  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
