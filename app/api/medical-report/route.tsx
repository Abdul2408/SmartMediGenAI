import Groq from "groq-sdk";
import { db } from "@/config/db";
import { sessionChatTable } from "@/config/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const REPORT_GEN_PROMPT = `
You are an AI Medical Voice Agent that just finished a voice conversation with a user. Based on doctor AI agent info and the conversation between AI Medical Agent and user, generate a structured report with the following fields:

1. sessionId: a unique session identifier
2. agent: the medical specialist name (e.g., "General Physician AI")
3. user: name of the patient or "Anonymous" if not provided
4. timestamp: current date and time in ISO format
5. chiefComplaint: one-sentence summary of the main health concern
6. summary: a 2-3 sentence summary of the conversation, symptoms, and recommendations
7. symptoms: list of symptoms mentioned by the user
8. duration: how long the user has experienced the symptoms
9. severity: mild, moderate, or severe
10. medicationsMentioned: list of any medicines mentioned
11. recommendations: list of AI suggestions (e.g., rest, see a doctor)

Return the result in this JSON format:
{
 "sessionId": "string",
 "agent": "string",
 "user": "string",
 "timestamp": "ISO Date string",
 "chiefComplaint": "string",
 "summary": "string",
 "symptoms": ["symptom1", "symptom2"],
 "duration": "string",
 "severity": "string",
 "medicationsMentioned": ["med1", "med2"],
 "recommendations": ["rec1", "rec2"]
}
Only include valid fields. Respond with nothing else.
`;

export async function POST(req: NextRequest) {
  const { sessionId, messages, sessionDetail } = await req.json();

  try {
    console.log('📊 [MEDICAL REPORT] Received request');
    console.log('📊 SessionID:', sessionId);
    console.log('📊 Messages:', JSON.stringify(messages, null, 2));

    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured');
    }

    // Format conversation for the prompt
    const conversationText = messages
      .map((msg: any) => `${msg.role.toUpperCase()}: ${msg.text}`)
      .join('\n');

    const UserInput = `
AI DOCTOR AGENT INFO:
Specialist: ${sessionDetail?.selectedDoctor?.specialist || 'General Physician'}

CONVERSATION:
${conversationText}
`;

    console.log('📊 [MEDICAL REPORT] Sending to Groq...');

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: REPORT_GEN_PROMPT },
        { role: "user", content: UserInput },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 1000,
    });

    console.log('📊 [MEDICAL REPORT] Groq response received');

    const rawResp = completion.choices[0].message?.content || '';
    console.log('📊 [MEDICAL REPORT] Raw response:', rawResp);

    const Resp = rawResp.trim().replace(/```json/g, "").replace(/```/g, "").trim();
    
    console.log('📊 [MEDICAL REPORT] Cleaned response:', Resp);
    
    const JSONResp = JSON.parse(Resp);

    console.log('📊 [MEDICAL REPORT] Parsed JSON:', JSONResp);

    // Add missing fields with defaults if needed
    const completeReport = {
      sessionId: sessionId || 'unknown',
      agent: JSONResp.agent || sessionDetail?.selectedDoctor?.specialist || 'Medical AI Agent',
      user: JSONResp.user || 'Patient',
      timestamp: JSONResp.timestamp || new Date().toISOString(),
      chiefComplaint: JSONResp.chiefComplaint || 'Not recorded',
      summary: JSONResp.summary || 'Consultation completed',
      symptoms: JSONResp.symptoms || [],
      duration: JSONResp.duration || 'Not specified',
      severity: JSONResp.severity || 'Not assessed',
      medicationsMentioned: JSONResp.medicationsMentioned || [],
      recommendations: JSONResp.recommendations || [],
      conversationLength: messages.length,
    };

    console.log('📊 [MEDICAL REPORT] Complete report:', completeReport);

    // Save report to database
    const result = await db.update(sessionChatTable)
      .set({
        report: completeReport,
        conversation: messages,
      })
      .where(eq(sessionChatTable.sessionId, sessionId));

    console.log('📊 [MEDICAL REPORT] Saved to database:', result);

    return NextResponse.json(completeReport);

  } catch (e: any) {
    console.error('❌ [MEDICAL REPORT] Error:', e);
    console.error('❌ Error details:', e.message || e);
    
    return NextResponse.json({
      error: 'Failed to generate report',
      details: e.message,
      message: e.message
    }, { status: 500 });
  }
}