CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE "KnowledgeChunkLocal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "sourceType" VARCHAR(32) NOT NULL,
    "sourceId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "embedding" extensions.vector(384) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunkLocal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KnowledgeChunkLocal_sourceType_check" CHECK (
        "sourceType" IN ('RESUME', 'PROFILE', 'SKILL', 'ROADMAP', 'APPLICATION', 'JOB')
    ),
    CONSTRAINT "KnowledgeChunkLocal_chunkIndex_check" CHECK ("chunkIndex" >= 0),
    CONSTRAINT "KnowledgeChunkLocal_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeChunkLocal_user_source_chunk_key"
        UNIQUE ("userId", "sourceType", "sourceId", "chunkIndex")
);

CREATE INDEX "KnowledgeChunkLocal_user_source_idx"
    ON "KnowledgeChunkLocal"("userId", "sourceType", "sourceId");

CREATE INDEX "KnowledgeChunkLocal_user_id_idx"
    ON "KnowledgeChunkLocal"("userId", "id");

CREATE INDEX "KnowledgeChunkLocal_embedding_hnsw_idx"
    ON "KnowledgeChunkLocal" USING hnsw ("embedding" extensions.vector_cosine_ops);

ALTER TABLE "KnowledgeChunkLocal" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "KnowledgeChunkLocal" FROM PUBLIC, anon, authenticated;
