/**
 * Precarga el perfil local de un usuario (ej. el teléfono de un cadete nuevo).
 *
 * La cuenta en sí (email, contraseña, rol) se crea en Keycloak: consola de admin
 * → realm "mensajeria" → Users, o el propio usuario se registra desde el login.
 * Este perfil se vincula con esa cuenta por email la primera vez que inicia sesión.
 * Hacerlo es opcional: si el usuario entra sin perfil precargado, se crea solo.
 *
 *   npm run build
 *   npm run usuario:crear -- --nombre "Juan Pérez" --email juan@x.com --rol CADETE [--telefono "+54 11 ..."]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Rol } from '../usuarios/rol';
import { UsuariosService } from '../usuarios/usuarios.service';

function args(): Record<string, string> {
  const salida: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) salida[a[i].replace(/^--/, '')] = a[i + 1];
  return salida;
}

async function main() {
  const { nombre, email, rol, telefono } = args();
  if (!nombre || !email || !rol) {
    console.error('Uso: --nombre <n> --email <e> --rol CLIENTE|OPERADOR|CADETE [--telefono <t>]');
    process.exit(1);
  }
  if (!Object.values(Rol).includes(rol as Rol)) {
    console.error(`Rol inválido: ${rol}`);
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const usuarios = app.get(UsuariosService);
  if (await usuarios.buscarPorEmail(email)) {
    console.error(`Ya existe un usuario con el email ${email}.`);
    await app.close();
    process.exit(1);
  }
  const u = await usuarios.crear({ nombre, email, rol: rol as Rol, telefono });
  console.log(`Perfil creado: #${u.id} ${u.nombre} <${u.email}> (${u.rol})`);
  console.log('Acordate de crear la cuenta en Keycloak con el mismo email y el rol correspondiente.');
  await app.close();
}
main();
