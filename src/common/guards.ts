import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from './errores';
import { ROLES, UsuarioToken } from './decoradores';
import { Rol } from '../usuarios/rol';

/** Autoriza según @Roles(...). Corre después de AuthGuard (módulo auth), que deja `req.usuario`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[]>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!requeridos?.length) return true;
    const usuario: UsuarioToken | undefined = ctx.switchToHttp().getRequest().usuario;
    if (!usuario || !requeridos.includes(usuario.rol)) {
      throw new ApiError(
        403,
        'SIN_PERMISO',
        `Esta operación requiere rol ${requeridos.join(' o ')}.`,
      );
    }
    return true;
  }
}
