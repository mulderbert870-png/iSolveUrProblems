/**
 * M3.0c — Conversation transcript types.
 *
 * Mirrors the columns in 20260608_transcripts.sql.
 */

export type TranscriptSpeaker = "user" | "avatar";

export type TranscriptRow = {
  id: string;
  user_id: string | null;
  session_id: string;
  speaker: TranscriptSpeaker;
  text: string;
  context: Record<string, unknown>;
  created_at: string;
};

/** Shape clients post to /api/transcripts/append. */
export type AppendTranscriptInput = {
  session_id: string;
  speaker: TranscriptSpeaker;
  text: string;
  context?: Record<string, unknown>;
};
