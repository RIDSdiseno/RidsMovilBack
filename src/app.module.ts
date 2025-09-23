import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from './auth/auth.module';
import { TecnicoModule } from './tecnico/tecnico.module';
import { TecnicoController } from './tecnico/tecnico.controller';

@Module({
  imports: [
    PrismaModule,
    PrismaClient,
    AuthModule,
    TecnicoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
