import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { VerificadorJwt, VerificadorTokens } from './verificador-tokens';

@Global()
@Module({
  imports: [UsuariosModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    {
      provide: VerificadorTokens,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const issuer = config.getOrThrow<string>('KEYCLOAK_ISSUER');
        return VerificadorJwt.remoto(
          // En Docker el backend llega a Keycloak por la red interna, pero el `iss` del token
          // es la URL pública: por eso la URL de las claves se puede configurar aparte.
          config.get<string>('KEYCLOAK_JWKS_URL') || `${issuer}/protocol/openid-connect/certs`,
          { issuer, audience: config.getOrThrow<string>('KEYCLOAK_AUDIENCE') },
        );
      },
    },
  ],
  exports: [AuthGuard, VerificadorTokens],
})
export class AuthModule {}
