# Wave — Technical Learnings & Decisions Log

> Captured during the initial build session (2026-05-10/11).  
> These are hard-won insights — do NOT discard without reading.

---

## 1. Chrome Extension MV3 Constraints

### Service Worker Lifecycle
- MV3 service workers are **ephemeral** — Chrome can terminate them at any time.
- All state MUST live in `chrome.storage` or be reconstructable.
- Long-running streams survive because `chrome.runtime.connect` port keeps the SW alive while a client is connected.

### Session Storage Access
- `chrome.storage.session` is **background-only by default** in MV3.
- Side Panel/popup CANNOT read session storage unless the service worker calls:
  ```ts
  chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
  });
  ```
- This MUST be called at service worker top level, not inside a listener.

### Side Panel Tab Targeting
- **`chrome.tabs.query({ active: true, currentWindow: true })`** from a Side Panel does NOT reliably return the visible web page tab.
- The Side Panel is its own context. `currentWindow: true` may return the Side Panel's window.
- **Fix:** Use `{ active: true, lastFocusedWindow: true }` AND filter for `tab.url?.startsWith('http')`.
- Requires `"tabs"` permission in manifest to access `tab.url`.

### CRXJS Plugin
- `@crxjs/vite-plugin` v2 beta handles manifest rewriting and HMR.
- It injects a `service-worker-loader.js` wrapper — don't be alarmed by it in dist.
- Service worker file path in `manifest.json` should use the **source path** (`src/background.ts`), not dist — CRXJS handles the transform.

---

## 2. Streaming Provider Nuances

### OpenAI
- Standard SSE: `data: {"choices":[{"delta":{"content":"..."}}]}` 
- Stream ends with `data: [DONE]`
- Uses `Authorization: Bearer <key>` header

### Anthropic
- Non-standard SSE events: `event: content_block_delta` / `event: message_stop`
- **Critical header**: `x-anthropic-dangerous-direct-browser-access: true` — required when calling from browser (not server). Without it, CORS preflight fails.
- Uses `x-api-key` header (not Bearer)
- Model format: `claude-sonnet-4-20250514`

### Gemini (Google)
- Uses **Generative Language REST API**, NOT the Vertex AI endpoint
- URL format: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={key}`
- SSE response: `data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}`
- **Key learning**: Provider name in PROVIDER_CATALOG must be lowercase `'gemini'` — case-sensitive lookup caused "Unknown provider: Gemini" bug.
- Gemini 2.5 Flash is free tier and good for testing, but hallucinates on complex pages.

### Common Streaming Pattern
```ts
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Split on \n\n for SSE, parse each event
}
```

---

## 3. AX Tree Extraction

### What Works
- `chrome.debugger.attach` → `Accessibility.enable` → `Accessibility.getFullAXTree` is the correct sequence.
- Must `detach` immediately after extraction to dismiss the "debugging this browser" banner.
- The serializer achieves ~93% token reduction by filtering to interactive elements only.

### What Doesn't Work (Yet)
- **Tab targeting**: The AX tree extraction can read the wrong tab if `chrome.tabs.query` returns an unexpected result from Side Panel context.
- **Complex page accuracy**: Amazon, Google, and other JS-heavy sites have massive AX trees (1000+ nodes). Even with filtering, the serialized output may miss visually obvious elements if they don't have good ARIA roles.
- **Images**: AX tree captures `alt` text but not visual content. The agent has no idea what images look like.

### Key Insight: URL Is Essential
- Without explicitly injecting `Page URL` and `Page Title` into the context, the LLM will **guess** the site identity from AX tree structure — and guess wrong (e.g., mistaking w3schools for Amazon because both have search bars and nav links).
- Always include URL + title as the first lines of the page context block.

---

## 4. Context Builder Design

### Token Budget Priority
```
Priority 0: System prompt (ALWAYS included)
Priority 1: User query (ALWAYS included)
Priority 2: Page context (included if fits)
Priority 10+: History (newest first, oldest dropped)
```

### Token Estimation Ratios
- DOM/structured content: **3.2 chars per token** (more special chars)
- Natural prose: **4.0 chars per token**
- These are heuristics — actual tokenization varies by model

### Critical Design Decision
System prompt and query are included **even if over budget**. The LLM must always know its role and what the user asked, even if it means exceeding the nominal limit.

---

## 5. CSS Architecture

### Design Token System
All colors, spacing, and transitions are defined as CSS custom properties in `:root`:
```css
--wave-bg-primary: #0a0a0f;
--wave-accent: #6c63ff;
--wave-transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
```

### BEM Naming
Components use `.component__element--modifier` pattern:
```css
.side-panel__header-right
.message-list__bubble--user
.cost-badge--warning
```

### No Framework
Vanilla CSS was chosen over Tailwind/styled-components to:
1. Minimize bundle size (CSS is 12.7KB total)
2. Avoid build complexity
3. Maintain full control in the 360px-wide Side Panel

---

## 6. Security Decisions

### API Key Storage
- Keys are stored in `chrome.storage.session` (wiped on browser close)
- AES-256-GCM encryption module exists (`crypto.ts`) for at-rest encryption in `chrome.storage.local`
- Currently using session-only storage (no at-rest persistence of keys)

### CDP Security
- `chrome.debugger.attach` shows a visible banner — this is intentional by Chrome and cannot be suppressed
- The extension detaches immediately after each extraction to minimize banner visibility
- No `chrome.debugger` access to extension pages (blocked by Chrome)

---

## 7. Build System

### pnpm Workspace Structure
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### Key Commands
```bash
pnpm --filter @wave/extension build  # Build extension
pnpm --filter @wave/extension dev    # Dev mode with HMR
pnpm test                            # Run all package tests
cd packages/core && npx vitest run   # Core tests only
```

### Build Output
```
dist/service-worker-loader.js    0.05 kB  # CRXJS wrapper
dist/manifest.json               0.48 kB  # Rewritten manifest
dist/sidepanel.html              0.67 kB  # Entry page
dist/assets/sidepanel-*.css     12.74 kB  # All styles
dist/assets/background.ts-*.js  14.87 kB  # Service worker
dist/assets/sidepanel.html-*.js 212.59 kB # React app (65KB gzip)
```

---

## 8. Anti-Patterns Discovered

### ❌ Using `sendMessage` for Streaming
`chrome.runtime.sendMessage` requires a single response. For streaming, use `chrome.runtime.connect` to get a persistent port.

### ❌ Storing State in Service Worker Variables
Service worker can be killed. State in module-level variables will be lost. Use `chrome.storage` for anything that must survive.

### ❌ Trusting `chrome.tabs.query` from Side Panel
The Side Panel is its own browsing context. Tab queries may not return what you expect. Always filter results and validate.

### ❌ Omitting Page URL from Agent Context
The LLM will confidently identify a page based solely on AX tree structure — and be wrong. Always include the URL explicitly.

### ❌ Case-Sensitive Provider Keys
If your settings UI sends `"Gemini"` but your adapter map uses `"gemini"`, the lookup silently fails. Normalize to lowercase.
