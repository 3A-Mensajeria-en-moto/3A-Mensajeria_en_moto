import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PREFIJO_API } from '../common/config';
import { Roles, UsuarioActual, UsuarioToken } from '../common/decoradores';
import { noEncontrado } from '../common/errores';
import { Rol } from '../usuarios/rol';
import {
  AsignacionDto,
  CambioEstadoDto,
  CrearEnvioDto,
  ListarEnviosQuery,
} from './dto/envios.dto';
import { EnviosService } from './envios.service';
import { EstadosService } from './estados.service';

/** Un id que no es número no puede existir: 404, igual que un id inexistente. */
const IdEnvio = () =>
  Param('envioId', new ParseIntPipe({ exceptionFactory: () => noEncontrado('El envío no existe.') }));

@Controller('envios')
export class EnviosController {
  constructor(
    private readonly envios: EnviosService,
    private readonly estados: EstadosService,
  ) {}

  @Get()
  listar(@Query() query: ListarEnviosQuery, @UsuarioActual() usuario: UsuarioToken) {
    return this.envios.listar(query, usuario);
  }

  @Post()
  @Roles(Rol.CLIENTE)
  async crear(
    @Body() dto: CrearEnvioDto,
    @UsuarioActual() usuario: UsuarioToken,
    @Res({ passthrough: true }) res: Response,
  ) {
    const envio = await this.envios.crear(dto, usuario);
    res.setHeader('Location', `/${PREFIJO_API}/envios/${envio.id}`);
    return envio; // 201
  }

  @Get(':envioId')
  obtener(@IdEnvio() id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.envios.consultar(id, usuario);
  }

  @Put(':envioId/asignacion')
  @Roles(Rol.OPERADOR)
  @HttpCode(200)
  asignar(
    @IdEnvio() id: number,
    @Body() dto: AsignacionDto,
    @UsuarioActual() usuario: UsuarioToken,
  ) {
    return this.estados.asignar(id, dto.cadeteId, usuario);
  }

  @Get(':envioId/estados')
  historial(@IdEnvio() id: number, @UsuarioActual() usuario: UsuarioToken) {
    return this.envios.historial(id, usuario);
  }

  @Post(':envioId/estados')
  @Roles(Rol.CADETE)
  async cambiarEstado(
    @IdEnvio() id: number,
    @Body() dto: CambioEstadoDto,
    @UsuarioActual() usuario: UsuarioToken,
    @Res({ passthrough: true }) res: Response,
  ) {
    const envio = await this.estados.cambiarEstado(id, dto, usuario);
    res.setHeader('Location', `/${PREFIJO_API}/envios/${id}/estados`);
    return envio; // 201
  }
}
