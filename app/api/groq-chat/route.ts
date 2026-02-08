import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: NextRequest) {
  const { messages, systemPrompt } = await req.json();

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    model: "llama-3.3-70b-versatile",
  });

  return NextResponse.json({
    content: chatCompletion.choices[0].message.content,
  });
}
