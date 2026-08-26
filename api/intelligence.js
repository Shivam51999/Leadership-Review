// /api/intelligence.js — Vercel serverless function
// Requires env var ANTHROPIC_API_KEY in Vercel project settings.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  try {
    const { name, dept, channels, comments } = req.body || {};
    if (!name || !channels) return res.status(400).json({ ok: false, error: 'Missing data' });

    const prompt = `You are an HR leadership analyst for Mangalam Landmarks, a Pune real estate group. Analyze this leader's 360° review data and produce an intelligence summary.

LEADER: ${name} (${dept || 'N/A'})

SCORE DATA (1-10 scale, per question, with number of raters n):
${JSON.stringify(channels, null, 1)}

WRITTEN COMMENTS FROM REVIEWERS (channel: text):
${(comments && comments.length) ? comments.map(c => `[${c.form}] ${c.text}`).join('\n') : '(no comments submitted)'}

ANALYSIS RULES:
- Scores cluster high (9-10) in this culture, so treat RELATIVE differences as the real signal: a 8.4 among 9.5s is a genuine weakness flag; anything at or below 8 deserves attention.
- Compare channels: a gap between how peers/manager rate vs how the team rates (upward) is a key perception-gap insight. Low n means weak evidence — say so.
- Ground every point in the data (cite the question theme or a comment paraphrase). Do not invent facts.
- Comments in Marathi/Hindi should be understood and reflected in English.
- Be direct and specific, not generic HR language. 
- If evidence is thin (few responses, no comments), keep sections shorter and say confidence is low rather than padding.

Respond ONLY with valid JSON, no markdown fences, in exactly this shape:
{
 "summary": "2-3 sentence executive read of this leader",
 "strengths": ["specific strength with evidence", ...max 4],
 "weaknesses": ["specific weakness/risk with evidence", ...max 4],
 "improvements": ["concrete, actionable development suggestion", ...max 4],
 "perception_gap": "1-2 sentences on differences between channels (or 'None significant')",
 "confidence": "high | medium | low — based on response count and comment quality"
}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(502).json({ ok: false, error: data.error?.message || 'Anthropic API error' });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { return res.status(502).json({ ok: false, error: 'Could not parse AI response', raw: clean.slice(0, 500) }); }

    return res.status(200).json({ ok: true, intel: parsed });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
