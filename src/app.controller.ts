// app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service'; // ✅ ajusta la ruta si es necesario

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService, // ✅ esta es la dependencia que falla
  ) {}

  @Get()
  async getUsers() {
    return this.prisma.tecnico.findMany();
  }
}
