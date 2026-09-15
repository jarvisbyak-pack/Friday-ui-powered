import { GoogleGenAI } from '@google/genai';
import { config } from './config';
import { ModelProvider, ModelRequest, ModelResponse } from './contracts';

class GeminiProvider implements ModelProvider {
  id = 'gemini'; private client?: GoogleGenAI;
  isConfigured() { return Boolean(config.geminiApiKey); }
  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.isConfigured()) throw new Error('Gemini is not configured. Set GEMINI_API_KEY on the server.');
    this.client ??= new GoogleGenAI({ apiKey: config.geminiApiKey! });
    const response = await this.client.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', contents: request.input, config: { systemInstruction: request.system } });
    if (!response.text) throw new Error('Gemini returned no text.');
    return { provider: this.id, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', text: response.text };
  }
}

class UnavailableProvider implements ModelProvider {
  constructor(public id: string, private env: string) {}
  isConfigured() { return Boolean(process.env[this.env]); }
  async generate(_request: ModelRequest): Promise<ModelResponse> { throw new Error(`${this.id} is declared but has no installed adapter. Add a server-side adapter; never expose ${this.env} to the browser.`); }
}

export class ProviderRegistry {
  private providers: ModelProvider[] = [new GeminiProvider(), new UnavailableProvider('openai', 'OPENAI_API_KEY'), new UnavailableProvider('anthropic', 'ANTHROPIC_API_KEY'), new UnavailableProvider('ollama', 'OLLAMA_BASE_URL')];
  status() { return this.providers.map((provider) => ({ id: provider.id, configured: provider.isConfigured() })); }
  get(id = config.defaultProvider) { const provider = this.providers.find((item) => item.id === id); if (!provider) throw new Error(`Unknown model provider: ${id}`); return provider; }
}
