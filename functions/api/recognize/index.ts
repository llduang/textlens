// Cloudflare Pages Function - /api/recognize
// This replaces the Next.js API route for static export + CF Pages deployment

const SYSTEM_PROMPT = `你是一个专业的图文识别助手。你的任务是识别图片中的所有文字和数学公式，并按照指定格式返回结果。

规则：
1. 仔细识别图片中的每一个文字和数学公式
2. 保持原始的阅读顺序
3. 文字部分直接输出为纯文本
4. 数学公式使用 LaTeX 格式输出
5. 行内公式用 $...$ 包裹，独立行公式用 $$...$$ 包裹
6. 如果文字和公式混合在同一段落中，保持它们的相对位置关系
7. 尽可能完整地还原图片中的所有内容，不要遗漏
8. 如果识别到标题、列表等结构，用 Markdown 格式保留结构
9. 只输出识别结果，不要添加任何解释说明`;

// Extract pure base64 from data URL, or return as-is if already pure base64
function extractBase64(dataUrl: string): string {
  // If it starts with "data:image/", strip the prefix
  if (dataUrl.startsWith('data:image/')) {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex !== -1) {
      return dataUrl.substring(commaIndex + 1);
    }
  }
  return dataUrl;
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
    const model = context.env.AI_MODEL || 'glm-4.6v-flash';

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: '未配置 API 密钥，请在环境变量中设置 AI_API_KEY' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ZhipuAI accepts both URL and pure base64 string
    // For base64 data URLs, we need to extract the pure base64 part
    const imageData = extractBase64(image);

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
              text: SYSTEM_PROMPT + '\n\n请识别这张图片中的所有文字和数学公式，按照要求格式输出。',
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      let errorDetail = `AI 服务请求失败 (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorDetail += `：${errorJson.error.message}`;
        } else if (errorJson.message) {
          errorDetail += `：${errorJson.message}`;
        }
      } catch {
        if (errorText.length < 200) {
          errorDetail += `：${errorText}`;
        }
      }
      return new Response(
        JSON.stringify({ success: false, error: errorDetail }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
  } catch (error) {
    console.error('Recognition error:', error);
    const message = error instanceof Error ? error.message : '识别过程发生错误';
    return new Response(
      JSON.stringify({ success: false, error: `识别过程发生错误：${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
