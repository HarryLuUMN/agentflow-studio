// lib/openai.ts - OpenAI API 调用模块

export interface LLMCallOptions {
  prompt: string;
  system?: string;
  agentName?: string;
  temperature?: number;
  onLog?: ((message: string) => void) | undefined;
}

export interface LLMResponse {
  content: string;
  success: boolean;
  error?: string;
}

/**
 * 调用 OpenAI API
 */
export async function callLLM(
  apiKey: string,
  options: LLMCallOptions
): Promise<LLMResponse> {
  const { prompt, system, agentName = 'Agent', temperature = 0.7, onLog } = options;

  onLog?.(`[${agentName}] Calling OpenAI...`);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
        temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    onLog?.(`[${agentName}] ✅ Response received (${content.length} chars)`);
    // 🆕 输出前200字符用于 debugging
    if (content.length > 0) {
      onLog?.(`[${agentName}] Response: ${content.substring(0, 200)}...`);
    }

    return {
      content,
      success: true,
    };
  } catch (error: any) {
    onLog?.(`[${agentName}] ❌ Error: ${error.message}`);
    return {
      content: '',
      success: false,
      error: error.message,
    };
  }
}
