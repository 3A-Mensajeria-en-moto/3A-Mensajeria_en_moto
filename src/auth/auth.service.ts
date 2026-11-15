import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ApiError } from '../common/errores';
import { Usuario } from '../usuarios/usuario.entity';
import { UsuariosService } from '../usuarios/usuarios.service';

export const aUsuarioDto = (u: Usuario) => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
});

// Hash de relleno: compara siempre contra algo para que el tiempo de respuesta
// no revele si el email existe.
const HASH_FALSO = bcrypt.hashSync('relleno-no-valido', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly usuarios: UsuariosService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const usuario = await this.usuarios.buscarPorEmail(email);
    const ok = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_FALSO);
    if (!usuario || !ok || !usuario.activo) {
      throw new ApiError(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }
    const expiraEn = Number(this.config.get('JWT_EXPIRA_SEGUNDOS') ?? 28800);
    const token = await this.jwt.signAsync(
      { sub: String(usuario.id), rol: usuario.rol, nombre: usuario.nombre },
      { expiresIn: expiraEn },
    );
    return { token, expiraEn, usuario: aUsuarioDto(usuario) };
  }

  async me(id: number) {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario || !usuario.activo) {
      throw new ApiError(401, 'NO_AUTENTICADO', 'Token inválido o expirado.');
    }
    return aUsuarioDto(usuario);
  }
}
