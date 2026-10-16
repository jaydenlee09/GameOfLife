// Gemini for the server-side morning brief. Same model as the app, but only the
// read tools are declared: the server never writes app data.
import { GoogleGenAI } from '@google/genai';
import { MODEL } from '../../src/utils/assistantUtils';
import { READ_ONLY_DECLARATIONS } from './push';

export const makeGenerate = (apiKey) => {
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  return ({ contents, systemPrompt, allowTools }) => ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 8192,
      tools: [{ functionDeclarations: READ_ONLY_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: allowTools ? 'AUTO' : 'NONE' } },
    },
  });
};
