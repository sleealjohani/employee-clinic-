-- CreateEnum
CREATE TYPE "Comparison" AS ENUM ('EQ', 'LT', 'LE', 'GT', 'GE');

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('APPOINTMENT', 'REQUEST');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EMPLOYEE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "pendingTotpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pendingTotpSecret" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "assignedFacility" TEXT,
ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "personnelNotes" TEXT,
ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "workLocation" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LabResult" ADD COLUMN     "comparator" "Comparison" NOT NULL DEFAULT 'EQ',
ADD COLUMN     "rawValue" TEXT,
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "ruleVersion" TEXT NOT NULL DEFAULT 'clinical-v2',
ADD COLUMN     "visitId" TEXT;

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "expectedSize" INTEGER,
ADD COLUMN     "isComplete" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "LabImportBatch" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extractionNote" TEXT,
ADD COLUMN     "leaseUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LabImportItem" ADD COLUMN     "comparator" "Comparison" NOT NULL DEFAULT 'EQ',
ADD COLUMN     "rawValue" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "AttachmentChunk" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicService" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "mode" "ServiceMode" NOT NULL DEFAULT 'APPOINTMENT',
    "visitType" "VisitType" NOT NULL DEFAULT 'CONSULTATION',
    "durationMinutes" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "reason" TEXT,
    "cancellationReason" TEXT,
    "visitId" TEXT,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "serviceId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'SERVICE',
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttachmentChunk_attachmentId_offset_key" ON "AttachmentChunk"("attachmentId", "offset");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicService_slug_key" ON "ClinicService"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_visitId_key" ON "Appointment"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_requestKey_key" ON "Appointment"("requestKey");

-- CreateIndex
CREATE INDEX "Appointment_startsAt_status_idx" ON "Appointment"("startsAt", "status");

-- CreateIndex
CREATE INDEX "Appointment_employeeId_startsAt_idx" ON "Appointment"("employeeId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_serviceId_idx" ON "Appointment"("serviceId");

-- CreateIndex
CREATE INDEX "ScheduleBlock_startsAt_endsAt_idx" ON "ScheduleBlock"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_employeeId_createdAt_idx" ON "ServiceRequest"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_createdAt_idx" ON "ServiceRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_serviceId_idx" ON "ServiceRequest"("serviceId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "Employee_createdById_idx" ON "Employee"("createdById");

-- CreateIndex
CREATE INDEX "Visit_createdById_idx" ON "Visit"("createdById");

-- CreateIndex
CREATE INDEX "LabResult_createdById_idx" ON "LabResult"("createdById");

-- CreateIndex
CREATE INDEX "LabResult_reviewedById_idx" ON "LabResult"("reviewedById");

-- CreateIndex
CREATE INDEX "LabResult_sourceAttachmentId_idx" ON "LabResult"("sourceAttachmentId");

-- CreateIndex
CREATE INDEX "LabResult_visitId_idx" ON "LabResult"("visitId");

-- CreateIndex
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

-- CreateIndex
CREATE INDEX "Attachment_sha256_idx" ON "Attachment"("sha256");

-- CreateIndex
CREATE INDEX "LabImportBatch_uploadedById_idx" ON "LabImportBatch"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "LabImportItem_committedLabResultId_key" ON "LabImportItem"("committedLabResultId");

-- CreateIndex
CREATE INDEX "LabImportItem_matchedEmployeeId_idx" ON "LabImportItem"("matchedEmployeeId");

-- CreateIndex
CREATE INDEX "LabImportItem_reviewedById_idx" ON "LabImportItem"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "LabImportItem_batchId_sourceKey_key" ON "LabImportItem"("batchId", "sourceKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentChunk" ADD CONSTRAINT "AttachmentChunk_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabImportItem" ADD CONSTRAINT "LabImportItem_committedLabResultId_fkey" FOREIGN KEY ("committedLabResultId") REFERENCES "LabResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabImportItem" ADD CONSTRAINT "LabImportItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ClinicService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ClinicService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New objects are private by default, matching the existing server-only access model.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',t.tablename);
    END IF;
  END LOOP;
END $$;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_valid_interval" CHECK ("endsAt">"startsAt");
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_valid_interval" CHECK ("endsAt">"startsAt");
ALTER TABLE "ClinicService" ADD CONSTRAINT "ClinicService_valid_duration" CHECK ("durationMinutes" BETWEEN 10 AND 180);
ALTER TABLE "User" ADD CONSTRAINT "User_employee_account_link" CHECK ("role"::text <> 'EMPLOYEE' OR "employeeId" IS NOT NULL);
ALTER TABLE "AttachmentChunk" ADD CONSTRAINT "AttachmentChunk_size_valid" CHECK ("offset">=0 AND "size">0 AND octet_length("data")="size");

CREATE INDEX "Allergy_createdById_idx" ON "Allergy"("createdById");
CREATE INDEX "Vaccination_createdById_idx" ON "Vaccination"("createdById");
CREATE INDEX "HealthEducation_createdById_idx" ON "HealthEducation"("createdById");
CREATE INDEX "ClinicalNote_createdById_idx" ON "ClinicalNote"("createdById");

-- Protect the audit trail at the database boundary, including raw SQL callers.
CREATE FUNCTION public.clinic_reject_audit_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END $$;
CREATE TRIGGER clinic_audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION public.clinic_reject_audit_change();
CREATE TRIGGER clinic_audit_no_truncate BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION public.clinic_reject_audit_change();
REVOKE ALL ON FUNCTION public.clinic_reject_audit_change() FROM PUBLIC;

CREATE FUNCTION public.clinic_reject_record_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
  RAISE EXCEPTION 'Clinical records must be archived or marked entered in error';
END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['Employee','Visit','LabResult','Allergy','Vaccination','HealthEducation','ClinicalNote','Attachment','LabImportBatch'] LOOP
    EXECUTE format('CREATE TRIGGER clinic_no_hard_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.clinic_reject_record_delete()',table_name);
    EXECUTE format('CREATE TRIGGER clinic_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.clinic_reject_record_delete()',table_name);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.clinic_reject_record_delete() FROM PUBLIC;

INSERT INTO "ClinicService" ("id","slug","nameAr","nameEn","descriptionAr","descriptionEn","mode","visitType","durationMinutes","sortOrder","updatedAt") VALUES
('svc_consultation','consultation','زيارة العيادة','Clinic consultation','تقييم الأعراض ومتابعة صحتك مع فريق العيادة.','Discuss symptoms and your health with the clinic team.','APPOINTMENT','CONSULTATION',20,1,CURRENT_TIMESTAMP),
('svc_follow_up','follow-up','زيارة متابعة','Follow-up visit','متابعة الخطة العلاجية ونتائج الزيارة السابقة.','Review your care plan and progress.','APPOINTMENT','FOLLOW_UP',20,2,CURRENT_TIMESTAMP),
('svc_occupational','occupational','الفحص الوظيفي','Occupational health','فحص دوري ومراجعة المتطلبات الصحية للعمل.','Periodic examination and occupational health review.','APPOINTMENT','PERIODIC',30,3,CURRENT_TIMESTAMP),
('svc_vaccination','vaccination','التطعيمات','Vaccination visit','مراجعة سجل التطعيم واستكمال الجرعات المطلوبة.','Review immunisation history and due doses.','APPOINTMENT','VACCINATION',20,4,CURRENT_TIMESTAMP),
('svc_lab_review','lab-review','مراجعة التحاليل','Lab result review','طلب مراجعة نتائج التحاليل مع فريق العيادة.','Ask the clinic team to review your laboratory results.','REQUEST','FOLLOW_UP',20,5,CURRENT_TIMESTAMP),
('svc_records','records','نسخة من السجل الصحي','Health record request','طلب نسخة معتمدة من السجل المتاح لك.','Request an authorised copy of your available health record.','REQUEST','OTHER',20,6,CURRENT_TIMESTAMP),
('svc_pre_employment','pre-employment','فحص ما قبل التوظيف','Pre-employment examination','استكمال التقييم والمتطلبات الصحية للموظف الجديد.','Complete the health assessment for a new employee.','APPOINTMENT','PRE_EMPLOYMENT',40,7,CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Prevent repeated results when an identical source is reviewed in another batch.
ALTER TABLE "LabResult" ADD COLUMN "sourceFingerprint" TEXT;
CREATE UNIQUE INDEX "LabResult_sourceFingerprint_key" ON "LabResult"("sourceFingerprint");
