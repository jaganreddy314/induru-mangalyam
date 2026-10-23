import { getSupabase } from '@induru/shared';

function ext(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  return fromName && /^[a-z0-9]{2,4}$/.test(fromName) ? fromName : 'bin';
}

/** Uploads to a private bucket under <folder>/<uuid>.<ext>; returns the object path. */
export async function uploadPrivate(bucket: 'evidence' | 'photos', folder: string, file: File) {
  const path = `${folder}/${crypto.randomUUID()}.${ext(file)}`;
  const { error } = await getSupabase().storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

/** Short-lived signed URL; the storage policy re-checks permission on every request. */
export async function signedPhotoUrl(path: string) {
  const { data, error } = await getSupabase().storage.from('photos').createSignedUrl(path, 120);
  if (error) return null;
  return data.signedUrl;
}
