-- The Personal Health File booklet is a lossless JSON snapshot of the printed
-- eight-page clinical form. It deliberately stays separate from the normalized
-- reporting tables: values typed onto paper must round-trip through setData()
-- and getData() without being silently reformatted or discarded.
CREATE TABLE "PersonalHealthFile" (
  "employeeId" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,

  CONSTRAINT "PersonalHealthFile_pkey" PRIMARY KEY ("employeeId"),
  CONSTRAINT "PersonalHealthFile_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonalHealthFile_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PersonalHealthFile_revision_check" CHECK ("revision" >= 0)
);

CREATE INDEX "PersonalHealthFile_updatedById_idx"
  ON "PersonalHealthFile"("updatedById");

-- The application server is the only data path. Match the clinic's existing
-- Data API lockdown: RLS on, with no anon/authenticated policies or grants.
ALTER TABLE "PersonalHealthFile" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE "PersonalHealthFile" FROM anon, authenticated;
  END IF;
END $$;
