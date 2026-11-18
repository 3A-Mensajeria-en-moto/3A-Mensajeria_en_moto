import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { CadetesModule } from './cadetes/cadetes.module';
import { RolesGuard } from './common/guards';
import { EnviosModule } from './envios/envios.module';
import { MapasModule } from './mapas/mapas.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { SeedModule } from './seed/seed.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env: Record<string, unknown>) => {
        if (!env.KEYCLOAK_ISSUER) {
          if (env.NODE_ENV === 'production') {
            throw new Error('Falta la variable KEYCLOAK_ISSUER (obligatoria en producción).');
          }
          new Logger('Config').warn(
            'KEYCLOAK_ISSUER no definido: se usa el Keycloak local de docker-compose (http://localhost:8180).',
          );
        }
        return {
          ...env,
          KEYCLOAK_ISSUER: env.KEYCLOAK_ISSUER || 'http://localhost:8180/realms/mensajeria',
          KEYCLOAK_AUDIENCE: env.KEYCLOAK_AUDIENCE || 'mensajeria-api',
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = config.get<string>('DB_PATH') ?? 'data/mensajeria.sqlite';
        const enMemoria = database === ':memory:';
        if (!enMemoria) mkdirSync(dirname(database), { recursive: true });
        return {
          type: 'better-sqlite3' as const,
          database,
          autoLoadEntities: true,
          // Simple para v0.1. Antes de producción conviene pasar a migraciones.
          synchronize: true,
          enableWAL: !enMemoria,
        };
      },
    }),
    AuthModule,
    UsuariosModule,
    MapasModule,
    NotificacionesModule,
    EnviosModule,
    CadetesModule,
    SeedModule,
  ],
  providers: [
    // Orden importante: primero autenticar, después autorizar por rol.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
