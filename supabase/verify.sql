-- Employee Clinic / Supabase verification
-- Safe to run repeatedly in Supabase SQL Editor. It does not modify data.

-- 1) Confirm Prisma recorded the initial migration.
SELECT
  migration_name,
  finished_at,
  applied_steps_count,
  rolled_back_at
FROM public."_prisma_migrations"
ORDER BY started_at DESC;

-- 2) Confirm the application tables exist.
SELECT tablename
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'User',
    'AuditLog',
    'Employee',
    'EmploymentHistory',
    'Visit',
    'LabResult',
    'Allergy',
    'Vaccination',
    'HealthEducation',
    'ClinicalNote',
    'Attachment',
    'LabImportBatch',
    'LabImportItem',
    'Setting'
  )
ORDER BY tablename;

-- 3) Setup status. Before first setup this should return 0.
SELECT COUNT(*) AS user_count FROM public."User";

-- 4) Basic integrity / connectivity check.
SELECT
  current_database() AS database_name,
  current_schema() AS current_schema,
  now() AS checked_at;
