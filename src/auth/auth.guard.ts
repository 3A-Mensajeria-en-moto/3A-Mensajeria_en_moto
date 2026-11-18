import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ES_PUBLICA, UsuarioToken } from '../common/decoradores';
import { ApiError } from '../common/errores';
import { Rol } from '../usuarios/rol';
import { UsuariosService } from '../usuarios/usuarios.service';
import { Identidad, VerificadorTokens } from './verificador-tokens';

/**
 * Si un usuario tiene más de un rol de la app en Keycloak, gana el de más privilegio.
 * (Todos reciben CLIENTE por defecto al registrarse; para hacer a alguien cadete u
 * operador alcanza con agregarle ese rol en Keycloak.)
 */
const PRIORIDAD_ROLES = [Rol.OPERADOR, Rol.CADETE, Rol.CLIENTE];

/**
 * Valida el access token de Keycloak del header Authorization, sincroniza el
 * perfil local del usuario y lo deja en `req.usuario`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verificador: VerificadorTokens,
    private readonly usuarios: UsuariosService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(ES_PUBLICA, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (esPublica) return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = String(req.headers.authorization ?? '').split(' ');
    if (tipo?.toLowerCase() !== 'bearer' || !token) {
      throw new ApiError(401, 'NO_AUTENTICADO', 'Falta el token de autenticación.');
    }

    let identidad: Identidad;
    try {
      identidad = await this.verificador.verificar(token);
    } catch {
      throw new ApiError(401, 'NO_AUTENTICADO', 'Token inválido o expirado.');
    }

    const rol = PRIORIDAD_ROLES.find((r) => identidad.roles.includes(r));
    if (!rol) {
      throw new ApiError(403, 'SIN_PERMISO', 'Tu usuario no tiene un rol asignado en el sistema.');
    }

    const r = await this.usuarios.sincronizarIdentidad({
      keycloakId: identidad.sub,
      email: identidad.email,
      emailVerificado: identidad.emailVerificado,
      nombre: identidad.nombre,
      rol,
    });
    if (!r.ok) {
      throw r.motivo === 'EMAIL_NO_VERIFICADO'
        ? new ApiError(403, 'EMAIL_NO_VERIFICADO', 'Verificá tu email para poder usar tu cuenta.')
        : new ApiError(409, 'CONFLICTO', 'Ya hay otro usuario con ese email.');
    }
    const usuario = r.usuario;
    if (!usuario.activo) {
      throw new ApiError(403, 'USUARIO_INACTIVO', 'Tu usuario está desactivado. Hablá con el operador.');
    }

    const datos: UsuarioToken = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
    req.usuario = datos;
    return true;
  }
}
