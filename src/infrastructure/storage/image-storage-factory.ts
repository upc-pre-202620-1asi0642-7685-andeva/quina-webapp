import type { ImageStorage } from '@/core/domain/ports/image-storage';
import type { PrivateFileStorage } from '@/core/domain/ports/private-file-storage';
import { LocalImageStorage } from './local-image-storage';
import { LocalPrivateFileStorage, SupabasePrivateFileStorage } from './private-file-storage';
import { SupabaseImageStorage } from './supabase-image-storage';

let cached: ImageStorage | undefined;
let cachedPrivate: PrivateFileStorage | undefined;

/** Bucket privado (QR de cobro), con el mismo STORAGE_TRANSPORT que el catálogo. */
export function getPrivateFileStorage(): PrivateFileStorage {
  cachedPrivate ??=
    createImageStorage() instanceof LocalImageStorage
      ? new LocalPrivateFileStorage()
      : new SupabasePrivateFileStorage(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
  return cachedPrivate;
}

export function createImageStorage(env: NodeJS.ProcessEnv = process.env): ImageStorage {
  const transport = env.STORAGE_TRANSPORT || (env.NODE_ENV === 'production' ? 'supabase' : 'local');

  if (transport === 'local') {
    if (env.VERCEL_ENV === 'production') {
      throw new Error('STORAGE_TRANSPORT=local is not allowed when VERCEL_ENV=production');
    }
    return new LocalImageStorage();
  }
  if (transport === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage');
    }
    return new SupabaseImageStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  throw new Error(`Unknown STORAGE_TRANSPORT: ${transport}`);
}

export function getImageStorage(): ImageStorage {
  cached ??= createImageStorage();
  return cached;
}
