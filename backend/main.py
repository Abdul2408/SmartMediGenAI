from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import io
import os
import json
import base64
from dotenv import load_dotenv
from google import genai
from google.genai import types

# ---------- Setup ----------
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ---------- Request Schema ----------
class SymptomInput(BaseModel):
    message: str

class PrescriptionInput(BaseModel):
    prescription_text: str

# ---------- Helper: text-only Gemini ----------
def gemini_text(prompt: str) -> str:
    response = client.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents=prompt,
    )
    return response.text

# ---------- Helper: image + text Gemini ----------
def gemini_vision(image_bytes: bytes, mime_type: str, prompt: str) -> str:
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    response = client.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents=[image_part, prompt],
    )
    return response.text

# ---------- Chat-Based Prediction ----------
@app.post("/chat-predict")
async def chat_predict(symptom_input: SymptomInput):
    prompt = f"""
    You are SmartMediGen — an AI-powered clinical assistant trained in medical triage and symptom assessment.
    Your goal is to interpret the user's symptom and respond like a qualified healthcare assistant,
    using medically sound reasoning and professional tone.

    Response guidelines:
    - Focus on identifying likely causes (no greetings or introductions)
    - Include possible conditions, seriousness, and basic management steps
    - Mention appropriate over-the-counter (OTC) medicines if applicable
    - Keep it clear, factual, and under 6 lines
    - Avoid emojis, unnecessary empathy, or disclaimers
    - Use a clinical yet reassuring tone

    Symptom described: {symptom_input.message}
    """
    return {"reply": gemini_text(prompt)}

# ---------- Summary ----------
@app.post("/chat-summary")
async def chat_summary(symptom_input: SymptomInput):
    prompt = f"""
    Summarize the patient's symptoms and predict the most likely disease.
    Include only:
    1. Symptoms (bullet points)
    2. Likely Disease
    3. Whether it's serious
    4. Suggested Medicines (just names)
    Keep it brief and end with **Disclaimer: Consult a doctor for confirmation.**

    Conversation:
    {symptom_input.message}
    """
    return {"summary": gemini_text(prompt)}

# ---------- OCR + Analysis (combined, image sent directly to Gemini Vision) ----------
@app.post("/ocr-text")
async def ocr_extract(file: UploadFile = File(...)):
    """
    Now uses Gemini Vision instead of Tesseract.
    Handles handwritten prescriptions perfectly.
    Returns extracted_text for backward compatibility with the frontend.
    """
    try:
        contents = await file.read()
        print(f"✅ File received: {file.filename}, size: {len(contents)}")

        prompt = """
        This is a handwritten medical prescription. Please extract ALL text you can read from it,
        including medicine names, dosages, frequencies, and any other medical information.
        Return the raw extracted text only, preserving the structure as much as possible.
        """

        extracted_text = gemini_vision(contents, file.content_type or "image/jpeg", prompt)
        print(f"✅ Gemini Vision extracted: {extracted_text[:200]}")
        return {"extracted_text": extracted_text}

    except Exception as e:
        print(f"❌ OCR Error: {str(e)}")
        return {"error": f"OCR failed: {str(e)}"}


# ---------- Prescription Analysis ----------
@app.post("/analyze-prescription")
async def analyze_prescription(prescription_input: PrescriptionInput):
    prompt = f"""
    You are a medical assistant analyzing a prescription. Extract and explain all medicines mentioned.

    IMPORTANT: Return ONLY valid JSON, no markdown, no backticks, no extra text.

    For each medicine found, provide:
    - name: Full medicine name (expand abbreviations e.g. T. = Tablet)
    - dosage: Dosage and strength
    - frequency: How often to take. Decode patterns like 1-0-1 (morning-afternoon-night), A/F = after food, B/F = before food
    - duration: How long to take
    - purpose: Why it's prescribed (medical use/benefits)
    - sideEffects: Common side effects

    Return this exact JSON format:
    {{
        "medicines": [
            {{
                "name": "Medicine Name",
                "dosage": "250mg",
                "frequency": "Twice daily (morning and night), after food",
                "duration": "7 days",
                "purpose": "Treats bacterial infection",
                "sideEffects": "Nausea, diarrhea"
            }}
        ],
        "nextSteps": "Follow-up after 7 days if symptoms persist"
    }}

    Prescription text:
    {prescription_input.prescription_text}
    """

    response_text = gemini_text(prompt).strip()
    print(f"✅ Gemini response: {response_text[:200]}")

    try:
        result = json.loads(response_text)
    except json.JSONDecodeError:
        clean = response_text.replace("```json", "").replace("```", "").strip()
        start = clean.find('{')
        end = clean.rfind('}') + 1
        if start != -1 and end > start:
            try:
                result = json.loads(clean[start:end])
            except Exception:
                result = {"error": "Could not parse prescription. Please try a clearer image."}
        else:
            result = {"error": "Could not analyze prescription"}

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
