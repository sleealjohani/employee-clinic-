-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'AMENDED', 'ENTERED_IN_ERROR');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('ACUTE_CARE', 'FOLLOW_UP', 'PRE_EMPLOYMENT', 'PERIODIC', 'INJURY', 'EXPOSURE', 'VACCINATION', 'CONSULTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ResultType" AS ENUM ('QUANTITATIVE', 'QUALITATIVE');

-- CreateEnum
CREATE TYPE "LabFlag" AS ENUM ('NORMAL', 'LOW', 'HIGH', 'CRITICAL_LOW', 'CRITICAL_HIGH', 'REACTIVE', 'NON_REACTIVE', 'INDETERMINATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AllergyType" AS ENUM ('DRUG', 'FOOD', 'ENVIRONMENT', 'LATEX', 'INSECT', 'OTHER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING');

-- CreateEnum
CREATE TYPE "AllergyStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'REFUTED');

-- CreateEnum
CREATE TYPE "Certainty" AS ENUM ('CONFIRMED', 'SUSPECTED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'NEEDS_REVIEW', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED', 'SUGGESTED', 'UNMATCHED');

-- CreateEnum
CREATE TYPE "ItemReview" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "dob" TIMESTAMP(3),
    "gender" "Gender",
    "phone" TEXT,
    "email" TEXT,
    "employeeNo" TEXT,
    "department" TEXT,
    "jobTitle" TEXT,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3),
    "bloodType" TEXT,
    "chronicConditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentMedications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "department" TEXT,
    "jobTitle" TEXT,
    "employeeNo" TEXT,
    "status" "EmploymentStatus" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "VisitType" NOT NULL DEFAULT 'ACUTE_CARE',
    "chiefComplaint" TEXT,
    "diagnosis" TEXT,
    "plan" TEXT,
    "notes" TEXT,
    "tempC" DOUBLE PRECISION,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse" INTEGER,
    "respRate" INTEGER,
    "spo2" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabResult" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "resultType" "ResultType" NOT NULL DEFAULT 'QUANTITATIVE',
    "valueNum" DOUBLE PRECISION,
    "valueText" TEXT,
    "unit" TEXT,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "refText" TEXT,
    "flag" "LabFlag" NOT NULL DEFAULT 'UNKNOWN',
    "collectedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "orderNo" TEXT,
    "sampleNo" TEXT,
    "performedBy" TEXT,
    "verifiedBy" TEXT,
    "labName" TEXT,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "criticalNotifiedAt" TIMESTAMP(3),
    "criticalNotifiedTo" TEXT,
    "criticalAction" TEXT,
    "sourceAttachmentId" TEXT,
    "sourcePage" INTEGER,
    "extractionConfidence" DOUBLE PRECISION,
    "extractionCitation" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "AllergyType" NOT NULL,
    "substance" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "reaction" TEXT,
    "action" TEXT,
    "certainty" "Certainty" NOT NULL DEFAULT 'SUSPECTED',
    "allergyStatus" "AllergyStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaccination" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "vaccineCode" TEXT NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "doseNumber" INTEGER NOT NULL DEFAULT 1,
    "givenAt" TIMESTAMP(3) NOT NULL,
    "lotNumber" TEXT,
    "site" TEXT,
    "provider" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Vaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEducation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "providedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "HealthEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "employeeId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabImportBatch" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "model" TEXT,
    "promptVersion" TEXT,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "LabImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "extractedNationalId" TEXT,
    "extractedName" TEXT,
    "extractedEmployeeNo" TEXT,
    "nationalIdValid" BOOLEAN NOT NULL DEFAULT false,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchScore" DOUBLE PRECISION,
    "matchedEmployeeId" TEXT,
    "testCode" TEXT,
    "testName" TEXT,
    "resultType" "ResultType" NOT NULL DEFAULT 'QUANTITATIVE',
    "valueNum" DOUBLE PRECISION,
    "valueText" TEXT,
    "unit" TEXT,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "refText" TEXT,
    "collectedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "orderNo" TEXT,
    "sampleNo" TEXT,
    "performedBy" TEXT,
    "verifiedBy" TEXT,
    "labName" TEXT,
    "confidence" DOUBLE PRECISION,
    "citation" TEXT,
    "rawJson" JSONB,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "review" "ItemReview" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "committedLabResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_nationalId_key" ON "Employee"("nationalId");

-- CreateIndex
CREATE INDEX "Employee_department_idx" ON "Employee"("department");

-- CreateIndex
CREATE INDEX "Employee_isArchived_idx" ON "Employee"("isArchived");

-- CreateIndex
CREATE INDEX "Employee_name_idx" ON "Employee"("name");

-- CreateIndex
CREATE INDEX "EmploymentHistory_employeeId_idx" ON "EmploymentHistory"("employeeId");

-- CreateIndex
CREATE INDEX "Visit_employeeId_visitDate_idx" ON "Visit"("employeeId", "visitDate");

-- CreateIndex
CREATE INDEX "Visit_visitDate_idx" ON "Visit"("visitDate");

-- CreateIndex
CREATE INDEX "LabResult_employeeId_testCode_collectedAt_idx" ON "LabResult"("employeeId", "testCode", "collectedAt");

-- CreateIndex
CREATE INDEX "LabResult_requiresReview_idx" ON "LabResult"("requiresReview");

-- CreateIndex
CREATE INDEX "LabResult_collectedAt_idx" ON "LabResult"("collectedAt");

-- CreateIndex
CREATE INDEX "Allergy_employeeId_idx" ON "Allergy"("employeeId");

-- CreateIndex
CREATE INDEX "Vaccination_employeeId_vaccineCode_doseNumber_idx" ON "Vaccination"("employeeId", "vaccineCode", "doseNumber");

-- CreateIndex
CREATE INDEX "Vaccination_givenAt_idx" ON "Vaccination"("givenAt");

-- CreateIndex
CREATE INDEX "HealthEducation_employeeId_idx" ON "HealthEducation"("employeeId");

-- CreateIndex
CREATE INDEX "ClinicalNote_employeeId_idx" ON "ClinicalNote"("employeeId");

-- CreateIndex
CREATE INDEX "Attachment_employeeId_idx" ON "Attachment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "LabImportBatch_attachmentId_key" ON "LabImportBatch"("attachmentId");

-- CreateIndex
CREATE INDEX "LabImportBatch_status_idx" ON "LabImportBatch"("status");

-- CreateIndex
CREATE INDEX "LabImportItem_batchId_review_idx" ON "LabImportItem"("batchId", "review");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEducation" ADD CONSTRAINT "HealthEducation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEducation" ADD CONSTRAINT "HealthEducation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabImportBatch" ADD CONSTRAINT "LabImportBatch_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabImportBatch" ADD CONSTRAINT "LabImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabImportItem" ADD CONSTRAINT "LabImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LabImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabImportItem" ADD CONSTRAINT "LabImportItem_matchedEmployeeId_fkey" FOREIGN KEY ("matchedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

