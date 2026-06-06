// Public surface of the database package: the Prisma client, the model
// types, the services the bot calls, and the reference data.

export { prisma } from './client';

// Generated model types, re-exported so the app imports them from one place.
export type {
  Surah,
  Ayah,
  Track,
  TrackEntry,
  Subscriber,
  DeliveryLog,
} from './generated/prisma/client';

// Services
export * from './services/quran.service';
export * from './services/subscriber.service';
export * from './services/pause.service';
export * from './services/delivery.service';
export * from './services/audio.service';

// Reference data
export * from './reference/surahs';
export * from './reference/ayah-counts';
export * from './reference/curriculum';
export * from './reference/reciters';
