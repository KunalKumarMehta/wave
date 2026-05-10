/**
 * Local AI inference abstraction.
 * 
 * Chrome Extension: WebLLM in Offscreen Document (WebGPU)
 * Tauri Native: candle-rs / ONNX Runtime / tauri-plugin-llm
 * 
 * @see Knowledge Base: Wave 5.4, Wave 1.2 — GPU Memory
 */

export interface GenerationConfig {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface InferenceProvider {
  /** Check local hardware capability. */
  route(): Promise<'local_gpu' | 'local_cpu' | 'remote_fallback'>;

  /** Blocking generation. */
  generate(config: GenerationConfig): Promise<string>;

  /** Streaming generation with per-token callback. */
  stream(config: GenerationConfig, onToken: (token: string) => void): Promise<void>;

  /** Check if a model is loaded and warm. */
  isReady(): Promise<boolean>;

  /** Load/initialize a specific model. */
  loadModel(modelId: string): Promise<void>;
}
