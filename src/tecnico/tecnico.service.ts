import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client'; // Ajusta la ruta
import { CreateTecnicoDto } from './tecnico.entity';

@Injectable()
export class TecnicoService {
  constructor(private prisma: PrismaClient) {}

  async create(dto: CreateTecnicoDto) {
    // Validar si el email ya existe
    const existingTecnico = await this.prisma.tecnico.findUnique({
      where: { email: dto.email },
    });

    if (existingTecnico) {
      throw new ConflictException('El correo ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const tecnico = await this.prisma.tecnico.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        passwordHash: hashedPassword,
      },
    });

    // Excluir passwordHash de la respuesta
    const { passwordHash, ...rest } = tecnico;
    return rest;
  }
}
