import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Public, UsuarioActual, UsuarioToken } from '../common/decoradores';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@UsuarioActual() usuario: UsuarioToken) {
    return this.auth.me(usuario.id);
  }
}
