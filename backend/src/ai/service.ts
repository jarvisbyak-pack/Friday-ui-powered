import type { GenerateRequest, GenerateResponse, AiProvider } from "./types.js";
import { createAiProvider } from "./provider.js";

export class AiService {
  private provider?: AiProvider;

  constructor(provider?: AiProvider) {
    this.provider = provider;
  }

  private getProvider(): AiProvider {
    if (!this.provider) {
      this.provider = createAiProvider();
    }
    return this.provider;
  }

  generate(request: GenerateRequest): Promise<GenerateResponse> {
    return this.getProvider().generate(request);
  }
}
