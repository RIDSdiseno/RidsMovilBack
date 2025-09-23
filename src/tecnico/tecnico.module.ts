import { Module } from '@nestjs/common';
import { TecnicoService } from './tecnico.service';
import { TecnicoController } from './tecnico.controller';
import { PrismaClient } from '@prisma/client';

@Module({
    controllers: [TecnicoController],
    providers: [TecnicoService, PrismaClient],
    exports: [TecnicoService],
})
export class TecnicoModule {}
