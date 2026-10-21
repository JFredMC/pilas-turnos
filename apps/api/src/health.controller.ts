import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { DB, type Db } from './db/client';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}
  @Get()
  async health() {
    await this.db.execute(sql`select 1`);
    return { ok: true, servicio: 'pilas-api' };
  }
}
