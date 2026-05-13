import * as webllm from '@mlc-ai/web-llm';

export type Intent = 'chat' | 'page_query' | 'page_action';

export interface ClassificationResult {
  intent: Intent;
  confidence: number;
}

const ROUTER_PROMPT = `
You are an intent router for a browser assistant.
Classify the user message into one of these intents:
- page_query: queries about the current page content (e.g., "summarize this", "find price", "what is this site about")
- page_action: requests to do something on the page (e.g., "click login", "type email", "scroll down")
- chat: general questions, explanations, or greetings (e.g., "explain recursion", "hi", "how are you", "what is 2+2")

Respond ONLY with a JSON object: {"intent": "...", "confidence": 0.0-1.0}
`;

export class LocalRouter {
  private engine: webllm.MLCEngine | null = null;
  private isLoaded = false;
  private modelId = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

  async init(onProgress?: (p: number) => void) {
    if (this.isLoaded) return;
    
    this.engine = new webllm.MLCEngine();
    this.engine.setInitProgressCallback((report) => {
      if (onProgress) onProgress(report.progress);
    });

    await this.engine.reload(this.modelId);
    this.isLoaded = true;
  }

  async classify(message: string): Promise<ClassificationResult> {
    if (!this.engine || !this.isLoaded) {
      // Fallback to simple keyword matching
      const queryKeywords = ['this page', 'summarize', 'find', 'read', 'extract'];
      const actionKeywords = ['click', 'type', 'fill', 'scroll', 'navigate'];
      
      const lower = message.toLowerCase();
      if (actionKeywords.some(k => lower.includes(k))) return { intent: 'page_action', confidence: 0.7 };
      if (queryKeywords.some(k => lower.includes(k))) return { intent: 'page_query', confidence: 0.7 };
      return { intent: 'chat', confidence: 0.7 };
    }

    try {
      const response = await this.engine.chat.completions.create({
        messages: [
          { role: 'system', content: ROUTER_PROMPT },
          { role: 'user', content: message }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const content = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(content);
      return {
        intent: parsed.intent || 'chat',
        confidence: parsed.confidence || 1.0
      };
    } catch (e) {
      console.error('[Wave] Local classification failed:', e);
      return { intent: 'chat', confidence: 0.5 };
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    if (!this.engine || !this.isLoaded) return '';

    try {
      const response = await this.engine.chat.completions.create({
        messages: [
          { role: 'system', content: 'Generate a short (3-5 words) title for this conversation based on the first message. Output ONLY the title text.' },
          { role: 'user', content: firstMessage }
        ],
        temperature: 0.7,
      });

      return response.choices[0].message.content?.replace(/["']/g, '').trim() || '';
    } catch (e) {
      return '';
    }
  }

  getLoaded() { return this.isLoaded; }
}

export const localRouter = new LocalRouter();
