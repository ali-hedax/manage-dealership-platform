import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUIDv7, safe to generate on any node (cloud or LAN server). */
export const newId = (): string => uuidv7();
