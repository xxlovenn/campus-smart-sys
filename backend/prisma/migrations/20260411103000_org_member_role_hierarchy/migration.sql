-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('MEMBER', 'ORG_ADMIN');

-- AlterTable
ALTER TABLE "OrganizationMember"
ADD COLUMN "memberRole" "OrganizationMemberRole" NOT NULL DEFAULT 'MEMBER';

-- Migrate legacy global ORG_ADMIN users to organization-scoped admins.
UPDATE "OrganizationMember" m
SET "memberRole" = 'ORG_ADMIN'
FROM "User" u
WHERE u."id" = m."userId"
  AND u."role" = 'ORG_ADMIN';

-- Keep global roles platform-level only (LEAGUE_ADMIN / STUDENT).
UPDATE "User"
SET "role" = 'STUDENT'
WHERE "role" = 'ORG_ADMIN';
