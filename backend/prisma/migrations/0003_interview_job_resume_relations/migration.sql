ALTER TABLE "InterviewSession"
ADD COLUMN "jobId" UUID,
ADD COLUMN "resumeId" UUID;

CREATE INDEX "InterviewSession_jobId_idx" ON "InterviewSession"("jobId");
CREATE INDEX "InterviewSession_resumeId_idx" ON "InterviewSession"("resumeId");

ALTER TABLE "InterviewSession"
ADD CONSTRAINT "InterviewSession_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InterviewSession"
ADD CONSTRAINT "InterviewSession_resumeId_fkey"
FOREIGN KEY ("resumeId") REFERENCES "Resume"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
