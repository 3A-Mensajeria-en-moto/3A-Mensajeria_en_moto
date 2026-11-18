/**
 * "Keycloak de mentira" para los tests: un par de claves RSA propio que firma
 * access tokens con la misma forma que los de Keycloak. La app los valida con el
 * verificador real (firma, issuer, audiencia, vencimiento), solo cambia de dónde
 * salen las claves públicas.
 */
import { JWK, KeyLike, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { VerificadorJwt } from '../src/auth/verificador-tokens';

export const ISSUER = process.env.KEYCLOAK_ISSUER!;
export const AUDIENCE = process.env.KEYCLOAK_AUDIENCE!;

export interface DatosToken {
  sub: string;
  email: string;
  nombre: string;
  roles: string[];
  emailVerificado?: boolean;
  issuer?: string;
  audience?: string;
  expiraEn?: string | number;
}

export class EmisorTokens {
  private constructor(
    private readonly privada: KeyLike,
    private readonly jwk: JWK,
  ) {}

  static async crear() {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    return new EmisorTokens(privateKey, { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' });
  }

  /** Verificador que la app usa en lugar del JWKS remoto de Keycloak. */
  verificador() {
    return new VerificadorJwt(createLocalJWKSet({ keys: [this.jwk] }), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  }

  firmar(d: DatosToken, clave: KeyLike = this.privada) {
    return new SignJWT({
      email: d.email,
      email_verified: d.emailVerificado ?? true,
      name: d.nombre,
      preferred_username: d.email,
      realm_access: { roles: [...d.roles, 'offline_access', 'default-roles-mensajeria'] },
      azp: 'mensajeria-frontend',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test', typ: 'JWT' })
      .setSubject(d.sub)
      .setIssuer(d.issuer ?? ISSUER)
      .setAudience(d.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(d.expiraEn ?? '5m')
      .sign(clave);
  }
}
