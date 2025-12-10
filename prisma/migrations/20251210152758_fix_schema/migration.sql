-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TUTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE_NOT_GIVEN', 'SHORT_ANSWER', 'MATCHING_DROPDOWN');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "PaperStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneE164" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "placeOfBirth" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenHash" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPackage" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "PaperStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPage" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "pageOrder" INTEGER NOT NULL,
    "storyPassage" TEXT,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageId" TEXT,
    "itemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionItem" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "itemOrder" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "question" TEXT NOT NULL,
    "choicesJson" JSONB,
    "correctKey" TEXT,
    "answerText" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "averageScore" DOUBLE PRECISION,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestAttempt" (
    "id" TEXT NOT NULL,
    "packageId" TEXT,
    "studentId" TEXT NOT NULL,
    "recordId" TEXT,
    "packageTitle" TEXT,
    "categoryName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalScore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveTestSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "recordId" TEXT,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "packageId" TEXT,
    "turnNumber" INTEGER,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveTestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemporaryAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "selectedKey" TEXT,
    "textAnswer" JSONB,
    "audioPlayCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemporaryAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_lastLogin_idx" ON "User"("lastLogin");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_idx" ON "VerificationToken"("userId");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionCategory_name_key" ON "QuestionCategory"("name");

-- CreateIndex
CREATE INDEX "QuestionCategory_name_idx" ON "QuestionCategory"("name");

-- CreateIndex
CREATE INDEX "QuestionPackage_categoryId_idx" ON "QuestionPackage"("categoryId");

-- CreateIndex
CREATE INDEX "QuestionPackage_status_idx" ON "QuestionPackage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionPackage_categoryId_title_key" ON "QuestionPackage"("categoryId", "title");

-- CreateIndex
CREATE INDEX "QuestionPage_packageId_pageOrder_idx" ON "QuestionPage"("packageId", "pageOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_pageId_type_key" ON "MediaAsset"("pageId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_itemId_type_key" ON "MediaAsset"("itemId", "type");

-- CreateIndex
CREATE INDEX "QuestionItem_pageId_itemOrder_idx" ON "QuestionItem"("pageId", "itemOrder");

-- CreateIndex
CREATE INDEX "TestRecord_studentId_idx" ON "TestRecord"("studentId");

-- CreateIndex
CREATE INDEX "TestAttempt_studentId_idx" ON "TestAttempt"("studentId");

-- CreateIndex
CREATE INDEX "TestAttempt_packageId_idx" ON "TestAttempt"("packageId");

-- CreateIndex
CREATE INDEX "TestAttempt_recordId_idx" ON "TestAttempt"("recordId");

-- CreateIndex
CREATE INDEX "TestAttempt_completedAt_idx" ON "TestAttempt"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveTestSession_studentId_key" ON "ActiveTestSession"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveTestSession_attemptId_key" ON "ActiveTestSession"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveTestSession_sessionToken_key" ON "ActiveTestSession"("sessionToken");

-- CreateIndex
CREATE INDEX "ActiveTestSession_studentId_idx" ON "ActiveTestSession"("studentId");

-- CreateIndex
CREATE INDEX "ActiveTestSession_attemptId_idx" ON "ActiveTestSession"("attemptId");

-- CreateIndex
CREATE INDEX "ActiveTestSession_sessionToken_idx" ON "ActiveTestSession"("sessionToken");

-- CreateIndex
CREATE INDEX "ActiveTestSession_expiresAt_idx" ON "ActiveTestSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ActiveTestSession_recordId_idx" ON "ActiveTestSession"("recordId");

-- CreateIndex
CREATE INDEX "TemporaryAnswer_attemptId_idx" ON "TemporaryAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "TemporaryAnswer_createdAt_idx" ON "TemporaryAnswer"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemporaryAnswer_attemptId_itemId_key" ON "TemporaryAnswer"("attemptId", "itemId");

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPackage" ADD CONSTRAINT "QuestionPackage_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "QuestionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPage" ADD CONSTRAINT "QuestionPage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "QuestionPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "QuestionPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionItem" ADD CONSTRAINT "QuestionItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "QuestionPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRecord" ADD CONSTRAINT "TestRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "QuestionPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "TestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveTestSession" ADD CONSTRAINT "ActiveTestSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveTestSession" ADD CONSTRAINT "ActiveTestSession_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveTestSession" ADD CONSTRAINT "ActiveTestSession_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "TestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryAnswer" ADD CONSTRAINT "TemporaryAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
