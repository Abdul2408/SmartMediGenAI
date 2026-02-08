import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY is not set in environment variables');
      return NextResponse.json(
        { error: 'Server configuration error: GROQ_API_KEY not set' },
        { status: 500 }
      );
    }

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    console.log('📤 Sending to Groq:', {
      modelMessages: messages.length,
      systemPromptLength: systemPrompt?.length,
      model: 'llama-3.3-70b-versatile'
    });

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      model: "llama-3.3-70b-versatile",
    });

    console.log('✅ Groq response received');

    return NextResponse.json({
      content: chatCompletion.choices[0].message.content,
    });
  } catch (error: any) {
    console.error('❌ Groq API Error:', {
      message: error.message,
      status: error.status,
      type: error.constructor.name
    });

    return NextResponse.json(
      { 
        error: 'Failed to get AI response',
        details: error.message
      },
      { status: 500 }
    );
  }
}
