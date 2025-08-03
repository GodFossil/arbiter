# Overview

Arbiter is a Discord bot designed to combat misinformation through intelligent fact-checking and contradiction detection. The bot monitors Discord channels for potentially false claims, verifies them against authoritative sources, and provides educational responses to users. It features advanced AI-powered claim extraction, multi-step verification processes, and user-friendly educational messaging to promote media literacy.

## Current Status (January 2025)
✅ **Core System Operational**: Discord bot "Test Boy#8489" successfully connected and running  
✅ **Zero False Positive Architecture**: Implemented with >80% confidence threshold requirement  
✅ **Multi-Step Verification Pipeline**: Complete with claim extraction, source verification, and contradiction detection  
✅ **Google Search Integration**: Configured with user's Google Custom Search API  
✅ **MongoDB Connected**: Full database connectivity established for persistent memory  
✅ **Enhanced Performance System**: All 6 critical improvements successfully implemented:
   • **Content Fetching**: Full article content retrieval from web sources (vs snippets only)
   • **Response Caching**: Intelligent caching system for fact-checks, searches, and content 
   • **Parallel Processing**: Concurrent claim verification with batch processing and rate limiting
   • **Robust Error Handling**: Circuit breakers, fallbacks, and graceful degradation
   • **Thread Context Analysis**: Full conversation awareness with context-aware fact-checking
   • **Interactive Verification**: User-driven detailed analysis with challenge/explanation system

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Components

**Discord Bot Framework**: Built on Discord.js v14 with gateway intents for message monitoring. The bot maintains persistent connections to Discord servers and processes messages in real-time.

**AI-Powered Analysis**: Utilizes OpenAI's GPT-4o model for multiple analysis tasks including claim extraction, contradiction detection, source analysis, and confidence scoring. The system employs structured JSON responses for consistent data processing.

**Multi-Step Fact-Checking Pipeline**: 
- **Claim Extraction**: Identifies verifiable factual statements while filtering out opinions and sarcasm
- **Plausibility Check**: Initial assessment to catch obviously true/false claims
- **Source Verification**: Web search integration to find authoritative sources
- **Cross-Reference Analysis**: Compares claims against multiple credible sources
- **Contradiction Detection**: Analyzes user's message history for inconsistencies
- **Confidence Scoring**: Final assessment with high threshold (>0.8) for flagging content

**Memory System**: Three-layer memory architecture:
- User memory tracks individual conversation context, preferences, and fact-check history
- Channel memory maintains message history and misinformation alerts per Discord channel  
- Performance cache system with intelligent TTL management for fact-checks, search results, and content

**Web Search Integration**: Implements Google Custom Search API with intelligent fallback system. Generates multiple search queries per claim and ranks sources by credibility. Enhanced with timeout handling and rate limit detection.

## Data Architecture

**MongoDB Database**: Document-based storage with three main schemas:
- User Memory: Personal context, preferences, and fact-check history
- Channel Memory: Channel-specific message logs and alert tracking  
- Fact Check Records: Detailed verification results with sources and reasoning

**Source Quality Assessment**: Evaluates web sources based on domain authority, content relevance, and cross-referencing with other sources. Enhanced with full content fetching, parallel processing, and intelligent caching for improved accuracy.

## Safety and Accuracy Features

**High Confidence Threshold**: Only flags content when confidence exceeds 80% to minimize false positives. Errs on the side of caution to maintain user trust.

**Educational Approach**: Provides non-confrontational responses focused on media literacy rather than direct contradiction of users.

**Comprehensive Logging**: Structured JSON logging for all fact-checking activities, enabling performance monitoring and system improvements. Enhanced with error tracking, circuit breaker monitoring, and performance statistics reporting every 5 minutes.

# External Dependencies

**Discord API**: Real-time message monitoring and bot interactions through Discord.js v14 framework.

**OpenAI API**: GPT-4o model for natural language processing, claim analysis, and content generation across all AI-powered features.

**MongoDB**: Primary database for persistent storage of user contexts, channel memories, and fact-checking records.

**Google Custom Search API**: Web search functionality for finding authoritative sources during fact-checking process. Enhanced with timeout handling, rate limit detection, and intelligent fallback system.

**Express.js Web Server**: Minimal HTTP server to maintain bot availability on hosting platforms like Render.

**Environment Variables**: Secure configuration management for API keys (Discord, OpenAI, MongoDB, Google Search API) and deployment settings.

## Performance Enhancements (January 2025)

**Content Fetching System**: New `ContentFetcher` service extracts full article content from web sources instead of relying only on search snippets. Features intelligent content extraction, HTML parsing, timeout handling, and respectful rate limiting.

**Response Caching System**: Comprehensive `CacheManager` with different TTL policies for various content types (fact-checks: 24h, search results: 6h, content: 12h). Includes automatic cleanup, LRU eviction, and performance statistics.

**Parallel Processing Engine**: `ParallelProcessor` enables concurrent claim verification with configurable batch sizes and progress reporting. Respects API rate limits while significantly improving response times for multi-claim analysis.

**Advanced Error Handling**: `ErrorHandler` with circuit breaker pattern, automatic fallbacks, and error classification. Provides graceful degradation when services are unavailable while maintaining system stability.

**Thread Context Analysis**: New `ThreadContextAnalyzer` service provides conversation-aware fact-checking by analyzing entire discussion threads. Identifies conversation topics, user positions, consistency issues, and debate dynamics to provide more accurate and contextually relevant fact-checking.

**Interactive Verification**: `InteractiveVerifier` system allows users to request detailed explanations, challenge fact-checks, perform deeper analysis, find alternative perspectives, and get additional sources. Includes user feedback processing and adaptive learning capabilities.