// Cloudflare Pages Function - /api/recognize
// This replaces the Next.js API route for static export + CF Pages deployment

const SYSTEM_PROMPT = `你是一个专业的图文识别助手。你的任务是识别图片中的所有文字和数学公式，并按照指定格式返回结果。

规则：
1. 必须从图片顶部到底部逐行完整识别，绝对不能遗漏图片底部的内容
2. 保持原始的阅读顺序（从上到下，从左到右）
3. 文字部分直接输出为纯文本
4. 数学公式使用 LaTeX 格式输出
5. 行内公式用 $...$ 包裹，独立行公式用 $$...$$ 包裹
6. 如果文字和公式混合在同一段落中，保持它们的相对位置关系
7. 仔细检查图片最底部的区域，确保不遗漏任何文字或公式
8. 如果识别到标题、列表等结构，用 Markdown 格式保留结构
9. 只输出识别结果，不要添加任何解释说明
10. 输出必须完整，不能中途截断`;

// Extract pure base64 from data URL, or return as-is if already pure base64
function extractBase64(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/')) {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex !== -1) {
      return dataUrl.substring(commaIndex + 1);
    }
  }
  return dataUrl;
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Models to try in order (fallback chain)
const MODEL_FALLBACKS = ['glm-4.6v-flash'];

async function callAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  imageData: string,
): Promise<Response> {
  const requestBody = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageData,
            },
          },
          {
            type: 'text',
            text: SYSTEM_PROMPT + '\n\n请从上到下完整识别这张图片中的所有文字和数学公式，特别注意不要遗漏图片底部的内容，按照要求格式输出。',
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 8192,
  };

  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { image } = await context.request.json();

    if (!image) {
      return new Response(
        JSON.stringify({ success: false, error: '请提供图片数据' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = context.env.AI_API_KEY;
    const baseUrl = context.env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    const configuredModel = context.env.AI_MODEL;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: '未配置 API 密钥，请在环境变量中设置 AI_API_KEY' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract pure base64
    const imageData = extractBase64(image);

    // Build model list: configured model first, then fallbacks
    const modelsToTry = configuredModel
      ? [configuredModel, ...MODEL_FALLBACKS.filter(m => m !== configuredModel)]
      : MODEL_FALLBACKS;

    const maxRetries = 3;
    let lastError = '';

    // Try each model with retries
    for (const model of modelsToTry) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`Trying model: ${model}, attempt: ${attempt}`);

        const response = await callAI(baseUrl, apiKey, model, imageData);

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';

          if (!content) {
            return new Response(
              JSON.stringify({ success: false, error: '识别结果为空，请尝试上传更清晰的图片' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
          }

          // Post-process: clean up any markdown code fences
          let cleaned = content.trim();
          cleaned = cleaned.replace(/^```(?:latex|markdown|md)?\s*\n?/i, '');
          cleaned = cleaned.replace(/\n?```\s*$/i, '');
          cleaned = cleaned.trim();

          return new Response(
            JSON.stringify({ success: true, result: cleaned }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Handle error responses
        const errorText = await response.text();
        console.error(`AI API error (model=${model}, attempt=${attempt}):`, response.status, errorText);

        let errorDetail = '';
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error?.message || errorJson.message || '';
        } catch {
          errorDetail = errorText.substring(0, 200);
        }

        lastError = errorDetail;

        // If 429 (rate limited), wait and retry
        if (response.status === 429) {
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
          await sleep(waitTime);
          continue;
        }

        // If 400 (bad request), try next model
        if (response.status === 400) {
          console.log(`Model ${model} returned 400, trying next model...`);
          break; // break out of retry loop, go to next model
        }

        // Other errors, retry
        if (attempt < maxRetries) {
          await sleep(1000);
          continue;
        }
      }
    }

    // All models and retries failed
    return new Response(
      JSON.stringify({
        success: false,
        error: `AI 服务暂时不可用${lastError ? '：' + lastError : ''}，请稍后再试`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Recognition error:', error);
    const message = error instanceof Error ? error.message : '识别过程发生错误';
    return new Response(
      JSON.stringify({ success: false, error: `识别过程发生错误：${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
