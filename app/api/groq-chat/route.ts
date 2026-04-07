import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY is not set in environment variables');
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    console.log('📤 Sending to Groq with model: mixtral-8x7b-32768');

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      model: "mixtral-8x7b-32768",
      temperature: 0.7,
      max_tokens: 200,
    });

    console.log('✅ Groq response received');

    return NextResponse.json({
      content: chatCompletion.choices[0].message.content,
    });
  } catch (error: any) {
    // Log technical error for debugging (server-side only)
    console.error('❌ Groq API Error:', {
      message: error.message,
      status: error.status,
      type: error.constructor.name
    });

    // Return generic, user-friendly error (without technical details)
    let userMessage = 'Unable to get AI response. Please try again.';
    
    if (error.message?.includes('model') || error.message?.includes('decommissioned')) {
      userMessage = 'AI model update required. Please refresh and try again.';
    } else if (error.message?.includes('API') || error.message?.includes('key')) {
      userMessage = 'AI service configuration issue. Please try again later.';
    } else if (error.status === 429) {
      userMessage = 'Too many requests. Please wait and try again.';
    }
    
    return NextResponse.json(
      { error: userMessage },
      { status: 500 }
    );
  }
}
