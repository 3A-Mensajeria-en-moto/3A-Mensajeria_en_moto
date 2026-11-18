import { JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';

/** Lo que el backend necesita saber de la identidad que emitió Keycloak. */
export interface Identidad {
  /** `sub` del token: id estable del usuario en Keycloak. */
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
  /** Roles de realm (`realm_access.roles`). */
  roles: string[];
}

export interface OpcionesVerificador {
  /** `iss` esperado (URL pública del realm, la que ve el navegador). */
  issuer: string;
  /** `aud` esperado (lo agrega el mapper de audiencia del cliente en Keycloak). */
  audience: string;
}

/**
 * Valida un access token OIDC y extrae la identidad.
 * Es una clase abstracta para poder inyectarla y reemplazarla en tests.
 */
export abstract class VerificadorTokens {
  abstract verificar(token: string): Promise<Identidad>;
}

/** Verifica la firma contra las claves públicas (JWKS) del realm, más issuer, audiencia y vencimiento. */
export class VerificadorJwt extends VerificadorTokens {
  constructor(
    private readonly claves: JWTVerifyGetKey,
    private readonly opciones: OpcionesVerificador,
  ) {
    super();
  }

  /** JWKS remoto: jose lo cachea y lo vuelve a pedir cuando aparece un `kid` nuevo (rotación de claves). */
  static remoto(jwksUrl: string, opciones: OpcionesVerificador) {
    return new VerificadorJwt(createRemoteJWKSet(new URL(jwksUrl)), opciones);
  }

  async verificar(token: string): Promise<Identidad> {
    const { payload } = await jwtVerify(token, this.claves, {
      issuer: this.opciones.issuer,
      audience: this.opciones.audience,
      algorithms: ['RS256'],
    });
    const p = payload as Record<string, any>;
    if (!payload.sub || typeof p.email !== 'string' || !p.email) {
      throw new Error('El token no tiene sub o email.');
    }
    const nombre =
      p.name ||
      [p.given_name, p.family_name].filter(Boolean).join(' ') ||
      p.preferred_username ||
      p.email;
    return {
      sub: payload.sub,
      email: p.email,
      emailVerificado: p.email_verified === true,
      nombre: String(nombre).slice(0, 100),
      roles: Array.isArray(p.realm_access?.roles) ? p.realm_access.roles : [],
    };
  }
}
