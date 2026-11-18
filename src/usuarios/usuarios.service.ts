import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rol } from './rol';
import { Usuario } from './usuario.entity';

export interface NuevoUsuario {
  nombre: string;
  email: string;
  rol: Rol;
  telefono?: string | null;
}

/** Datos de la identidad de Keycloak que se reflejan en el perfil local. */
export interface IdentidadSincronizable {
  keycloakId: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
  rol: Rol;
}

export type ResultadoSincronizacion =
  | { ok: true; usuario: Usuario }
  /** EMAIL_NO_VERIFICADO: el email coincide con un perfil existente pero Keycloak no lo verificó.
   *  EMAIL_DUPLICADO: el usuario cambió su email en Keycloak a uno que ya usa otro perfil. */
  | { ok: false; motivo: 'EMAIL_NO_VERIFICADO' | 'EMAIL_DUPLICADO' };

const normalizarEmail = (email: string) => email.trim().toLowerCase();

@Injectable()
export class UsuariosService {
  /** Serializa la sincronización para que dos requests del primer login no creen el perfil dos veces. */
  private cola: Promise<unknown> = Promise.resolve();

  constructor(@InjectRepository(Usuario) private readonly repo: Repository<Usuario>) {}

  buscarPorEmail(email: string) {
    return this.repo.findOne({ where: { email: normalizarEmail(email) } });
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

  /** Perfil precargado (seed / CLI): se vincula con Keycloak la primera vez que el usuario inicia sesión. */
  async crear(datos: NuevoUsuario): Promise<Usuario> {
    const usuario = this.repo.create({
      keycloakId: null,
      nombre: datos.nombre,
      email: normalizarEmail(datos.email),
      rol: datos.rol,
      telefono: datos.telefono ?? null,
      activo: true,
    });
    return this.repo.save(usuario);
  }

  /**
   * Devuelve el perfil local de la identidad de Keycloak, creándolo o vinculándolo si hace falta:
   * 1. Busca por `sub` (usuario que ya entró antes).
   * 2. Si no, busca por email, solo si Keycloak lo verificó (perfil precargado o realm recreado).
   *    Sin esa condición, cualquiera podría registrarse con el email de otro y quedarse con su perfil.
   * 3. Si no existe, lo crea (alta en el primer login).
   * Nombre, email y rol se copian de Keycloak, que es la fuente de verdad.
   */
  async sincronizarIdentidad(id: IdentidadSincronizable): Promise<ResultadoSincronizacion> {
    const email = normalizarEmail(id.email);
    const alDia = (u: Usuario) => u.email === email && u.nombre === id.nombre && u.rol === id.rol;

    // Camino rápido (casi todos los requests): ya vinculado y sin cambios, sin hacer cola.
    const actual = await this.repo.findOne({ where: { keycloakId: id.keycloakId } });
    if (actual && alDia(actual)) return { ok: true, usuario: actual };

    return this.enCola(async (): Promise<ResultadoSincronizacion> => {
      let usuario = await this.repo.findOne({ where: { keycloakId: id.keycloakId } });
      if (usuario && alDia(usuario)) return { ok: true, usuario }; // lo sincronizó otro request mientras esperaba

      if (!usuario) {
        const porEmail = await this.repo.findOne({ where: { email } });
        if (porEmail && !id.emailVerificado) return { ok: false, motivo: 'EMAIL_NO_VERIFICADO' };
        usuario = porEmail ?? this.repo.create({ telefono: null, activo: true });
      } else if (email !== usuario.email && (await this.repo.findOne({ where: { email } }))) {
        // Cambió el email en Keycloak a uno que ya tiene otro perfil local.
        return { ok: false, motivo: 'EMAIL_DUPLICADO' };
      }

      Object.assign(usuario, { keycloakId: id.keycloakId, email, nombre: id.nombre, rol: id.rol });
      return { ok: true, usuario: await this.repo.save(usuario) };
    });
  }

  /**
   * Ejecuta de a una por vez (mismo patrón que common/mutex, que este módulo no puede
   * importar porque common depende de usuarios/rol).
   */
  private enCola<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(fn);
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }
}
