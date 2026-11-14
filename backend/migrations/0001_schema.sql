-- Passala Conciergerie — schéma D1
-- Montants en centimes d'euro. Dates au format AAAA-MM-JJ (heure de Paris).

-- ───────────── Biens ─────────────
CREATE TABLE properties (
  id TEXT PRIMARY KEY CHECK(id GLOB '[a-z0-9]*' AND length(id) BETWEEN 2 AND 60),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Appartement',
  location TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 2 CHECK(capacity BETWEEN 1 AND 30),
  bedrooms INTEGER CHECK(bedrooms IS NULL OR bedrooms BETWEEN 0 AND 30),
  bathrooms INTEGER CHECK(bathrooms IS NULL OR bathrooms BETWEEN 0 AND 30),
  surface INTEGER CHECK(surface IS NULL OR surface BETWEEN 1 AND 10000),
  amenities TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(amenities) AND json_type(amenities)='array'),
  accepts_pets INTEGER NOT NULL DEFAULT 0 CHECK(accepts_pets IN (0,1)),
  direct_booking INTEGER NOT NULL DEFAULT 0 CHECK(direct_booking IN (0,1)),
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  nightly_price INTEGER CHECK(nightly_price IS NULL OR nightly_price >= 0),
  cleaning_fee INTEGER NOT NULL DEFAULT 0 CHECK(cleaning_fee >= 0),
  min_nights INTEGER NOT NULL DEFAULT 1 CHECK(min_nights BETWEEN 1 AND 90),
  price_note TEXT NOT NULL DEFAULT '',
  airbnb_url TEXT NOT NULL DEFAULT '',
  booking_url TEXT NOT NULL DEFAULT '',
  rating_airbnb REAL CHECK(rating_airbnb IS NULL OR rating_airbnb BETWEEN 0 AND 5),
  rating_airbnb_count INTEGER CHECK(rating_airbnb_count IS NULL OR rating_airbnb_count >= 0),
  rating_booking REAL CHECK(rating_booking IS NULL OR rating_booking BETWEEN 0 AND 10),
  rating_booking_count INTEGER CHECK(rating_booking_count IS NULL OR rating_booking_count >= 0),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE property_photos (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  r2_key TEXT UNIQUE,
  alt TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX photos_property ON property_photos(property_id, position);

-- ───────────── Réservations ─────────────
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  request_key TEXT UNIQUE,
  request_hash TEXT,
  property_id TEXT NOT NULL REFERENCES properties(id),
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 30),
  pets INTEGER NOT NULL DEFAULT 0 CHECK(pets IN (0,1)),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'site' CHECK(source IN ('site','airbnb','booking','telephone','autre')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','cancelled')),
  estimated_total INTEGER,
  admin_note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  decided_at INTEGER,
  CHECK(checkin < checkout AND julianday(checkout) - julianday(checkin) BETWEEN 1 AND 365)
);
CREATE INDEX bookings_status ON bookings(status, created_at DESC);
CREATE INDEX bookings_property_dates ON bookings(property_id, checkin);

-- Une ligne par nuit occupée (la date de départ n'est jamais occupée).
-- La clé primaire rend toute double occupation impossible.
CREATE TABLE occupancy (
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(property_id, date)
);
CREATE INDEX occupancy_booking ON occupancy(booking_id);

-- Une demande ne peut pas être déposée sur des nuits déjà occupées.
CREATE TRIGGER bookings_available BEFORE INSERT ON bookings BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM occupancy WHERE property_id=NEW.property_id AND date>=NEW.checkin AND date<NEW.checkout
  ) THEN RAISE(ABORT,'dates_unavailable') END;
END;

-- La confirmation réserve toutes les nuits en une seule opération, ou échoue entièrement.
CREATE TRIGGER booking_confirm AFTER UPDATE OF status ON bookings
WHEN NEW.status='confirmed' AND OLD.status!='confirmed' BEGIN
  INSERT INTO occupancy(property_id,date,booking_id)
  SELECT NEW.property_id, date, NEW.id FROM (
    WITH RECURSIVE nights(date) AS (
      SELECT NEW.checkin UNION ALL SELECT date(date,'+1 day') FROM nights WHERE date(date,'+1 day')<NEW.checkout
    ) SELECT date FROM nights
  );
END;
CREATE TRIGGER booking_release AFTER UPDATE OF status ON bookings
WHEN OLD.status='confirmed' AND NEW.status!='confirmed' BEGIN
  DELETE FROM occupancy WHERE booking_id=NEW.id;
END;

-- ───────────── Contacts propriétaires ─────────────
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  property_type TEXT NOT NULL,
  city TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX leads_created ON leads(created_at DESC);

-- ───────────── Administration ─────────────
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- ───────────── Emails (file d'envoi fiable) ─────────────
CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  audience TEXT NOT NULL CHECK(audience IN ('guest','admin')),
  event TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  next_attempt INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_until INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  last_error TEXT
);
CREATE INDEX outbox_pending ON email_outbox(state, next_attempt);

-- Seules les demandes venant du site déclenchent des emails au voyageur.
CREATE TRIGGER booking_created_email AFTER INSERT ON bookings WHEN NEW.source='site' BEGIN
  INSERT INTO email_outbox(id,audience,event,payload)
  SELECT NEW.id || ':1:' || audience, audience, 'booking.pending',
    json_object('reference',NEW.reference,'name',NEW.full_name,'email',NEW.email,'phone',NEW.phone,
      'checkin',NEW.checkin,'checkout',NEW.checkout,'guests',NEW.guests,'message',NEW.message,
      'estimated_total',NEW.estimated_total,'property',(SELECT name FROM properties WHERE id=NEW.property_id))
  FROM (SELECT 'guest' AS audience UNION ALL SELECT 'admin');
END;
CREATE TRIGGER booking_status_email AFTER UPDATE OF status ON bookings
WHEN NEW.status!=OLD.status AND NEW.source='site' AND NEW.status!='pending' BEGIN
  INSERT INTO email_outbox(id,audience,event,payload)
  VALUES (NEW.id || ':' || NEW.version || ':guest', 'guest', 'booking.' || NEW.status,
    json_object('reference',NEW.reference,'name',NEW.full_name,'email',NEW.email,'phone',NEW.phone,
      'checkin',NEW.checkin,'checkout',NEW.checkout,'guests',NEW.guests,'message',NEW.message,
      'estimated_total',NEW.estimated_total,'property',(SELECT name FROM properties WHERE id=NEW.property_id)));
END;
CREATE TRIGGER lead_created_email AFTER INSERT ON leads BEGIN
  INSERT INTO email_outbox(id,audience,event,payload) VALUES (
    NEW.id || ':admin', 'admin', 'lead.created',
    json_object('name',NEW.full_name,'email',NEW.email,'phone',NEW.phone,
      'property_type',NEW.property_type,'city',NEW.city,'message',NEW.message));
END;
