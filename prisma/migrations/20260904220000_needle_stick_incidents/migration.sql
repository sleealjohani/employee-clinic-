-- CreateEnum
CREATE TYPE "ExposureNature" AS ENUM ('NEEDLE_STICK', 'CUT', 'SPLASH', 'OTHER');

-- CreateTable
CREATE TABLE "NeedleStickIncident" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "department" TEXT,
    "nature" "ExposureNature" NOT NULL,
    "otherNature" TEXT,
    "incidentAt" TIMESTAMP(3) NOT NULL,
    "staffSignature" TEXT,
    "sourcePatientName" TEXT,
    "sourcePatientFileNo" TEXT,
    "sourceWard" TEXT,
    "sourceBloodBorneHistory" BOOLEAN,
    "sourceBloodBorneDetails" TEXT,
    "actionWashing" BOOLEAN NOT NULL DEFAULT false,
    "actionIrrigation" BOOLEAN NOT NULL DEFAULT false,
    "actionEmployeeClinic" BOOLEAN NOT NULL DEFAULT false,
    "actionImmunoglobulin" BOOLEAN NOT NULL DEFAULT false,
    "headOfDepartmentName" TEXT,
    "headOfDepartmentSignature" TEXT,
    "headOfDepartmentSignedAt" TIMESTAMP(3),
    "reportReceivedAt" TIMESTAMP(3),
    "patientHivResult" TEXT,
    "patientHbvResult" TEXT,
    "patientHcvResult" TEXT,
    "patientOtherResult" TEXT,
    "staffHivResult" TEXT,
    "staffHbvResult" TEXT,
    "staffHcvResult" TEXT,
    "staffOtherResult" TEXT,
    "recommendation" TEXT,
    "physicianName" TEXT,
    "physicianSignature" TEXT,
    "physicianSignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "NeedleStickIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NeedleStickIncident_employeeId_incidentAt_idx" ON "NeedleStickIncident"("employeeId", "incidentAt");
CREATE INDEX "NeedleStickIncident_incidentAt_idx" ON "NeedleStickIncident"("incidentAt");
CREATE INDEX "NeedleStickIncident_completedAt_idx" ON "NeedleStickIncident"("completedAt");
CREATE INDEX "NeedleStickIncident_createdById_idx" ON "NeedleStickIncident"("createdById");
CREATE INDEX "NeedleStickIncident_updatedById_idx" ON "NeedleStickIncident"("updatedById");

-- AddForeignKey
ALTER TABLE "NeedleStickIncident" ADD CONSTRAINT "NeedleStickIncident_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NeedleStickIncident" ADD CONSTRAINT "NeedleStickIncident_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NeedleStickIncident" ADD CONSTRAINT "NeedleStickIncident_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- This application accesses clinical data only through its authenticated server.
-- The public Data API receives no privileges or policies for this table.
ALTER TABLE "NeedleStickIncident" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE "NeedleStickIncident" FROM anon, authenticated;
  END IF;
END $$;

-- Clinical exposure records are corrected by revision or marked entered in
-- error; they are never hard-deleted or truncated.
CREATE TRIGGER clinic_no_hard_delete
BEFORE DELETE ON "NeedleStickIncident"
FOR EACH ROW EXECUTE FUNCTION public.clinic_reject_record_delete();
CREATE TRIGGER clinic_no_truncate
BEFORE TRUNCATE ON "NeedleStickIncident"
FOR EACH STATEMENT EXECUTE FUNCTION public.clinic_reject_record_delete();
