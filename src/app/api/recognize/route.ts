export const runtime = 'edge';

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

export async function POST(request: Request) {
  try {
    const { image } = await request.json() as { image: string };

    if (!image) {
      return Response.json({ success: false, error: '请提供图片数据' }, { status: 400 });
    }

    const apiKey = process.env.AI_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    const model = process.env.AI_MODEL || 'glm-4v-flash';

    if (!apiKey) {
      return Response.json({
        success: false,
        error: '未配置 API 密钥，请在环境变量中设置 AI_API_KEY'
      }, { status: 500 });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: image,
                },
              },
              {
                type: 'text',
                text: '请识别这张图片中的所有文字和数学公式，按照要求格式输出。',
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      return Response.json({
        success: false,
        error: `AI 服务请求失败 (${response.status})，请稍后重试`
      }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      return Response.json({
        success: false,
        error: '识别结果为空，请尝试上传更清晰的图片'
      }, { status: 500 });
    }

    // Post-process: clean up any markdown code fences the model might add
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:latex|markdown|md)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
    cleaned = cleaned.trim();

    return Response.json({
      success: true,
      result: cleaned,
    });
  } catch (error) {
    console.error('Recognition error:', error);
    return Response.json({
      success: false,
      error: '识别过程发生错误，请稍后重试'
    }, { status: 500 });
  }
}
