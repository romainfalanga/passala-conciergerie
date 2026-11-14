// Lecture et validation des biens.
import { type Bindings, type Input, bool, fail, int, num, str, url } from './lib';

export type PropertyRow = {
  id: string; name: string; type: string; location: string; short_description: string; description: string;
  capacity: number; bedrooms: number | null; bathrooms: number | null; surface: number | null; amenities: string;
  accepts_pets: number; direct_booking: number; published: number; sort_order: number;
  nightly_price: number | null; cleaning_fee: number; min_nights: number; price_note: string;
  airbnb_url: string; booking_url: string;
  rating_airbnb: number | null; rating_airbnb_count: number | null; rating_booking: number | null; rating_booking_count: number | null;
  version: number; created_at: number; updated_at: number;
};
export type PhotoRow = { id: string; property_id: string; url: string; r2_key: string | null; alt: string; position: number };

export const TYPES = ['Studio', 'Appartement', 'Maison', 'Villa', 'Mas', 'Bastide'];

export function view(p: PropertyRow, photos: PhotoRow[], admin = false) {
  const base = {
    id: p.id, name: p.name, type: p.type, location: p.location,
    short_description: p.short_description, description: p.description,
    capacity: p.capacity, bedrooms: p.bedrooms, bathrooms: p.bathrooms, surface: p.surface,
    amenities: JSON.parse(p.amenities) as string[],
    accepts_pets: Boolean(p.accepts_pets), direct_booking: Boolean(p.direct_booking),
    nightly_price: p.nightly_price, cleaning_fee: p.cleaning_fee, min_nights: p.min_nights, price_note: p.price_note,
    airbnb_url: p.airbnb_url, booking_url: p.booking_url,
    rating_airbnb: p.rating_airbnb, rating_airbnb_count: p.rating_airbnb_count,
    rating_booking: p.rating_booking, rating_booking_count: p.rating_booking_count,
    photos: photos.filter(ph => ph.property_id === p.id).sort((a, b) => a.position - b.position)
      .map(ph => admin ? { id: ph.id, url: ph.url, alt: ph.alt, position: ph.position } : { url: ph.url, alt: ph.alt })
  };
  return admin ? { ...base, published: Boolean(p.published), sort_order: p.sort_order, version: p.version, created_at: p.created_at, updated_at: p.updated_at } : base;
}

export async function loadProperties(env: Bindings, { publishedOnly }: { publishedOnly: boolean }) {
  const where = publishedOnly ? 'WHERE published=1' : '';
  const [props, photos] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM properties ${where} ORDER BY sort_order, name`),
    env.DB.prepare(`SELECT ph.* FROM property_photos ph JOIN properties p ON p.id=ph.property_id ${publishedOnly ? 'WHERE p.published=1' : ''} ORDER BY ph.position`)
  ]);
  return { properties: props.results as PropertyRow[], photos: photos.results as PhotoRow[] };
}

export async function loadProperty(env: Bindings, id: string, { publishedOnly }: { publishedOnly: boolean }) {
  const p = await env.DB.prepare(`SELECT * FROM properties WHERE id=? ${publishedOnly ? 'AND published=1' : ''}`).bind(id).first<PropertyRow>();
  if (!p) return fail(404, 'Bien introuvable.');
  const photos = await env.DB.prepare('SELECT * FROM property_photos WHERE property_id=? ORDER BY position').bind(id).all<PhotoRow>();
  return { property: p, photos: photos.results };
}

/** Champs modifiables depuis l'admin. Les champs absents ne sont pas modifiés. */
export function propertyFields(input: Input) {
  const out: Record<string, string | number | null> = {};
  const has = (k: string) => input[k] !== undefined;
  if (has('name')) out.name = str(input, 'name', 120);
  if (has('type')) { out.type = str(input, 'type', 40); if (!TYPES.includes(out.type as string)) fail(400, 'Type de bien invalide.'); }
  if (has('location')) out.location = str(input, 'location', 120, false);
  if (has('short_description')) out.short_description = str(input, 'short_description', 300, false);
  if (has('description')) out.description = str(input, 'description', 6000, false);
  if (has('capacity')) out.capacity = int(input, 'capacity', 1, 30);
  if (has('bedrooms')) out.bedrooms = int(input, 'bedrooms', 0, 30, true);
  if (has('bathrooms')) out.bathrooms = int(input, 'bathrooms', 0, 30, true);
  if (has('surface')) out.surface = int(input, 'surface', 1, 10000, true);
  if (has('amenities')) {
    const list = input.amenities;
    if (!Array.isArray(list) || list.length > 60 || list.some(a => typeof a !== 'string' || !a.trim() || a.length > 80)) fail(400, 'Liste d\'équipements invalide.');
    out.amenities = JSON.stringify([...new Set((list as string[]).map(a => a.trim()))]);
  }
  for (const k of ['accepts_pets', 'direct_booking', 'published']) if (has(k)) out[k] = bool(input, k);
  if (has('sort_order')) out.sort_order = int(input, 'sort_order', -1000, 1000);
  if (has('nightly_price')) out.nightly_price = int(input, 'nightly_price', 0, 10_000_000, true);
  if (has('cleaning_fee')) out.cleaning_fee = int(input, 'cleaning_fee', 0, 1_000_000) as number;
  if (has('min_nights')) out.min_nights = int(input, 'min_nights', 1, 90);
  if (has('price_note')) out.price_note = str(input, 'price_note', 200, false);
  if (has('airbnb_url')) out.airbnb_url = url(input, 'airbnb_url');
  if (has('booking_url')) out.booking_url = url(input, 'booking_url');
  if (has('rating_airbnb')) out.rating_airbnb = num(input, 'rating_airbnb', 0, 5);
  if (has('rating_booking')) out.rating_booking = num(input, 'rating_booking', 0, 10);
  if (has('rating_airbnb_count')) out.rating_airbnb_count = int(input, 'rating_airbnb_count', 0, 1_000_000, true);
  if (has('rating_booking_count')) out.rating_booking_count = int(input, 'rating_booking_count', 0, 1_000_000, true);
  return out;
}

export function estimate(p: Pick<PropertyRow, 'nightly_price' | 'cleaning_fee'>, nights: number) {
  return p.nightly_price === null ? null : p.nightly_price * nights + p.cleaning_fee;
}
