import { Controller, Get } from '@nestjs/common';
import { UsuarioActual, UsuarioToken } from '../common/decoradores';
import { AuthService } from './auth.service';

/**
 * El login lo resuelve Keycloak (OIDC, Authorization Code + PKCE desde el frontend).
 * Acá solo queda consultar el perfil local del usuario dueño del token.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  me(@UsuarioActual() usuario: UsuarioToken) {
    return this.auth.me(usuario.id);
  }
}
