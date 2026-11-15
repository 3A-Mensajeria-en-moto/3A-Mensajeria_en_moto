import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Rol } from './rol';
import { Usuario } from './usuario.entity';

export interface NuevoUsuario {
  nombre: string;
  email: string;
  password: string;
  rol: Rol;
  telefono?: string | null;
}

@Injectable()
export class UsuariosService {
  constructor(@InjectRepository(Usuario) private readonly repo: Repository<Usuario>) {}

  buscarPorEmail(email: string) {
    return this.repo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  buscarPorId(id: number) {
    return this.repo.findOne({ where: { id } });
  }

  /** El cadete con ese id, sea cual sea su estado (activo o no). null si no existe o no es cadete. */
  buscarCadete(id: number) {
    return this.repo.findOne({ where: { id, rol: Rol.CADETE } });
  }

  /** Cadetes ordenados por nombre. */
  listarCadetes(soloActivos: boolean) {
    return this.repo.find({
      where: { rol: Rol.CADETE, ...(soloActivos ? { activo: true } : {}) },
      order: { nombre: 'ASC' },
    });
  }

  contar() {
    return this.repo.count();
  }

  async crear(datos: NuevoUsuario): Promise<Usuario> {
    const usuario = this.repo.create({
      nombre: datos.nombre,
      email: datos.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(datos.password, 10),
      rol: datos.rol,
      telefono: datos.telefono ?? null,
      activo: true,
    });
    return this.repo.save(usuario);
  }
}
