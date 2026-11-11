CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE "KnowledgeChunk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "sourceType" VARCHAR(32) NOT NULL,
    "sourceId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "embedding" extensions.vector(1536) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KnowledgeChunk_sourceType_check" CHECK (
        "sourceType" IN ('RESUME', 'PROFILE', 'SKILL', 'ROADMAP', 'APPLICATION', 'JOB')
    ),
    CONSTRAINT "KnowledgeChunk_chunkIndex_check" CHECK ("chunkIndex" >= 0),
    CONSTRAINT "KnowledgeChunk_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeChunk_user_source_chunk_key"
        UNIQUE ("userId", "sourceType", "sourceId", "chunkIndex")
);

CREATE INDEX "KnowledgeChunk_user_source_idx"
    ON "KnowledgeChunk"("userId", "sourceType", "sourceId");

CREATE INDEX "KnowledgeChunk_user_id_idx"
    ON "KnowledgeChunk"("userId", "id");

CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx"
    ON "KnowledgeChunk" USING hnsw ("embedding" extensions.vector_cosine_ops);

ALTER TABLE "KnowledgeChunk" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "KnowledgeChunk" FROM PUBLIC, anon, authenticated;
