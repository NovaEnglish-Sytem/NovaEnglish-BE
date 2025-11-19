-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TUTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE_NOT_GIVEN', 'SHORT_ANSWER');

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
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
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
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestPaper" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "PaperStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPage" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
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
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionItem" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "itemOrder" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "promptHtml" TEXT NOT NULL,
    "choicesJson" JSONB,
    "correctKeys" TEXT[],
    "answerText" TEXT,
    "mediaId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandScore" (
    "id" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "minScore" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BandScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "bandScoreId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "overallBandScore" TEXT,
    "bandScoreId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestAttempt" (
    "id" TEXT NOT NULL,
    "testPaperId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "recordId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "percentageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandScoreId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestAttemptSection" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "categoryId" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestAttemptSection_pkey" PRIMARY KEY ("id")
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveTestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemporaryAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "selectedKeys" TEXT[],
    "textAnswer" TEXT,
    "audioPlayCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemporaryAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentPackageHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL DEFAULT 1,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentPackageHistory_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "QuestionCategory_code_key" ON "QuestionCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionCategory_name_key" ON "QuestionCategory"("name");

-- CreateIndex
CREATE INDEX "QuestionCategory_name_idx" ON "QuestionCategory"("name");

-- CreateIndex
CREATE INDEX "QuestionCategory_createdById_idx" ON "QuestionCategory"("createdById");

-- CreateIndex
CREATE INDEX "QuestionPackage_categoryId_idx" ON "QuestionPackage"("categoryId");

-- CreateIndex
CREATE INDEX "QuestionPackage_isPublished_idx" ON "QuestionPackage"("isPublished");

-- CreateIndex
CREATE INDEX "QuestionPackage_createdById_idx" ON "QuestionPackage"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionPackage_categoryId_title_key" ON "QuestionPackage"("categoryId", "title");

-- CreateIndex
CREATE INDEX "TestPaper_packageId_idx" ON "TestPaper"("packageId");

-- CreateIndex
CREATE INDEX "TestPaper_status_idx" ON "TestPaper"("status");

-- CreateIndex
CREATE INDEX "TestPaper_createdById_idx" ON "TestPaper"("createdById");

-- CreateIndex
CREATE INDEX "QuestionPage_paperId_pageOrder_idx" ON "QuestionPage"("paperId", "pageOrder");

-- CreateIndex
CREATE INDEX "MediaAsset_createdById_idx" ON "MediaAsset"("createdById");

-- CreateIndex
CREATE INDEX "QuestionItem_pageId_itemOrder_idx" ON "QuestionItem"("pageId", "itemOrder");

-- CreateIndex
CREATE INDEX "QuestionItem_mediaId_idx" ON "QuestionItem"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "BandScore_band_key" ON "BandScore"("band");

-- CreateIndex
CREATE INDEX "BandScore_order_idx" ON "BandScore"("order");

-- CreateIndex
CREATE INDEX "BandScore_band_idx" ON "BandScore"("band");

-- CreateIndex
CREATE INDEX "Feedback_bandScoreId_idx" ON "Feedback"("bandScoreId");

-- CreateIndex
CREATE INDEX "TestRecord_studentId_idx" ON "TestRecord"("studentId");

-- CreateIndex
CREATE INDEX "TestRecord_completedAt_idx" ON "TestRecord"("completedAt");

-- CreateIndex
CREATE INDEX "TestRecord_bandScoreId_idx" ON "TestRecord"("bandScoreId");

-- CreateIndex
CREATE INDEX "TestAttempt_studentId_idx" ON "TestAttempt"("studentId");

-- CreateIndex
CREATE INDEX "TestAttempt_testPaperId_idx" ON "TestAttempt"("testPaperId");

-- CreateIndex
CREATE INDEX "TestAttempt_recordId_idx" ON "TestAttempt"("recordId");

-- CreateIndex
CREATE INDEX "TestAttempt_completedAt_idx" ON "TestAttempt"("completedAt");

-- CreateIndex
CREATE INDEX "TestAttempt_bandScoreId_idx" ON "TestAttempt"("bandScoreId");

-- CreateIndex
CREATE INDEX "TestAttemptSection_attemptId_idx" ON "TestAttemptSection"("attemptId");

-- CreateIndex
CREATE INDEX "TestAttemptSection_categoryId_idx" ON "TestAttemptSection"("categoryId");

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
CREATE INDEX "TemporaryAnswer_updatedAt_idx" ON "TemporaryAnswer"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemporaryAnswer_attemptId_itemId_key" ON "TemporaryAnswer"("attemptId", "itemId");

-- CreateIndex
CREATE INDEX "StudentPackageHistory_studentId_categoryId_turnNumber_idx" ON "StudentPackageHistory"("studentId", "categoryId", "turnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StudentPackageHistory_studentId_categoryId_packageId_turnNu_key" ON "StudentPackageHistory"("studentId", "categoryId", "packageId", "turnNumber");

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionCategory" ADD CONSTRAINT "QuestionCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPackage" ADD CONSTRAINT "QuestionPackage_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "QuestionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPackage" ADD CONSTRAINT "QuestionPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPaper" ADD CONSTRAINT "TestPaper_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "QuestionPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPaper" ADD CONSTRAINT "TestPaper_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPage" ADD CONSTRAINT "QuestionPage_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "TestPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionItem" ADD CONSTRAINT "QuestionItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "QuestionPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionItem" ADD CONSTRAINT "QuestionItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_bandScoreId_fkey" FOREIGN KEY ("bandScoreId") REFERENCES "BandScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRecord" ADD CONSTRAINT "TestRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRecord" ADD CONSTRAINT "TestRecord_bandScoreId_fkey" FOREIGN KEY ("bandScoreId") REFERENCES "BandScore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_testPaperId_fkey" FOREIGN KEY ("testPaperId") REFERENCES "TestPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "TestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_bandScoreId_fkey" FOREIGN KEY ("bandScoreId") REFERENCES "BandScore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttemptSection" ADD CONSTRAINT "TestAttemptSection_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveTestSession" ADD CONSTRAINT "ActiveTestSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveTestSession" ADD CONSTRAINT "ActiveTestSession_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveTestSession" ADD CONSTRAINT "ActiveTestSession_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "TestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryAnswer" ADD CONSTRAINT "TemporaryAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPackageHistory" ADD CONSTRAINT "StudentPackageHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPackageHistory" ADD CONSTRAINT "StudentPackageHistory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "QuestionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPackageHistory" ADD CONSTRAINT "StudentPackageHistory_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "QuestionPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
