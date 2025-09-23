// src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const tecnico = await this.prisma.tecnico.findUnique({
      where: { email: loginDto.email }
    });

    if (!tecnico) throw new UnauthorizedException('Credenciales inválidas');

    const isMatch = await bcrypt.compare(loginDto.password, tecnico.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Credenciales inválidas');

    const payload = { sub: tecnico.id, email: tecnico.email };

    return {
      access_token: this.jwtService.sign(payload),
      tecnico: {
        id: tecnico.id,
        nombre: tecnico.nombre,
        email: tecnico.email
      }
    };
  }
  
}
