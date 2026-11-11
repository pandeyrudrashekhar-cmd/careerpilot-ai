CREATE TYPE "RoadmapGenerationSource" AS ENUM ('DETERMINISTIC', 'AI');

ALTER TABLE "Job"
ADD COLUMN "requiredSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "optionalSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "LearningRoadmap"
ADD COLUMN "generationSource" "RoadmapGenerationSource" NOT NULL DEFAULT 'DETERMINISTIC';
