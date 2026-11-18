import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Rol } from '../usuarios/rol';
import { UsuariosService } from '../usuarios/usuarios.service';

/**
 * Carga los perfiles de ejemplo si la base está vacía y SEED_DEMO != 'false'.
 * Las cuentas (con contraseña "secreto123") están en el realm de Keycloak
 * (keycloak/realm-mensajeria.json); acá solo van los datos de negocio (teléfono,
 * y que los cadetes aparezcan en la lista aunque todavía no hayan entrado nunca).
 * Cada perfil se vincula con su cuenta de Keycloak por email en el primer login.
 * SOLO PARA DESARROLLO: en producción poner SEED_DEMO=false.
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
    for (const u of demo) await this.usuarios.crear(u);
    this.logger.warn(
      `Se cargaron ${demo.length} perfiles de DEMO (las cuentas están en el realm de Keycloak). No usar en producción.`,
    );
  }
}
