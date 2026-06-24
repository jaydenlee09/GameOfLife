// Cheat-meal costs are fixed, not AI-picked, so the budget stays predictable.
const UNHEALTHY_TIER_COSTS = { minor: -15, moderate: -30, major: -50 };

const SYSTEM_PROMPT = `You are a nutrition classifier. Given a short description of a food or meal, classify it.

Respond ONLY with JSON in this exact shape:
{ "verdict": "healthy" | "unhealthy" | "neutral", "points": number, "severity": "minor" | "moderate" | "major" | null, "reasoning": "string" }

Rules:
- "verdict": "healthy" for nutritious, whole, or balanced food; "unhealthy" for processed, fried, sugary, or excessive junk food; "neutral" for anything ambiguous or hard to classify.
- "points": only used when verdict is "healthy" — a positive integer between 1 and 15 (more points for clearly nutritious choices). Use 0 if verdict is "neutral" or "unhealthy" (ignored for unhealthy, it's costed separately).
- "severity": only used when verdict is "unhealthy" — "minor" for a small indulgence (e.g. a cookie, a soda), "moderate" for an unhealthy meal (e.g. a fast food combo), "major" for a full cheat meal (e.g. an all-you-can-eat spread, multiple fast food items). Use null if verdict is not "unhealthy".
- "reasoning": one short sentence (under 20 words) explaining the verdict.`;

const FALLBACK_RESULT = { verdict: 'neutral', points: 0, reasoning: 'Could not analyze this food.' };

const parseFoodResponse = (rawText) => {
  if (!rawText) return FALLBACK_RESULT;
  try {
    const parsed = JSON.parse(rawText);
    const verdict = ['healthy', 'unhealthy', 'neutral'].includes(parsed.verdict) ? parsed.verdict : 'neutral';
    const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning.trim() ? parsed.reasoning.trim() : FALLBACK_RESULT.reasoning;

    if (verdict === 'unhealthy') {
      const severity = ['minor', 'moderate', 'major'].includes(parsed.severity) ? parsed.severity : 'moderate';
      return { verdict, points: UNHEALTHY_TIER_COSTS[severity], reasoning };
    }
    if (verdict === 'healthy') {
      const rawPoints = typeof parsed.points === 'number' && Number.isFinite(parsed.points) ? Math.round(parsed.points) : 10;
      return { verdict, points: Math.min(15, Math.max(1, rawPoints)), reasoning };
    }
    return { verdict: 'neutral', points: 0, reasoning };
  } catch {
    return FALLBACK_RESULT;
  }
};

/**
 * Classifies a food entry as healthy/unhealthy/neutral via Gemini 2.5 Flash.
 * Returns: { verdict: 'healthy'|'unhealthy'|'neutral', points: number, reasoning: string }
 */
export const classifyFood = async (foodText) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Missing Gemini API key. Add VITE_GEMINI_API_KEY to your .env file.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: foodText }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.4,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
    },
  });

  return parseFoodResponse(response.text || '');
};
