import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Valida body/query con zod y responde 400 con los errores en español. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos',
        errores: r.error.issues.map((i) => ({ campo: i.path.join('.'), detalle: i.message })),
      });
    }
    return r.data;
  }
}

export const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
export const telefonoSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, '').replace(/^57(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^3\d{9}$/, 'Celular colombiano de 10 dígitos'));
export const nombreSchema = z.string().trim().min(2).max(80);
export const uuidSchema = z.uuid();
