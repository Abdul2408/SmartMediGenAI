"use client"

import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { doctorAgent } from '../../_components/DoctorAgentCard';
import { Circle, Loader, PhoneCall, PhoneOff, Mic } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type SessionDetail = {
  sessionId: string;
  id: number;
  notes: string;
  report: JSON;
  selectedDoctor: doctorAgent;
  createdOn: string;
};

type Message = {
  role: string;
  text: string;
}

const MedicalVoiceAgent = () => {
  const { sessionId } = useParams();
  const router = useRouter();

  const [sessionDetail, setSessionDetail] = useState<SessionDetail>();
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [callStarted, setCallStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const shouldRestartRecognition = useRef<boolean>(false);
  const shouldStartRecognitionOnTtsEnd = useRef<boolean>(false);
  const conversationHistory = useRef<Array<{ role: string, content: string }>>([]);

  useEffect(() => {
    sessionId && getSessionDetails();

    if (typeof window !== 'undefined') {
      synthesisRef.current = window.speechSynthesis;
    }

    return () => {
      recognitionRef.current?.stop();
      synthesisRef.current?.cancel();
    };
  }, [sessionId]);

  const getSessionDetails = async () => {
    try {
      const result = await axios.get('/api/session-chat?sessionId=' + sessionId);
      setSessionDetail(result.data);
    } catch {
      toast.error('Failed to load session details');
    }
  };

  const initializeSpeechRecognition = () => {
    if (typeof window === 'undefined') return null;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Speech Recognition not supported. Use Chrome, Edge, or Safari.');
      return null;
    }

    const recognition = new SpeechRecognition();
    // CRITICAL: Set continuous to false to avoid timeout issues
    // continuous=true causes the API to aggressively timeout if no speech is detected immediately
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    // Increase sound start threshold to be more sensitive to audio
    (recognition as any).soundStartThreshold = 0.1;

    let speechDetectedTimeout: any = null;
    let hasDetectedSpeech = false;

    recognition.onstart = () => {
      console.log('🎤 Speech recognition started - listening for up to 10 seconds...');
      setIsListening(true);
      setCurrentRole('user');
      setLiveTranscripts('Listening... (speak now)');
      hasDetectedSpeech = false;

      // Fallback: if no speech detected within 10 seconds, restart
      speechDetectedTimeout = setTimeout(() => {
        if (!hasDetectedSpeech && recognitionRef.current) {
          console.log('⚠️ No speech detected in 10 seconds, restarting...');
          recognitionRef.current.stop();
        }
      }, 10000);
    };

    recognition.onresult = (event: any) => {
      if (speechDetectedTimeout) {
        clearTimeout(speechDetectedTimeout);
      }

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          hasDetectedSpeech = true;
        } else {
          interimTranscript += transcript;
        }
      }

      // Show live transcript as user speaks
      if (interimTranscript) {
        console.log('📝 Interim:', interimTranscript);
        setLiveTranscripts(`You: ${interimTranscript}`);
      }

      if (finalTranscript) {
        console.log('✅ Final transcript:', finalTranscript);
        recognitionRef.current?.stop();
        handleUserSpeech(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      if (speechDetectedTimeout) {
        clearTimeout(speechDetectedTimeout);
      }

      console.error('🔴 Speech recognition error:', event.error);
      
      let errorMsg = `Mic error: ${event.error}`;
      
      if (event.error === 'no-speech') {
        errorMsg = '❌ No microphone audio detected. Check Settings → Microphone OR another app is using your mic.';
        console.log('💡 Troubleshooting:\n1. Check browser Settings → Privacy → Microphone has permission\n2. Unmute system audio\n3. Close other apps using the mic\n4. Refresh page and try again');
      } else if (event.error === 'not-allowed') {
        errorMsg = '❌ Microphone permission denied. Click 🔒 in address bar → Allow Microphone';
      } else if (event.error === 'network') {
        errorMsg = '❌ Network error. Check internet connection.';
      } else if (event.error === 'audio-capture') {
        errorMsg = '❌ No microphone found. Check if mic is connected & enabled in system settings.';
      }
      
      setLiveTranscripts(errorMsg);
      toast.error(errorMsg);
    };

    recognition.onend = () => {
      if (speechDetectedTimeout) {
        clearTimeout(speechDetectedTimeout);
      }

      console.log('⏹️ Speech recognition ended (will restart after AI responds)');
      setIsListening(false);
      setLiveTranscripts('');
      // Don't restart here - let the TTS onend handler manage restart timing
    };

    return recognition;
  };

  const handleUserSpeech = async (transcript: string) => {
    // Stop AI speaking when user starts speaking
    synthesisRef.current?.cancel();
    setIsSpeaking(false);

    const userMessage: Message = { role: 'user', text: transcript };
    setMessages(prev => [...prev, userMessage]);
    conversationHistory.current.push({ role: 'user', content: transcript });

    // Set flag to restart recognition after AI responds
    shouldStartRecognitionOnTtsEnd.current = true;
    await getAIResponse();
  };

  const getAIResponse = async () => {
    try {
      setCurrentRole('assistant');
      setLiveTranscripts('Thinking...');

      const systemPrompt =
        sessionDetail?.selectedDoctor?.agentPrompt ||
        "You are a helpful medical assistant.";

      console.log('📨 Sending API request to /api/groq-chat...');
      const res = await axios.post('/api/groq-chat', {
        messages: conversationHistory.current,
        systemPrompt,
      });

      console.log('📥 Received response from API');
      const aiResponse = res.data.content;

      const assistantMessage: Message = { role: 'assistant', text: aiResponse };
      setMessages(prev => [...prev, assistantMessage]);
      conversationHistory.current.push({ role: 'assistant', content: aiResponse });

      setLiveTranscripts('');
      speakText(aiResponse);

    } catch (error: any) {
      console.error('❌ API Error:', {
        message: error.message,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
        isNetworkError: error.code === 'ERR_NETWORK'
      });
      
      let errorMsg = 'AI response failed';
      if (error.code === 'ERR_NETWORK' || error.message.includes('ERR_CONNECTION')) {
        errorMsg = 'Cannot connect to API. Check your internet or server status.';
      } else if (error.response?.status === 500) {
        errorMsg = 'Server error: ' + (error.response?.data?.details || 'Unknown error');
      }
      
      toast.error(errorMsg);
      setLiveTranscripts('');
    }
  };

  const speakText = (text: string) => {
    if (!synthesisRef.current) return;

    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {
      console.log('🔊 AI speaking started...');
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      console.log('🔊 AI finished speaking');
      setIsSpeaking(false);
      setCurrentRole(null);
      
      // Wait 2 seconds after TTS finishes, then start recognition
      // This prevents audio input/output conflicts
      if (shouldStartRecognitionOnTtsEnd.current) {
        console.log('⏳ Waiting 2 seconds after TTS, then starting recognition...');
        setTimeout(() => {
          if (callStarted && recognitionRef.current) {
            try {
              console.log('🎤 Starting recognition...');
              recognitionRef.current.start();
            } catch (err) {
              console.error('❌ Failed to start recognition:', err);
              setLiveTranscripts('Microphone error. Refresh page and try again.');
            }
          }
        }, 2000);
      }
    };

    synthesisRef.current.speak(utterance);
  };

  const startCall = () => {
    if (!sessionDetail) {
      toast.error('Session not loaded');
      return;
    }

    try {
      const recognition = initializeSpeechRecognition();
      if (!recognition) return;

      recognitionRef.current = recognition;
      // DON'T start recognition yet - wait for welcome TTS to finish
      
      setCallStarted(true);
      shouldRestartRecognition.current = false;
      shouldStartRecognitionOnTtsEnd.current = true; // START after welcome TTS ends

      const welcome = "Hello, I am your AI Medical Voice Agent. How can I help you today?";
      conversationHistory.current.push({ role: 'assistant', content: welcome });
      setMessages([{ role: 'assistant', text: welcome }]);
      speakText(welcome); // This will trigger recognition start after TTS finishes
      
      console.log('✅ Call started - recognition will start after welcome message');
    } catch (err) {
      console.error('Error starting call:', err);
      toast.error('Failed to start call. Check browser permissions.');
    }
  };

  const endCall = async () => {
    setLoading(true);
    recognitionRef.current?.stop();
    synthesisRef.current?.cancel();

    await axios.post('/api/medical-report', {
      sessionId,
      messages,
      sessionDetail
    });

    setLoading(false);
    router.replace('/dashboard');
  };

  return (
    <div className='border rounded-3xl p-10 bg-secondary'>
      <div className='flex justify-between items-center'>
        <h2 className='p-1 px-2 border flex gap-2 items-center'>
          <Circle className={`h-4 w-4 ${callStarted ? 'bg-green-500' : 'bg-red-500'}`} />
          {callStarted ? 'Connected' : 'Not Connected'}
        </h2>
        {isListening && <Mic className='h-5 w-5 text-green-500 animate-pulse' />}
      </div>

      {sessionDetail && (
        <div className='flex flex-col items-center mt-10'>
          <Image
            src={sessionDetail.selectedDoctor.image}
            alt=""
            width={120}
            height={120}
            className='rounded-full'
          />

          {/* Live Transcript Display */}
          {callStarted && (
            <div className='mt-8 w-full max-w-2xl'>
              <div className='bg-gray-800 text-white rounded-lg p-4 min-h-16 flex items-center justify-center'>
                {liveTranscripts ? (
                  <p className='text-sm'>{liveTranscripts}</p>
                ) : (
                  <p className='text-gray-400 text-sm'>Waiting for input...</p>
                )}
              </div>
            </div>
          )}

          {!callStarted ? (
            <Button className='mt-20' onClick={startCall}>
              <PhoneCall /> Start Call
            </Button>
          ) : (
            <Button variant='destructive' onClick={endCall} className='mt-20'>
              <PhoneOff /> End Call
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default MedicalVoiceAgent;
