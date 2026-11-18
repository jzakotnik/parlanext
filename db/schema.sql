CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS config (key text PRIMARY KEY, value text NOT NULL);

CREATE TABLE IF NOT EXISTS drucksache (
  id text PRIMARY KEY,
  datum date,
  dokumentnummer text,
  titel text,
  vorgangstyp text,
  kfw boolean DEFAULT false,
  bmz boolean DEFAULT false,
  ez_deskriptor boolean DEFAULT false,
  deskriptoren text[] DEFAULT '{}',
  sachgebiete text[] DEFAULT '{}',
  pdf_url text,
  text text
);
CREATE INDEX IF NOT EXISTS drucksache_datum_idx ON drucksache (datum DESC);
CREATE INDEX IF NOT EXISTS drucksache_nr_idx ON drucksache (dokumentnummer);

CREATE TABLE IF NOT EXISTS chunk (
  id bigserial PRIMARY KEY,
  drucksache_id text NOT NULL REFERENCES drucksache(id) ON DELETE CASCADE,
  ord int NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('german', content)) STORED
);
CREATE INDEX IF NOT EXISTS chunk_embedding_idx ON chunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunk_tsv_idx ON chunk USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunk_trgm_idx ON chunk USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chunk_doc_idx ON chunk (drucksache_id);
