# AGENTS.md - Arbiter Discord Bot

## Overview
Arbiter is an advanced Discord bot designed for The Debate Server that monitors conversations for logical contradictions and critical misinformation. It embodies a stoic, truth-focused personality that prioritizes accuracy over diplomacy while maintaining intellectual integrity in debate analysis.

## Commands
- **Start bot**: `node bot.js` or `npm start`
- **Start bot (production)**: `NODE_ENV=production node bot.js`
- **Testing**: Manual/integration testing only - no automated test framework

## Logging Options
- **Simple logs (default)**: Clean, readable output for development - just shows messages
- **Structured logs**: Full JSON format with metadata for production monitoring
- **Toggle simple logs**: Set `logging.useSimpleFormat: false` in config or `SIMPLE_LOGS=false`
- **View logs (development)**: Clean messages: `[INFO] Bot ready` vs verbose JSON
- **View logs (production)**: Full JSON format for log aggregation systems

## Version Management
- **Check current version**: `npm run version:info`
- **Patch release** (bug fixes): `npm run release:patch` (1.1.0 → 1.1.1)
- **Minor release** (new features): `npm run release:minor` (1.1.0 → 1.2.0)  
- **Major release** (breaking changes): `npm run release:major` (1.1.0 → 2.0.0)
- **Manual version**: `npm version [patch|minor|major]` (no echo message)

### When to Use Each Version Type:
- **PATCH** (x.x.X): Bug fixes, security patches, performance improvements, code cleanup
- **MINOR** (x.X.x): New features, new commands, enhanced functionality, dependency updates
- **MAJOR** (X.x.x): Breaking changes, config format changes, database schema changes, API changes

### Version History:
- **v1.3.0** (Current): Enhanced trivial message detection, smart Exa usage (exaAnswer for questions, exaSearch for statements), enabled simple logging in production
- **v1.2.0**: Added configurable simple logging format for better development readability - clean messages instead of verbose JSON
- **v1.1.2**: Fixed unnecessary Exa queries and source buttons for trivial messages like greetings, improved MongoDB index logging
- **v1.1.1**: Fixed ReferenceError in user-facing reply handler causing bot mentions to fail, improved error logging
- **v1.1.0**: Major refactor with security enhancements, performance optimizations, prompt injection fixes, resource leak fixes, and architecture improvements

### 🤖 AI Agent Instructions:
**IMPORTANT**: When making changes to the codebase, always update the version number using the appropriate command:
- For **bug fixes, security patches, performance improvements**: `npm run release:patch`
- For **new features, commands, or functionality**: `npm run release:minor` 
- For **breaking changes or major architectural changes**: `npm run release:major`

After making changes, update the Version History section above with a brief description of what was changed.

## Architecture & Core Files

### **Primary Components**
- **`bot.js`** - Main entry point with Discord.js v14 integration, Express keepalive server (port 3000), message processing, and detection orchestration
- **`ai.js`** - DigitalOcean AI Platform integration with specialized model chains for different reasoning tasks
- **`mongo.js`** - MongoDB connection handler for persistent message storage and intelligent summarization
- **`logic.js`** - Advanced logical reasoning framework with context-aware principles and content analysis

### **Core Functionality**
- **Contradiction Detection**: Identifies logical contradictions in user messages across conversation history using semantic validation
- **Misinformation Detection**: Flags critical false information using Exa API fact-checking and evidence verification
- **Contextual Memory**: Intelligent message storage with automatic summarization and history pruning
- **Enhanced Reasoning**: Applies logical principles and content analysis for accurate debate evaluation
- **Admin Controls**: Owner-only commands for memory management and system analysis

## AI Model Configuration

### **DigitalOcean AI Platform Models**
- **User-Facing Replies**: `openai-gpt-5` → `anthropic-claude-3.7-sonnet` (temp: 0.8, tokens: 2048)
- **Contradiction Detection**: `openai-gpt-4o-mini` → `llama3.3-70b-instruct` (temp: 0.3, tokens: 1024)
- **Misinformation Detection**: `openai-gpt-4o` → `deepseek-r1-distill-llama-70b` (temp: 0.3, tokens: 1536)
- **Summarization**: `anthropic-claude-3.5-haiku` → `mistral-nemo-instruct-2407` (temp: 0.5, tokens: 1024)

## Key Features

### **Intelligent Detection System**
- **Cross-message contradictions**: Detects logical incompatibilities across user's message history
- **Self-contradictions**: Identifies contradictory statements within single messages
- **Topic relevance validation**: Prevents false positives between unrelated subjects
- **Semantic agreement detection**: Avoids flagging statements that express similar concepts differently
- **Critical misinformation flagging**: Focuses on medically dangerous, scientifically harmful, or definitively falsified claims

### **Advanced Message Processing**
- **Substantiveness scoring**: Prevents unnecessary API calls on trivial content while ensuring high-impact topics are always analyzed
- **Content analysis caching**: Performance optimization with TTL-based cache management
- **Smart filtering**: Multi-layer trivial message detection with modern slang recognition
- **Evidence validation**: Ensures AI-reported contradictions have actual basis in message history

### **Enhanced User Experience**
- **Clean formatting**: Strikethrough code blocks for contradictory statements
- **Smart buttons**: Side-by-side link buttons (🔗) for navigation and source buttons (📚) for fact-check references
- **Combined detection**: Single comprehensive reply when both contradiction and misinformation are detected
- **Message truncation**: Automatic handling of Discord's 2000 character limit

## Environment Variables

Required in `.env` file:
```env
DISCORD_TOKEN=your_discord_bot_token
DO_AI_API_KEY=your_digitalocean_ai_api_key
MONGODB_URI=your_mongodb_connection_string
EXA_API_KEY=your_exa_api_key
ALLOWED_CHANNELS=channel_id_1,channel_id_2 (optional)
PORT=3000 (optional, defaults to 3000)
```

## Admin Commands (Owner Only)
- **`!arbiter_reset_all`** - Completely wipe bot memory and message history
- **`!arbiter_analyze [text]`** - Perform logical analysis on provided text content
- **`!arbiter_principle [name]`** - Explain specific logical principles (nonContradiction, excludedMiddle, identity)
- **`!arbiter_status`** - Show system status including circuit breakers, cache sizes, and detection state
- **`!arbiter_toggle_detection`** - Toggle contradiction/misinformation detection on/off (messages still stored for context)
- **`!arbiter_toggle_logic`** - Toggle logical principles framework (enhanced reasoning vs basic reasoning)

## Code Style & Conventions

### **Language & Structure**
- **Runtime**: CommonJS Node.js with Discord.js v14, Express, MongoDB, Axios
- **Naming**: camelCase for functions/variables, UPPER_CASE for constants, PascalCase for classes
- **Async handling**: Async/await pattern throughout, named functions preferred over arrow functions
- **Error handling**: Try-catch blocks with graceful fallbacks, console.warn for non-critical errors
- **Comments**: Minimal inline comments, section headers for major functional blocks

### **Performance Optimizations**
- **Caching strategy**: Maps with TTL for history queries, content analysis, and validation results
- **Early filtering**: Multi-stage trivial message detection to prevent unnecessary processing
- **Smart API usage**: Substantiveness scoring to avoid expensive operations on low-value content
- **Memory management**: Automatic cleanup intervals for cache maps and source button mappings

### **Database Design**
- **Collection**: "messages" with message history, summaries, and metadata
- **Document types**: "message" (user content), "summary" (conversation summaries)
- **Auto-summarization**: Triggers when channel message count exceeds threshold with intelligent content filtering

## Personality & Behavior

### **Core Traits**
- **Stoic and direct**: Truth-focused without diplomatic softening
- **Intellectually honest**: Acknowledges when evidence favors one position over another
- **Context-aware**: Considers uncertainty markers, temporal qualifiers, and conversation nuance
- **Precise language**: Avoids hedging when facts are clear, uses decisive statements appropriately

### **Detection Philosophy**
- **Contradiction**: Only flags true logical incompatibilities, not opinion differences or temporal position changes
- **Misinformation**: Targets critical false information that could cause harm, excludes contested theories or minor inaccuracies
- **Evidence-based**: Requires strong factual backing for claims, respects scientific consensus while acknowledging limitations

## Deployment
- **Platform**: Render.com with automatic GitHub integration
- **Build command**: `npm install`
- **Start command**: `npm start`
- **Monitoring**: Express keepalive server prevents idle timeout, comprehensive logging for debugging

## Development Notes
- **Manual testing**: Use Discord mentions and replies for functional testing
- **Debug logging**: Comprehensive console output for detection logic, API calls, and performance metrics
- **Graceful degradation**: Bot maintains core functionality even if individual components fail
- **Modular design**: Clean separation between AI integration, database operations, logical reasoning, and Discord handling

## Future Considerations
- **Configurable logical principles**: Toggle system for testing reasoning framework effectiveness
- **Enhanced topic detection**: Expandable subject classification for better contradiction validation
- **Performance metrics**: Potential integration of response time and accuracy monitoring
- **Extended admin tooling**: Additional analysis and debugging commands for system insights
