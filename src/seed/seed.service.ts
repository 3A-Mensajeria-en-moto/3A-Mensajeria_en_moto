import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Rol } from '../usuarios/rol';
import { UsuariosService } from '../usuarios/usuarios.service';

const PASSWORD_DEMO = 'secreto123';

/**
 * Carga usuarios de ejemplo si la base está vacía y SEED_DEMO != 'false'.
 * SOLO PARA DESARROLLO: en producción poner SEED_DEMO=false y crear los usuarios
 * reales con `npm run usuario:crear`.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Seed');

  constructor(
    private readonly usuarios: UsuariosService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const habilitado = (this.config.get('SEED_DEMO') ?? 'true') !== 'false';
    if (!habilitado || (await this.usuarios.contar()) > 0) return;

    const demo = [
      { nombre: 'Operador Central', email: 'operador@mensajeria.com', rol: Rol.OPERADOR },
      { nombre: 'Estudio Contable Pérez', email: 'contacto@estudioperez.com', rol: Rol.CLIENTE },
      { nombre: 'Librería Norte', email: 'libreria@norte.com', rol: Rol.CLIENTE },
      { nombre: 'Juan Pérez', email: 'juan@mensajeria.com', rol: Rol.CADETE, telefono: '+54 11 4444-9876' },
      { nombre: 'Lucía Fernández', email: 'lucia@mensajeria.com', rol: Rol.CADETE, telefono: '+54 11 4444-1122' },
      { nombre: 'Marcos Díaz', email: 'marcos@mensajeria.com', rol: Rol.CADETE, telefono: '+54 11 4444-3344' },
    ];
    for (const u of demo) await this.usuarios.crear({ ...u, password: PASSWORD_DEMO });
    this.logger.warn(
      `Se cargaron ${demo.length} usuarios de DEMO (contraseña "${PASSWORD_DEMO}"). No usar en producción.`,
    );
  }
}
