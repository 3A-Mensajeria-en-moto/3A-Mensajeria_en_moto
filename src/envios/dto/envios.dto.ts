import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ESTADOS_DEL_CADETE, EstadoEnvio } from '../estado-envio';

const NO_VACIO = /\S/;

export class DireccionInputDto {
  @IsString() @Matches(NO_VACIO) @MaxLength(200)
  calle: string;

  @IsString() @Matches(NO_VACIO) @MaxLength(100)
  localidad: string;

  @IsOptional() @IsString() @MaxLength(300)
  referencias?: string;
}

export class DestinatarioDto {
  @IsString() @Matches(NO_VACIO) @MaxLength(100)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(30)
  telefono?: string;
}

export class CrearEnvioDto {
  @IsDefined() @ValidateNested() @Type(() => DireccionInputDto)
  origen: DireccionInputDto;

  @IsDefined() @ValidateNested() @Type(() => DireccionInputDto)
  destino: DireccionInputDto;

  @IsDefined() @ValidateNested() @Type(() => DestinatarioDto)
  destinatario: DestinatarioDto;

  @IsOptional() @IsString() @MaxLength(300)
  descripcion?: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ListarEnviosQuery {
  /** ?estado=PENDIENTE&estado=ASIGNADO (o uno solo). */
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsIn(Object.values(EstadoEnvio), { each: true })
  estado?: EstadoEnvio[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  cadeteId?: number;

  @IsOptional() @Matches(FECHA)
  desde?: string;

  @IsOptional() @Matches(FECHA)
  hasta?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  pagina: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  tamanio: number = 20;
}

export class AsignacionDto {
  @Type(() => Number) @IsInt()
  cadeteId: number;
}

export class CambioEstadoDto {
  @IsIn(ESTADOS_DEL_CADETE as EstadoEnvio[])
  estado: EstadoEnvio;

  @IsOptional() @IsString() @MaxLength(300)
  observacion?: string;
}
