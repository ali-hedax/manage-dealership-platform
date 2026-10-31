import { Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from './zod.pipe';

/** Route parameter validated as a UUID (400 with the standard error shape). */
export const IdParam = (name = 'id') => Param(name, new ZodPipe(z.uuid()));
