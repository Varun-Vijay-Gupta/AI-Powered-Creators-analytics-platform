CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  video_key VARCHAR(1) NOT NULL CHECK (video_key IN ('A', 'B')),
  source VARCHAR(20) NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  creator_name TEXT,
  follower_count BIGINT,
  views BIGINT,
  likes BIGINT,
  comments BIGINT,
  upload_date TIMESTAMPTZ,
  duration_seconds INTEGER,
  hashtags TEXT[],
  transcript TEXT,
  engagement_rate NUMERIC(10, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, video_key)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_session ON videos(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);
