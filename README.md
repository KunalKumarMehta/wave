# Wave — AI-Native Browser

An AI browser assistant that can see and interact with web pages. Built as a Chrome Extension (MV3) with a platform-agnostic monorepo architecture.

## Architecture

```
wave/
├── packages/
│   ├── core/            # Platform-agnostic domain logic
│   │   ├── abstractions/  # IPC, Storage, CDP, UI interfaces
│   │   ├── domain/        # Streaming adapters, AX serializer, agent loop, tool parser
│   │   ├── state/         # Zustand stores (settings, conversation)
│   │   └── types/         # Message, StreamChunk types
│   ├── ext-bindings/    # Chrome Extension implementations
│   │   ├── cdp.ts         # chrome.debugger wrapper
│   │   ├── crypto.ts      # AES-256-GCM key encryption
│   │   ├── ipc.ts         # chrome.runtime messaging
│   │   └── storage.ts     # chrome.storage.local/session
│   ├── ui-components/   # React components (shared)
│   │   ├── chat/          # InputBar, MessageList, MarkdownRenderer
│   │   ├── generative/    # DataTable, GenericCard, ComponentRegistry
│   │   └── layout/        # SidePanel, SettingsView, CostBadge, ConversationDrawer
│   └── native-bindings/ # Tauri Desktop implementations
│       ├── cdp.ts         # WebSocket CDP wrapper for localhost:9222
│       ├── ipc.ts         # Tauri IPC wrapper
│       └── storage.ts     # tauri-plugin-store wrapper
└── apps/
    ├── extension/       # Chrome Extension entry (Vite + CRXJS)
    └── desktop/         # Tauri Desktop App (Vite + React + Rust)
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 9+
- Chrome 116+ (for Side Panel API)

### Setup

```bash
# Clone and install
git clone <repo-url> wave
cd wave
pnpm install

# Build the extension
pnpm --filter @wave/extension build

# Build the desktop app
pnpm --filter @wave/desktop build

# Run tests
pnpm test
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `apps/extension/dist/`
5. Click the Wave icon → Side Panel opens

### Configure

1. Click the ⚙ gear icon in the Side Panel header
2. Select a provider (OpenAI, Anthropic, or Google Gemini)
3. Enter your API key and click **Save**
4. Close settings and start chatting

## Features

### Chat
- Multi-provider streaming (OpenAI, Anthropic, Gemini)
- **Multi-conversation support** — create, switch, search, delete conversations
- Conversation drawer with time-ago timestamps and auto-titling
- Markdown rendering: code blocks, tables, blockquotes, ordered/unordered lists, horizontal rules
- Auto-resizing input with Shift+Enter for newlines

### Browser Agent
- Ask "What's on this page?" to extract the accessibility tree
- Multi-step actions: "Click login, then enter my email" → observe → act → repeat
- Uses Chrome DevTools Protocol (CDP) via `chrome.debugger` (extension) or `localhost:9222` WebSocket (desktop)
- AX tree → Markdown+refs serialization (~93% token reduction)
- Priority-based context builder with 8192-token budget

### Settings
- Provider grid with active indicator
- Model selection dropdown
- Encrypted API key storage (AES-256-GCM)
- Session-based key caching

### Reliability
- Per-model pricing matrix (OpenAI/Anthropic/Gemini)
- Running total in header badge (tokens + USD)
- Provider failover with automatic retry on rate limits (429/5xx)

## Development

# Dev mode with hot reload (Extension)
pnpm --filter @wave/extension dev

# Dev mode (Desktop - runs Tauri and Vite)
cd apps/desktop && pnpm tauri dev

# Type check all packages
pnpm -r exec tsc --noEmit

# Run tests
pnpm test
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Chrome Extension MV3 / Tauri v2 Desktop |
| Build | Vite + CRXJS (Ext) / Vite + tauri-build (Desktop) |
| UI | React 19 + vanilla CSS |
| State | Zustand |
| Streaming | Fetch + ReadableStream (SSE parsing) |
| Security | Web Crypto API / Tauri Plugin Store |
| Page Access | Chrome DevTools Protocol (CDP 1.3) |
| Monorepo | pnpm workspaces |

## License

MIT
