import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class CreateTecnicoDto {
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;
}
