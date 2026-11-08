-- Support global per-student recounts and individual histories without scanning all votes.
CREATE INDEX "PollVote_userId_pollId_idx" ON "PollVote" ("userId", "pollId");
