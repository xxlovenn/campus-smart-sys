-- Optional: runs on first postgres init only (docker-entrypoint-initdb.d).
-- Primary seed is Prisma seed in backend; this file can stay empty or add extensions.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
