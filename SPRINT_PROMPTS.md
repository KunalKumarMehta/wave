# Wave — Sprint Prompts (Batch 3: Sprint 26–30)

> Copy-paste the relevant sprint prompt into a new session to continue work.  
> Each prompt is self-contained — the agent should read HANDOFF.md first, then execute.  
> **Previous batches:** Batch 1 (Sprint 16–20), Batch 2 (Sprint 21–25) — archived below.

---

## How to Use

1. Start a new AI coding session in the `wave/` workspace
2. Paste the sprint prompt below
3. The agent will read context docs and execute the sprint

---

## Sprint 26 — Proper Extension Icons + UI Polish

```
## Task: Sprint 26 — Icon Assets + UI Polish Pass

Read HANDOFF.md first. Then verify builds: `pnpm verify`

### Problem
1. All 4 extension icon PNGs are identical 326KB files (not properly sized)
2. No favicon for extension sidepanel
3. CI bundle size check uses wrong glob pattern
4. Several minor CSS polish items

### Deliverables

#### 1. Generate Proper Icons
Use the image generation tool to create a Wave logo:
- Design: circular gradient (purple #6c63ff → blue #4f46e5) with white "◉" symbol
- Generate ONE high-res version (512x512)
- Use a script or tool to resize to 16x16, 32x32, 48x48, 128x128
- Replace all files in `apps/extension/icons/`
- Each file should be appropriate size (not 326KB for a 16px icon!)

#### 2. Favicon
- Convert the 32x32 icon to favicon.ico
- Add to `apps/extension/sidepanel.html`
- Also add to `apps/desktop/index.html`

#### 3. Fix CI Bundle Check
In `.github/workflows/ci.yml`:
- The bundle size check uses `lib-*.js` glob but the extension produces `index-*.js`
- Fix to check correct filename pattern
- Also: the 6MB lazy WebLLM chunk should be EXCLUDED from the size check
- Only check app-critical chunks (sidepanel, core, vendor-react)

#### 4. CSS Polish
- Add smooth scroll behavior to MessageList
- Add focus ring styles for accessibility on all interactive elements
- Add reduced-motion media query for all animations
- Ensure all components have proper dark mode support

#### 5. Tab Manager: Enforce Max 10
In `packages/core/src/domain/tab-manager.ts`:
- Add `maxTabs: number = 10` to constructor
- `openTab()` should reject if at limit
- Show error message in UI when limit reached

### Success Criteria
- Each icon file is properly sized (16px=~500B, 32px=~2KB, 48px=~4KB, 128px=~20KB)
- Favicon visible in sidepanel and desktop tabs
- CI bundle check passes correctly (excludes lazy chunks)
- `pnpm verify` — clean
- Commit: `polish(sprint-26): proper icons, favicon, CI fix, CSS accessibility`
```

---

## Sprint 27 — Adapter Hardening + Vision E2E Test

```
## Task: Sprint 27 — Provider Adapter Hardening + Vision E2E

Read HANDOFF.md first.

### Context
Sprint 23 added multimodal message support to all 3 adapters (openai, anthropic, gemini)
and screenshot fallback in the agent loop. But the multimodal message formatting has
NEVER been tested end-to-end. The adapter code needs verification.

### Deliverables

#### 1. Adapter Unit Tests
Create `packages/core/tests/adapters.test.ts`:
- Test each adapter's request body construction for:
  - Text-only messages → standard format
  - Messages with ContentPart[] (text + image) → multimodal format
  - Verify OpenAI format: `{ type: "image_url", image_url: { url: "data:..." } }`
  - Verify Anthropic format: `{ type: "image", source: { type: "base64", ... } }`
  - Verify Gemini format: `{ inlineData: { mimeType: "image/png", data: "..." } }`
- Mock fetch() — don't make real API calls
- At least 9 tests (3 per adapter)

#### 2. Context Builder Screenshot Test
Add tests to `packages/core/tests/context-builder.test.ts`:
- Test: `.screenshot(base64Image)` adds image to query message
- Test: token budget reserves 1000 tokens for screenshot
- Test: screenshot not included when not set

#### 3. Stream Error Handling
In all 3 adapters:
- Add timeout handling (30s default, configurable)
- Handle partial JSON in SSE events gracefully
- Emit `error` chunk type for network failures instead of throwing
- Add `signal` (AbortSignal) support if not already present

#### 4. Provider Connection Test
In `packages/ui-components/src/layout/SettingsView.tsx`:
- Implement the "Test Connection" button functionality
- Send a minimal prompt ("Hi") to the selected provider
- Show ✅ "Connection works!" or ❌ "Error: {message}" inline
- Use a 10s timeout

#### 5. Rate Limit Display
When a provider returns 429:
- Show "Rate limited — retry in {N}s" in the chat
- Auto-retry after the Retry-After header duration
- Don't burn the user's cost tracking for failed requests

### Success Criteria
- 9+ new adapter tests passing
- 3+ new context-builder tests passing
- Test Connection button works in Settings
- Rate limit shown gracefully (not as generic "Error")
- `pnpm verify` — clean
- Commit: `test(sprint-27): adapter hardening — multimodal tests, connection test, rate limits`
```

---

## Sprint 28 — Conversation Intelligence

```
## Task: Sprint 28 — Smart Conversation Features

Read HANDOFF.md first.

### Context
Multi-conversation works but lacks intelligence:
- No conversation search by content (only by title)
- No conversation branching/forking
- No message editing or regeneration
- No conversation summarization

### Deliverables

#### 1. Full-Text Search
In `packages/core/src/domain/conversation-storage.ts`:
- Add `searchMessages(query: string): Promise<Array<{ convId, msgId, content, timestamp }>>`
- Search across ALL conversations' messages
- Case-insensitive substring matching
- Return top 20 results sorted by relevance (newest first)

In `packages/ui-components/src/layout/ConversationDrawer.tsx`:
- Update search to use full-text search instead of title-only
- Show matching message preview under conversation title in results

#### 2. Message Regeneration
In `packages/ui-components/src/chat/MessageList.tsx`:
- Add a "🔄 Regenerate" button on assistant messages (visible on hover)
- When clicked: remove the last assistant message, re-send the last user message
- Wire callback through to App.tsx / sidepanel.tsx

#### 3. Message Editing
- Add "✏️ Edit" button on user messages (visible on hover)
- When clicked: replace message content with an editable textarea
- On submit: truncate conversation from that point, re-send edited message
- Wire callback through to handleSend

#### 4. Conversation Fork
In `packages/core/src/domain/conversation-storage.ts`:
- Add `fork(convId: string, fromMsgIndex: number): Promise<string>` — creates a new conversation from an existing one, copying messages up to the specified index
- UI: "Fork from here" option in message context menu

#### 5. Conversation Summary
Add auto-summary for long conversations:
- After 20 messages, generate a summary using the local SLM
- Store as `summary` field on the conversation
- Show in drawer tooltip on hover
- Use for search ranking boost

### Success Criteria
- Full-text search returns results across all conversations
- Regenerate button re-generates assistant response
- Edit button allows editing + re-sending from edit point
- Fork creates a new conversation branch
- `pnpm verify` — clean
- Commit: `feat(sprint-28): conversation intelligence — search, regenerate, edit, fork`
```

---

## Sprint 29 — Keyboard-First UX + Accessibility

```
## Task: Sprint 29 — Keyboard Navigation + A11y

Read HANDOFF.md first.

### Context
Wave relies heavily on mouse interaction. For power users and accessibility,
we need full keyboard navigation and screen reader support.

### Deliverables

#### 1. Global Keyboard Shortcuts
In sidepanel and desktop app:
- `Ctrl+N` / `Cmd+N`: New conversation
- `Ctrl+L` / `Cmd+L`: Focus input bar
- `Ctrl+K` / `Cmd+K`: Open conversation search (drawer)
- `Ctrl+,` / `Cmd+,`: Open settings
- `Escape`: Close drawer/settings/onboarding
- `Ctrl+Shift+C` / `Cmd+Shift+C`: Copy last assistant message

Add a keyboard shortcut help panel (triggered by `?` key):
- Show all available shortcuts in a modal/overlay
- Create `packages/ui-components/src/layout/ShortcutHelp.tsx`

#### 2. Focus Management
- InputBar auto-focuses on mount and after sending
- Tab key cycles through: input → message actions → header buttons
- Conversation drawer items navigable with arrow keys
- Settings fields navigable with Tab
- Focus trap in modals (onboarding, shortcut help)

#### 3. ARIA Labels
Add proper ARIA attributes to ALL interactive elements:
- `role`, `aria-label`, `aria-expanded`, `aria-selected`
- `aria-live="polite"` on the MessageList (for streaming updates)
- `aria-busy="true"` on InputBar when streaming
- `aria-describedby` for settings help text

#### 4. Screen Reader Announcements
- When streaming starts: "Wave is thinking..."
- When streaming ends: announce first 100 chars of response
- When action executes: "Executing: click Submit button"
- Use an sr-only live region component

#### 5. High Contrast Mode
- Add `@media (prefers-contrast: high)` CSS overrides
- Increase all border widths to 2px
- Increase minimum text contrast to 7:1
- Add visible focus outlines (3px solid)

#### 6. Reduced Motion
- Add `@media (prefers-reduced-motion: reduce)` CSS overrides
- Disable all transitions and animations
- Replace slide animations with instant show/hide

### Success Criteria
- All keyboard shortcuts work in both platforms
- Full tab navigation through all UI elements
- Screen reader reads streaming updates via live region
- WCAG 2.1 AA compliance (basic)
- `pnpm verify` — clean
- Commit: `a11y(sprint-29): keyboard navigation, ARIA labels, high contrast, reduced motion`
```

---

## Sprint 30 — Production Release Prep

```
## Task: Sprint 30 — v1.0.0 Release Preparation

Read HANDOFF.md first.

### Context
The project is feature-complete for v1.0. This sprint focuses on
polish, documentation, and release preparation.

### Deliverables

#### 1. Chrome Web Store Listing
Create `apps/extension/store/` directory:
- `description.txt` — Store listing description (max 132 chars for short, 2000 for detailed)
- Generate promotional images using image generation:
  - `screenshot-1.png` — Chat interface with streaming response
  - `screenshot-2.png` — Page awareness with AX tree visualization
  - `screenshot-3.png` — Settings with provider selection
  - `screenshot-4.png` — Conversation drawer with search
  - `screenshot-5.png` — Agent action confirmation
- `privacy-policy.md` — Privacy policy (no data collection, local storage only)

#### 2. Desktop App Polish
- Add app icon for macOS (.icns) and Windows (.ico) in `apps/desktop/src-tauri/icons/`
- Update `tauri.conf.json` with proper app metadata (description, author, license)
- Add About dialog accessible from system tray
- Add auto-update configuration (tauri-plugin-updater)

#### 3. README Overhaul
Rewrite `README.md` to be a public-facing project README:
- Project logo and tagline
- Feature list with screenshots
- Quick start guide (install extension OR download desktop app)
- Development setup for contributors
- Architecture overview (link to SAD)
- License (MIT)

#### 4. License
- Create `LICENSE` file (MIT license)
- Add license headers to key source files

#### 5. Version Bump
- Run `./scripts/bump-version.sh 1.0.0`
- Update CHANGELOG with v1.0.0 entry
- Update PRD status to "v1.0 Released"

#### 6. Final Verification
- Full test suite: `pnpm verify`
- Extension: load in Chrome, test all features manually
- Desktop: `pnpm tauri dev`, test split-pane + agent
- Verify CI workflow triggers on tag push

### Success Criteria
- Chrome Web Store assets ready in `apps/extension/store/`
- Desktop app has proper icons and metadata
- README is public-ready with installation instructions
- LICENSE file exists
- Version bumped to 1.0.0 across all packages
- `pnpm verify` — clean
- Commit: `chore(v1.0.0): release preparation — store assets, README, license`
- Tag: `v1.0.0`
```

---

## Meta: Session Start Prompt

```
## Continue Wave Development

Read these files in order before doing anything:
1. HANDOFF.md — current state, architecture, bugs, sprint history
2. .context.md — conventions, critical reminders

Then verify:
  git log --oneline -5
  cd packages/core && npx vitest run
  pnpm --filter @wave/extension build

After confirming everything is green, proceed with: [PASTE SPECIFIC SPRINT TASK]
```

---

## Archived: Batch 1 (Sprint 16–20) — Completed ✅
## Archived: Batch 2 (Sprint 21–25) — Completed ✅
