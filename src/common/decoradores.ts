import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Rol } from '../usuarios/rol';

export interface UsuarioToken {
  id: number;
  nombre: string;
  rol: Rol;
}

export const ES_PUBLICA = 'esPublica';
export const ROLES = 'roles';

/** Endpoint sin autenticación (hoy no hay ninguno: el login lo hace Keycloak). */
export const Public = () => SetMetadata(ES_PUBLICA, true);

/** Restringe el endpoint a uno o más roles. Sin este decorador, cualquier usuario autenticado puede entrar. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

/** Inyecta el usuario autenticado (perfil local de la identidad del token de Keycloak). */
export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioToken => ctx.switchToHttp().getRequest().usuario,
);
