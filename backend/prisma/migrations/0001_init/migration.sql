-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('PROGRAMMING_LANGUAGE', 'FRAMEWORK', 'LIBRARY', 'DATABASE', 'CLOUD_DEVOPS', 'TOOL', 'SOFT_SKILL', 'DOMAIN', 'OTHER');

-- CreateEnum
CREATE TYPE "ProficiencyLevel" AS ENUM ('BEGINNER', 'ELEMENTARY', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "SkillEvidenceSource" AS ENUM ('SELF_REPORTED', 'RESUME', 'ASSESSMENT', 'INTERVIEW', 'AI_INFERRED', 'OTHER');

-- CreateEnum
CREATE TYPE "ResumeProcessingStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResumeAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RemoteStatus" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'APPRENTICESHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('EXTERNAL_PROVIDER', 'MANUAL');

-- CreateEnum
CREATE TYPE "RoadmapStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoadmapPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RoadmapItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'HR', 'MIXED', 'OTHER');

-- CreateEnum
CREATE TYPE "InterviewDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "InterviewSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "InterviewQuestionType" AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'SITUATIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(160),
    "headline" VARCHAR(240),
    "summary" TEXT,
    "location" VARCHAR(200),
    "websiteUrl" VARCHAR(2048),
    "githubUrl" VARCHAR(2048),
    "linkedinUrl" VARCHAR(2048),
    "targetRole" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalizedName" VARCHAR(120) NOT NULL,
    "category" "SkillCategory" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSkill" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "proficiency" "ProficiencyLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "yearsExperience" DECIMAL(4,1),
    "evidenceSource" "SkillEvidenceSource" NOT NULL DEFAULT 'SELF_REPORTED',
    "evidence" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "storageBucket" VARCHAR(100) NOT NULL DEFAULT 'resumes',
    "storagePath" VARCHAR(1024) NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128),
    "processingStatus" "ResumeProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeAnalysis" (
    "id" UUID NOT NULL,
    "resumeId" UUID NOT NULL,
    "status" "ResumeAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "skills" JSONB,
    "experienceSummary" TEXT,
    "education" JSONB,
    "strengths" JSONB,
    "improvementSuggestions" JSONB,
    "provider" VARCHAR(100),
    "model" VARCHAR(160),
    "analyzedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ResumeAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "company" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "location" VARCHAR(240),
    "remoteStatus" "RemoteStatus" NOT NULL DEFAULT 'UNSPECIFIED',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'OTHER',
    "source" "JobSource" NOT NULL DEFAULT 'MANUAL',
    "provider" VARCHAR(120),
    "externalId" VARCHAR(255),
    "applicationUrl" VARCHAR(2048),
    "postedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "resumeId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "matchScore" SMALLINT NOT NULL,
    "matchedSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "explanation" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningRoadmap" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceResumeId" UUID,
    "targetRole" VARCHAR(200) NOT NULL,
    "skillGaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "RoadmapStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LearningRoadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" UUID NOT NULL,
    "roadmapId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT NOT NULL,
    "learningResources" JSONB,
    "estimatedEffortHours" DECIMAL(7,2),
    "priority" "RoadmapPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RoadmapItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" UUID,
    "resumeId" UUID,
    "company" VARCHAR(200) NOT NULL,
    "role" VARCHAR(240) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationStatusHistory" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "InterviewType" NOT NULL,
    "targetRole" VARCHAR(200) NOT NULL,
    "difficulty" "InterviewDifficulty" NOT NULL DEFAULT 'INTERMEDIATE',
    "status" "InterviewSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "InterviewQuestionType" NOT NULL DEFAULT 'OTHER',
    "prompt" TEXT NOT NULL,
    "expectedAnswer" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAnswer" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "evaluationFeedback" TEXT,
    "evaluation" JSONB,
    "score" SMALLINT,
    "provider" VARCHAR(100),
    "model" VARCHAR(160),
    "answeredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InterviewAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(240),
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "provider" VARCHAR(100),
    "model" VARCHAR(160),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_normalizedName_key" ON "Skill"("normalizedName");

-- CreateIndex
CREATE INDEX "Skill_category_normalizedName_idx" ON "Skill"("category", "normalizedName");

-- CreateIndex
CREATE INDEX "UserSkill_skillId_proficiency_idx" ON "UserSkill"("skillId", "proficiency");

-- CreateIndex
CREATE INDEX "UserSkill_userId_proficiency_idx" ON "UserSkill"("userId", "proficiency");

-- CreateIndex
CREATE UNIQUE INDEX "UserSkill_userId_skillId_key" ON "UserSkill"("userId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_storagePath_key" ON "Resume"("storagePath");

-- CreateIndex
CREATE INDEX "Resume_userId_isActive_idx" ON "Resume"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Resume_userId_processingStatus_idx" ON "Resume"("userId", "processingStatus");

-- CreateIndex
CREATE INDEX "Resume_userId_createdAt_idx" ON "Resume"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResumeAnalysis_resumeId_createdAt_idx" ON "ResumeAnalysis"("resumeId", "createdAt");

-- CreateIndex
CREATE INDEX "ResumeAnalysis_status_createdAt_idx" ON "ResumeAnalysis"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_source_postedAt_idx" ON "Job"("source", "postedAt");

-- CreateIndex
CREATE INDEX "Job_remoteStatus_employmentType_idx" ON "Job"("remoteStatus", "employmentType");

-- CreateIndex
CREATE INDEX "Job_location_idx" ON "Job"("location");

-- CreateIndex
CREATE INDEX "Job_expiresAt_idx" ON "Job"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_provider_externalId_key" ON "Job"("provider", "externalId");

-- CreateIndex
CREATE INDEX "JobMatch_userId_createdAt_idx" ON "JobMatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "JobMatch_jobId_matchScore_idx" ON "JobMatch"("jobId", "matchScore");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_userId_resumeId_jobId_key" ON "JobMatch"("userId", "resumeId", "jobId");

-- CreateIndex
CREATE INDEX "LearningRoadmap_userId_status_idx" ON "LearningRoadmap"("userId", "status");

-- CreateIndex
CREATE INDEX "LearningRoadmap_userId_createdAt_idx" ON "LearningRoadmap"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningRoadmap_sourceResumeId_idx" ON "LearningRoadmap"("sourceResumeId");

-- CreateIndex
CREATE INDEX "RoadmapItem_roadmapId_status_idx" ON "RoadmapItem"("roadmapId", "status");

-- CreateIndex
CREATE INDEX "RoadmapItem_roadmapId_priority_idx" ON "RoadmapItem"("roadmapId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItem_roadmapId_order_key" ON "RoadmapItem"("roadmapId", "order");

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE INDEX "Application_userId_appliedAt_idx" ON "Application"("userId", "appliedAt");

-- CreateIndex
CREATE INDEX "Application_jobId_idx" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_resumeId_idx" ON "Application"("resumeId");

-- CreateIndex
CREATE INDEX "ApplicationStatusHistory_applicationId_createdAt_idx" ON "ApplicationStatusHistory"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_status_idx" ON "InterviewSession"("userId", "status");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_createdAt_idx" ON "InterviewSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewQuestion_sessionId_type_idx" ON "InterviewQuestion"("sessionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_sessionId_order_key" ON "InterviewQuestion"("sessionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewAnswer_questionId_key" ON "InterviewAnswer"("questionId");

-- CreateIndex
CREATE INDEX "Conversation_userId_status_updatedAt_idx" ON "Conversation"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_userId_createdAt_idx" ON "Conversation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_sequence_key" ON "Message"("conversationId", "sequence");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeAnalysis" ADD CONSTRAINT "ResumeAnalysis_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRoadmap" ADD CONSTRAINT "LearningRoadmap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRoadmap" ADD CONSTRAINT "LearningRoadmap_sourceResumeId_fkey" FOREIGN KEY ("sourceResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "LearningRoadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStatusHistory" ADD CONSTRAINT "ApplicationStatusHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
