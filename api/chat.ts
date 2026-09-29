type ChatRequest = {
  message?: string;
  query?: string;
  sessionId?: string;
  inputMode?: 'text' | 'voice';
  systemPrompt?: string;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Friday AI backend is not configured yet.',
      code: 'GEMINI_API_KEY_MISSING',
    });
  }

  const body = (req.body || {}) as ChatRequest;
  const message = String(body.message || body.query || '').trim();
  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const model = process.env.GEMINI_MODEL;
  if (!model) {
    return res.status(503).json({
      error: 'Friday AI backend needs GEMINI_MODEL configured.',
      code: 'GEMINI_MODEL_MISSING',
    });
  }

  const systemInstruction =
    body.systemPrompt ||
    'You are FRIDAY, a warm, sharp, composed AI assistant. Be concise, accurate, and never claim an action succeeded without evidence.';

  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
    }),
  });

  const raw = await upstream.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }

  if (!upstream.ok) {
    return res.status(502).json({
      error: 'Friday AI provider request failed.',
      providerStatus: upstream.status,
      details: data?.error?.message || data,
    });
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text || '')
      .join('') || '';

  return res.status(200).json({
    reply: { text },
    provider: 'gemini',
    model,
    sessionId: body.sessionId || null,
    inputMode: body.inputMode || 'text',
  });
}
