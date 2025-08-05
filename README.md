# Arbiter

**Arbiter** is the official debate-theory and fact-monitoring bot for The Debate Server. It operates passively in relevant channels, surfaces critical information only when necessary, and preserves ongoing context for meaningful, responsible moderation and reference.

---

## What Arbiter Does

- **Contextual Replies**
  - Only responds to direct @mentions or to replies to its own messages.
  - References recent discussion and news results for accurate, concise answers.

- **Contradiction & Misinformation Detection**
  - Monitors all channel messages.
  - Only surfaces to chat when:
    - A user contradicts their *own* previously stated facts.
    - A message contains blatant misinformation contradicted by reliable web sources.
  - Alerts are clearly labeled with emoji and present evidence or sources.

- **Long-Term Channel Memory**
  - Maintains a rolling window of recent messages in each channel for active context.
  - Summarizes and consolidates older discussion so long-term context is never lost and storage footprint remains efficient.

- **Nonintrusive, Smart Logging**
  - Never spams or injects itself into everyday discussion.
  - All background checks and system errors are logged silently for review; only actionable findings or requested responses reach the channel.

---

## How It Works

- Channel memory is capped per channel; when history exceeds this, older messages are briefly summarized and the full log is trimmed back.
- Contradiction checks are always scoped to whether a user contradicts themselves, not others.
- Misinformation is only surfaced when clearly demonstrated by up-to-date, sourced web context.
- Replies always mention the alert type (🚩 MISINFORMATION or ⚡ CONTRADICTION) and provide quoted evidence and reasoning.

---

## Technical Stack

- Node.js, Discord.js, MongoDB
- Gemini LLM for fact-checking, contradiction and summarization
- Exa Web Search for live, external context

---

**This bot is exclusive to The Debate Server and is not for general public use or redistribution.**