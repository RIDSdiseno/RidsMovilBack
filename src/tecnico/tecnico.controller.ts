import { Body, Controller, Post, Res } from '@nestjs/common';
import { TecnicoService } from './tecnico.service';
import { CreateTecnicoDto } from './tecnico.entity';
import type { Response } from 'express';
import { PrismaClient } from '@prisma/client';

@Controller('tecnicos')
export class TecnicoController {
  constructor(private readonly tecnicoService: TecnicoService,private readonly prisma:PrismaClient) {}

  @Post()
  async create(@Body() dto: CreateTecnicoDto, @Res() res:Response) {
    try{
        const email = dto.email;
        const tecnicoExists = await this.prisma.tecnico.findUnique({where:{email}}); 
        if(!tecnicoExists){
        const tecnico = await this.tecnicoService.create(dto);
        return res.status(201).json(tecnico)
        }
        else{
            return res.status(400).json({message:"El correo ya existe"})
        }
        
    }catch(e){
        return res.status(500).json({message: 'Error interno del servidor'})
    }
    
  }
}
