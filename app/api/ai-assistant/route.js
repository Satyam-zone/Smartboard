import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req) {
  try {
    const { imageBase64, userPrompt, taskType } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: '.env.local file mein GEMINI_API_KEY missing hai!' },
        { status: 500 }
      );
    }

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image data missing hai!' }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    let promptText = "Analyze this image from a student's digital whiteboard. ";

    if (taskType === 'explain_math') {
      promptText += "Identify any calculation errors, sign flips, or logical mistakes in the math steps. Highlighting where they got stuck, explain the error clearly and offer a helpful hint on how to solve it step-by-step. Keep the tone encouraging like a friendly tutor.";
    } else if (taskType === 'beautify') {
      promptText += "Analyze the handwriting/diagram and transcribe or clean it up cleanly in LaTeX or formatted text.";
    } else if (taskType === 'format_code') {
      promptText += "Identify any code in this crop and re-format it with proper VS Code-style indentation and syntax structure.";
    } else {
      promptText += userPrompt || "Explain what is on this canvas selection.";
    }

    // Using gemini-2.5-pro from your active models list
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Data,
              },
            },
          ],
        },
      ],
    });

    return NextResponse.json({ result: response.text });

  } catch (err) {
    console.error('Route Error:', err);
    return NextResponse.json({ error: `AI Processing Error: ${err.message}` }, { status: 500 });
  }
}