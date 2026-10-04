CREATE TABLE IF NOT EXISTS auth_user (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false,
 image text, phone_number text UNIQUE, phone_number_verified boolean DEFAULT false,
 created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_session (
 id text PRIMARY KEY, expires_at timestamp NOT NULL, token text NOT NULL UNIQUE, created_at timestamp NOT NULL DEFAULT now(),
 updated_at timestamp NOT NULL DEFAULT now(), ip_address text, user_agent text, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS auth_account (
 id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 access_token text, refresh_token text, id_token text, access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text, password text,
 created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamp NOT NULL, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS auth_verification_identifier ON auth_verification(identifier);
CREATE TABLE IF NOT EXISTS profiles (
 user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('student','parent','teacher','alumni')),
 age_band text NOT NULL CHECK(age_band IN ('under16','16to17','adult')),
 staff_role text CHECK(staff_role IN ('moderator','admin')), pseudonym text NOT NULL,
 disabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sources (
 id text PRIMARY KEY, title text NOT NULL, url text NOT NULL, publisher text NOT NULL, year integer NOT NULL,
 license text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 demo boolean NOT NULL DEFAULT false, fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS schools (
 id text PRIMARY KEY, official_id text UNIQUE, name text NOT NULL, county text NOT NULL, city text NOT NULL,
 type text NOT NULL CHECK(type IN ('liceu','gimnaziu','colegiu')), search_text text NOT NULL,
 enrolled integer CHECK(enrolled >= 0), enrolled_year text, source_id text NOT NULL REFERENCES sources(id), demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS schools_location ON schools(county,city);
CREATE TABLE IF NOT EXISTS statistics (
 id text PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id), exam text NOT NULL CHECK(exam IN ('BAC','EN','ADMITERE')),
 year integer NOT NULL, session text NOT NULL, specialization text NOT NULL DEFAULT '', stage text NOT NULL DEFAULT '',
 candidates integer NOT NULL CHECK(candidates >= 0), attended integer CHECK(attended >= 0), valid integer CHECK(valid >= 0),
 promoted integer CHECK(promoted >= 0), mean numeric(4,2) CHECK(mean BETWEEN 0 AND 10), minimum numeric(4,2) CHECK(minimum BETWEEN 0 AND 10),
 distribution jsonb NOT NULL DEFAULT '{}', source_id text NOT NULL REFERENCES sources(id), demo boolean NOT NULL DEFAULT false,
 UNIQUE(school_id,exam,year,session,specialization,stage)
);
CREATE TABLE IF NOT EXISTS teachers (
 id text PRIMARY KEY, source_key text NOT NULL UNIQUE, name text NOT NULL, subjects jsonb NOT NULL DEFAULT '[]', bio text NOT NULL DEFAULT '',
 start_year integer, experience_confirmed boolean NOT NULL DEFAULT false, source_id text NOT NULL REFERENCES sources(id),
 claimed_by text UNIQUE REFERENCES auth_user(id) ON DELETE SET NULL, withdrawn boolean NOT NULL DEFAULT false,
 demo boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliations (teacher_id text NOT NULL REFERENCES teachers(id), school_id text NOT NULL REFERENCES schools(id), PRIMARY KEY(teacher_id,school_id));
CREATE TABLE IF NOT EXISTS suppressions (source_key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS families (
 id text PRIMARY KEY, parent_id text REFERENCES auth_user(id) ON DELETE CASCADE, child_id text REFERENCES auth_user(id) ON DELETE CASCADE,
 invited_phone text, label text NOT NULL, school_id text REFERENCES schools(id), created_by text NOT NULL REFERENCES auth_user(id),
 status text NOT NULL CHECK(status IN ('invited','pending','approved','revoked')), parent_consented boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS family_child_unique ON families(child_id) WHERE child_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS documents (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, file_name text NOT NULL,
 mime text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS checks (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('school','relationship','claim','guardian','correction')),
 school_id text REFERENCES schools(id), teacher_id text REFERENCES teachers(id), family_id text REFERENCES families(id),
 context text NOT NULL DEFAULT 'class' CHECK(context IN ('class','tutoring')), academic_year text NOT NULL DEFAULT '',
 document_id text REFERENCES documents(id), details jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired')),
 reason text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
CREATE TABLE IF NOT EXISTS reviews (
 id text PRIMARY KEY, author_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, teacher_id text NOT NULL REFERENCES teachers(id),
 family_id text REFERENCES families(id), subject_key text NOT NULL, context text NOT NULL CHECK(context IN ('class','tutoring')),
 academic_year text NOT NULL, body text NOT NULL, clarity integer NOT NULL CHECK(clarity BETWEEN 1 AND 5),
 respect integer NOT NULL CHECK(respect BETWEEN 1 AND 5), fairness integer NOT NULL CHECK(fairness BETWEEN 1 AND 5), feedback integer NOT NULL CHECK(feedback BETWEEN 1 AND 5),
 status text NOT NULL CHECK(status IN ('guardian_pending','pending','approved','rejected')), reason text,
 reply text, reply_pending text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subject_key,teacher_id,context,academic_year)
);
CREATE TABLE IF NOT EXISTS offers (
 id text PRIMARY KEY, teacher_id text NOT NULL REFERENCES teachers(id), subject text NOT NULL, level text NOT NULL,
 format text NOT NULL CHECK(format IN ('online','fizic','mixt')), city text NOT NULL, duration integer NOT NULL CHECK(duration BETWEEN 30 AND 240),
 price integer NOT NULL CHECK(price BETWEEN 0 AND 10000), active boolean NOT NULL DEFAULT true, UNIQUE(teacher_id,subject,level)
);
CREATE TABLE IF NOT EXISTS requests (
 id text PRIMARY KEY, offer_id text NOT NULL REFERENCES offers(id), user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 family_id text REFERENCES families(id), message text NOT NULL, status text NOT NULL CHECK(status IN ('guardian_pending','pending','accepted','declined','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alumni (
 user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE, public_name text NOT NULL, school_id text NOT NULL REFERENCES schools(id),
 graduation integer NOT NULL, university text NOT NULL, field text NOT NULL, bio text NOT NULL, published boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS reports (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, review_id text NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
 reason text NOT NULL, status text NOT NULL DEFAULT 'pending', resolution text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,review_id)
);
CREATE TABLE IF NOT EXISTS privacy_requests (
 id text PRIMARY KEY, user_id text REFERENCES auth_user(id) ON DELETE SET NULL, kind text NOT NULL CHECK(kind IN ('account','profile','illegal','access','correction')),
 teacher_id text REFERENCES teachers(id), contact text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'pending', reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS import_batches (
 id text PRIMARY KEY, digest text NOT NULL UNIQUE, source_id text NOT NULL REFERENCES sources(id), kind text NOT NULL CHECK(kind IN ('schools','teachers','statistics')),
 payload jsonb NOT NULL, errors jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
CREATE TABLE IF NOT EXISTS audit (id text PRIMARY KEY, actor_id text, action text NOT NULL, target_id text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS app_meta (key text PRIMARY KEY, value text NOT NULL);
