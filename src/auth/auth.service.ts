import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/errores';
import { Usuario } from '../usuarios/usuario.entity';
import { UsuariosService } from '../usuarios/usuarios.service';

export const aUsuarioDto = (u: Usuario) => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
});

@Injectable()
export class AuthService {
  constructor(private readonly usuarios: UsuariosService) {}

  async me(id: number) {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario || !usuario.activo) {
      throw new ApiError(401, 'NO_AUTENTICADO', 'Token inválido o expirado.');
    }
    return aUsuarioDto(usuario);
  }
}
