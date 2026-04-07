"use client";
import { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "@/lib/apiConfig";
import Tesseract from "tesseract.js"; // ✅ browser-side OCR — no backend, no CORS

type Place = { name: string; lat: number; lon: number; distance: number };

type Medicine = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  purpose: string;
  sideEffects?: string;
};

type Message = {
  role: string;
  text?: string;
  places?: Place[];
  medicines?: Medicine[];
  nextSteps?: string;
};

// ─── Prescription parser (runs entirely in browser after Tesseract OCR) ───────
function parsePrescriptionText(text: string): {
  medicines: { name: string; dosage: string; raw: string }[];
  rawText: string;
} {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const medicines: { name: string; dosage: string; raw: string }[] = [];

  // Matches: "Tab. Paracetamol 500mg", "Amoxicillin 250 mg", "Cap Metformin 500mg 1-0-1"
  const dosagePattern = /\b(\d+\.?\d*)\s*(mg|ml|mcg|g|IU|units?|tab|cap|tablet|capsule)\b/i;
  const prefixPattern = /^(tab\.?|cap\.?|syp\.?|inj\.?|tablet|capsule|syrup|injection)\s+/i;

  for (const line of lines) {
    const dosageMatch = dosagePattern.exec(line);
    if (dosageMatch) {
      const nameRaw = line.slice(0, dosageMatch.index).trim();
      const name = nameRaw.replace(prefixPattern, "").trim();
      medicines.push({
        name: name || "Unknown",
        dosage: dosageMatch[0],
        raw: line,
      });
    }
  }

  return { medicines, rawText: text };
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0); // 0–100
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (open) {
      setMessages([
        {
          role: "bot",
          text: "👋 Hi! I'm your AI Medical Assistant. You can ask questions, upload prescriptions, type 'summarize', or click 'Nearby Services' anytime.",
        },
      ]);
      setOcrText("");
      setInput("");
    }
  }, [open]);

  useEffect(() => {
    if (autoScroll && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, clientHeight, scrollHeight } = chatContainerRef.current;
      setAutoScroll(scrollTop + clientHeight >= scrollHeight - 20);
    }
  };

  async function sendMessage() {
    if (!input) return;
    const userMessage = input.trim();
    setMessages((m) => [...m, { role: "user", text: userMessage }]);
    setInput("");

    try {
      if (userMessage.toLowerCase() === "summarize") {
        const combined = messages
          .filter((m) => m.role === "user")
          .map((m) => m.text)
          .join(". ");

        const res = await fetch(`${API_BASE_URL}/chat-summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: combined }),
        });
        
        if (!res.ok) {
          setMessages((m) => [...m, { role: "bot", text: "⚠️ Summary service unavailable. Please try again." }]);
          return;
        }
        
        const data = await res.json();
        setMessages((m) => [...m, { role: "bot", text: "📋 Summary: " + data.summary }]);
        sessionStorage.setItem("diagnosisSummary", data.summary);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/chat-predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      
      if (!res.ok) {
        setMessages((m) => [...m, { role: "bot", text: "⚠️ AI service temporarily unavailable. Please try again." }]);
        return;
      }
      
      const data = await res.json();
      setMessages((m) => [...m, { role: "bot", text: data.reply }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((m) => [...m, { role: "bot", text: "⚠️ Connection error. Please check your internet and try again." }]);
    }
  }

  // ✅ KEY FIX: OCR runs in the browser via Tesseract.js — zero CORS issues
  async function extractOCR(file: File) {
    setIsUploading(true);
    setOcrProgress(0);

    console.log("🔄 Starting browser-side OCR...");
    console.log(`File: ${file.name}  Size: ${file.size}  Type: ${file.type}`);

    setMessages((m) => [...m, { role: "user", text: "📤 Uploaded Prescription" }]);

    try {
      // ── Step 1: Run Tesseract OCR entirely in the browser ──────────────────
      const { data: { text: rawText } } = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            const pct = Math.round(m.progress * 100);
            setOcrProgress(pct);
            console.log(`OCR progress: ${pct}%`);
          }
        },
      });

      console.log("✅ OCR complete. Extracted text (first 200 chars):", rawText.slice(0, 200));
      setOcrText(rawText);

      if (!rawText.trim()) {
        setMessages((m) => [
          ...m,
          { role: "bot", text: "⚠️ OCR returned no text. Please upload a clearer prescription image." },
        ]);
        return;
      }

      // ── Step 2: Quick client-side parse to show detected medicines ─────────
      const { medicines: detected } = parsePrescriptionText(rawText);

      if (detected.length > 0) {
        // Show client-parsed medicines immediately while AI analysis loads
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            text: `🔍 Detected ${detected.length} medicine(s). Analyzing with AI...`,
          },
        ]);
      }

      // ── Step 3: Send extracted TEXT to your backend for AI analysis ────────
      //    This is a plain JSON POST — no file upload, so no CORS issues
      //    as long as your backend allows Content-Type: application/json
      const analyzeRes = await fetch(`${API_BASE_URL}/analyze-prescription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prescription_text: rawText }),
      });

      if (!analyzeRes.ok) {
        throw new Error(`Analysis failed: ${analyzeRes.status} ${analyzeRes.statusText}`);
      }

      const analysisData = await analyzeRes.json();
      console.log("✅ AI analysis complete:", analysisData);

      if (analysisData.error) {
        // Fallback: show client-parsed medicines if AI fails
        console.warn("⚠️ AI analysis error:", analysisData.error);
        if (detected.length > 0) {
          setMessages((m) => [
            ...m,
            {
              role: "bot",
              medicines: detected.map((d) => ({
                name: d.name,
                dosage: d.dosage,
                frequency: "—",
                duration: "—",
                purpose: "Consult your doctor",
              })),
              nextSteps: "AI analysis unavailable. Shown are OCR-detected medicines only.",
            },
          ]);
        } else {
          setMessages((m) => [
            ...m,
            {
              role: "bot",
              text: `⚠️ ${analysisData.error}\n\n📋 Raw text:\n${rawText}`,
            },
          ]);
        }
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            medicines: analysisData.medicines || [],
            nextSteps: analysisData.nextSteps,
          },
        ]);
      }
    } catch (error) {
      console.error("❌ OCR/analysis error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: `⚠️ Error processing prescription: ${msg}\n\n💡 Tips:\n• Use a well-lit, clear photo\n• Ensure text is readable\n• Supported formats: JPG, PNG, WEBP`,
        },
      ]);
    } finally {
      setIsUploading(false);
      setOcrProgress(0);
    }
  }

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
  }

  async function fetchNearbyServices() {
    if (!navigator.geolocation) {
      setMessages((m) => [...m, { role: "bot", text: "⚠️ Location not available in your browser." }]);
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const query = `[out:json];(node["amenity"="hospital"](around:2000,${lat},${lon});node["amenity"="clinic"](around:2000,${lat},${lon});node["amenity"="pharmacy"](around:2000,${lat},${lon}););out;`;
      try {
        const response = await fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query));
        const data = await response.json();
        if (data.elements.length > 0) {
          const places: Place[] = data.elements.slice(0, 5).map((p: any) => ({
            name: p.tags.name || "Unnamed place",
            lat: p.lat,
            lon: p.lon,
            distance: calculateDistance(lat, lon, p.lat, p.lon),
          }));
          setMessages((m) => [...m, { role: "bot", places }]);
        } else {
          setMessages((m) => [...m, { role: "bot", text: "❌ No nearby clinics/hospitals/pharmacies found." }]);
        }
      } catch {
        setMessages((m) => [...m, { role: "bot", text: "⚠️ Error fetching nearby services." }]);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg z-50"
      >
        💬
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 w-96 h-[500px] bg-white border rounded-2xl shadow-lg flex flex-col z-50">
          {/* Header */}
          <div className="p-3 border-b flex justify-between items-center bg-blue-600 text-white rounded-t-2xl">
            <h3 className="font-bold">AI Medical Assistant</h3>
            <button onClick={() => setOpen(false)}>✖</button>
          </div>

          {/* OCR progress bar */}
          {isUploading && (
            <div className="px-3 pt-2">
              <div className="text-xs text-gray-500 mb-1">
                {ocrProgress < 100 ? `Reading prescription… ${ocrProgress}%` : "Analyzing with AI…"}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Messages */}
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="flex-1 p-3 overflow-y-auto space-y-2"
          >
            {messages.map((m, i) => (
              <div key={i}>
                {m.text && (
                  <div
                    className={`max-w-[80%] p-2 rounded-lg whitespace-pre-line text-sm ${
                      m.role === "user"
                        ? "bg-blue-500 text-white ml-auto"
                        : "bg-gray-200 text-black"
                    }`}
                  >
                    {m.text}
                  </div>
                )}

                {m.medicines && m.medicines.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-bold text-gray-800 mb-2 text-sm">💊 Prescription Medicines:</div>
                    {m.medicines.map((med, idx) => (
                      <div key={idx} className="border-l-4 border-blue-500 bg-blue-50 p-3 rounded-lg shadow-sm">
                        <p className="font-bold text-blue-700 text-sm">{med.name}</p>
                        <div className="text-xs text-gray-700 mt-1 space-y-1">
                          <p>📌 <strong>Dosage:</strong> {med.dosage}</p>
                          <p>⏰ <strong>Frequency:</strong> {med.frequency}</p>
                          <p>⏱️ <strong>Duration:</strong> {med.duration}</p>
                          <p>🎯 <strong>Purpose:</strong> {med.purpose}</p>
                          {med.sideEffects && (
                            <p>⚠️ <strong>Side Effects:</strong> {med.sideEffects}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {m.nextSteps && (
                      <div className="bg-gray-100 p-2 rounded-lg border border-gray-300">
                        <p className="text-xs"><strong>📋 Next Steps:</strong> {m.nextSteps}</p>
                      </div>
                    )}
                  </div>
                )}

                {m.places && (
                  <div className="space-y-2">
                    {m.places.map((place, idx) => (
                      <div key={idx} className="border rounded-lg p-2 bg-gray-100 shadow-sm">
                        <p className="font-semibold text-sm">{place.name}</p>
                        <p className="text-xs text-gray-600">{place.distance} km away</p>
                        <a
                          href={`https://www.google.com/maps?q=${place.lat},${place.lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline text-xs"
                        >
                          View on Google Maps
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input bar */}
          <div className="p-3 border-t flex items-center gap-2">
            <input
              type="file"
              id="prescriptionUpload"
              className="hidden"
              accept="image/*"
              onChange={(e) => e.target.files && extractOCR(e.target.files[0])}
            />
            <button
              onClick={() => document.getElementById("prescriptionUpload")?.click()}
              className={`p-2 rounded-full text-sm ${
                isUploading ? "bg-yellow-300 animate-pulse cursor-not-allowed" : "bg-gray-200 hover:bg-gray-300"
              }`}
              title={isUploading ? "Processing..." : "Upload Prescription"}
              disabled={isUploading}
            >
              {isUploading ? "⏳" : "📎"}
            </button>

            <button
              onClick={fetchNearbyServices}
              className="p-2 bg-green-500 text-white rounded-full text-sm"
              title="Find Nearby Services"
            >
              🏥
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); }}}
              className="flex-1 border p-2 rounded text-sm"
              placeholder="Ask anything… (type 'summarize' for report)"
            />

            <button onClick={sendMessage} className="bg-blue-500 text-white px-3 py-2 rounded text-sm">
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}