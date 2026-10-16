CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 30),
  accepts_pets INTEGER NOT NULL DEFAULT 0 CHECK(accepts_pets IN (0,1)),
  calendar_ready INTEGER NOT NULL DEFAULT 0 CHECK(calendar_ready IN (0,1)),
  data TEXT NOT NULL CHECK(json_valid(data)),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  property_id TEXT NOT NULL REFERENCES properties(id),
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 30),
  pets INTEGER NOT NULL CHECK(pets IN (0,1)),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(checkin < checkout AND julianday(checkout)-julianday(checkin) BETWEEN 1 AND 90)
);
CREATE INDEX bookings_property_created ON bookings(property_id, created_at DESC);

-- Each occupied night has one owner. Departure dates are deliberately excluded.
CREATE TABLE occupancy (
  property_id TEXT NOT NULL REFERENCES properties(id),
  date TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(property_id, date)
);
CREATE INDEX occupancy_booking ON occupancy(booking_id);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  property_type TEXT NOT NULL, city TEXT NOT NULL, message TEXT NOT NULL,
  consent INTEGER NOT NULL CHECK(consent=1),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, credential_tag TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
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
CREATE INDEX outbox_pending ON email_outbox(state,next_attempt);

CREATE TRIGGER bookings_available BEFORE INSERT ON bookings BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM occupancy WHERE property_id=NEW.property_id AND date>=NEW.checkin AND date<NEW.checkout
  ) THEN RAISE(ABORT,'dates_unavailable') END;
END;

-- A single UPDATE both confirms and claims every night, or rolls back completely.
-- The UNIQUE key also arbitrates conflicts with concurrent manual blocking.
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

CREATE TRIGGER booking_created_email AFTER INSERT ON bookings BEGIN
  INSERT INTO email_outbox(id,audience,event,payload)
  SELECT NEW.id || ':1:' || audience,audience,'booking.pending',
    json_object('id',NEW.id,'name',NEW.full_name,'email',NEW.email,'phone',NEW.phone,
      'checkin',NEW.checkin,'checkout',NEW.checkout,'guests',NEW.guests,'message',NEW.message,
      'property',(SELECT name FROM properties WHERE id=NEW.property_id))
  FROM (SELECT 'guest' AS audience UNION ALL SELECT 'admin');
END;
CREATE TRIGGER booking_status_email AFTER UPDATE OF status ON bookings
WHEN NEW.status!=OLD.status BEGIN
  INSERT INTO email_outbox(id,audience,event,payload)
  SELECT NEW.id || ':' || NEW.version || ':' || audience,audience,'booking.' || NEW.status,
    json_object('id',NEW.id,'name',NEW.full_name,'email',NEW.email,'phone',NEW.phone,
      'checkin',NEW.checkin,'checkout',NEW.checkout,'guests',NEW.guests,'message',NEW.message,
      'property',(SELECT name FROM properties WHERE id=NEW.property_id))
  FROM (SELECT 'guest' AS audience UNION ALL SELECT 'admin');
END;
CREATE TRIGGER lead_created_email AFTER INSERT ON leads BEGIN
  INSERT INTO email_outbox(id,audience,event,payload) VALUES (
    NEW.id || ':admin','admin','lead.created',
    json_object('id',NEW.id,'name',NEW.full_name,'email',NEW.email,'phone',NEW.phone,
      'property_type',NEW.property_type,'city',NEW.city,'message',NEW.message)
  );
END;
