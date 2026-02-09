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
  const [callStartedUI, setCallStartedUI] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const shouldStartRecognitionOnTtsEnd = useRef<boolean>(false);
  const callStarted = useRef<boolean>(false);
  const conversationHistory = useRef<Array<{ role: string, content: string }>>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

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

    console.log('🔧 Initializing Speech Recognition...');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('❌ Speech Recognition API not available');
      toast.error('Speech Recognition not supported. Use Chrome or Edge.');
      return null;
    }

    console.log('✅ Speech Recognition API available');
    
    // Check microphone access first
    checkMicrophoneAccess();
    
    const recognition = new SpeechRecognition();
    
    // Configuration
    recognition.continuous = true;  // Changed to true to keep listening
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    console.log('📋 Recognition configured');

    let speechDetectedTimeout: any = null;
    let hasDetectedSpeech = false;

    recognition.onstart = () => {
      console.log('🎤 [ONSTART] Speech recognition listening...');
      setIsListening(true);
      setCurrentRole('user');
      setLiveTranscripts('🎤 Listening... (speak now - speak clearly and loudly)');
      hasDetectedSpeech = false;

      // Timeout if no speech in 20 seconds
      speechDetectedTimeout = setTimeout(() => {
        if (!hasDetectedSpeech && recognitionRef.current) {
          console.log('⚠️ [TIMEOUT] No speech detected in 20 seconds, restarting...');
          recognitionRef.current.stop();
        }
      }, 20000);
    };

    recognition.onresult = (event: any) => {
      console.log('📝 [ONRESULT] Audio detected!');

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

      if (interimTranscript) {
        console.log('   Live: ' + interimTranscript);
        setLiveTranscripts(`You: ${interimTranscript}`);
      }

      if (finalTranscript) {
        console.log('✅ [FINAL] Transcript:', finalTranscript.trim());
        recognitionRef.current?.stop();
        handleUserSpeech(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      if (speechDetectedTimeout) {
        clearTimeout(speechDetectedTimeout);
      }

      console.error('🔴 [ONERROR] Speech recognition error:', event.error);
      
      let errorMsg = `Mic error: ${event.error}`;
      
      if (event.error === 'no-speech') {
        errorMsg = '❌ No audio detected. Check: 1) Microphone connected 2) Not muted 3) Speak clearly 4) Sufficient volume';
        console.log('💡 Troubleshooting: Is your microphone physically connected? Is it muted in Windows settings?');
      } else if (event.error === 'not-allowed') {
        errorMsg = '❌ Microphone permission denied. Click 🔒 in address bar → Allow Microphone';
      } else if (event.error === 'audio-capture') {
        errorMsg = '❌ No microphone found. Check if mic is connected and enabled in Windows.';
      } else if (event.error === 'network') {
        errorMsg = '❌ Network error. Check your internet connection.';
      }
      
      setLiveTranscripts(errorMsg);
      toast.error(errorMsg);
    };

    recognition.onend = () => {
      if (speechDetectedTimeout) {
        clearTimeout(speechDetectedTimeout);
      }

      console.log('⏹️ [ONEND] Speech recognition ended');
      setIsListening(false);
      setLiveTranscripts('');
    };

    return recognition;
  };

  const checkMicrophoneAccess = async () => {
    try {
      console.log('🔍 Checking microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ Microphone access granted');
      // Stop the stream immediately
      stream.getTracks().forEach(track => track.stop());
      
      // Get audio level to ensure microphone is working
      const audioContext = new (window as any).AudioContext();
      const mediaStreamSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      mediaStreamSource.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      console.log('🔊 Mic audio level:', average);
      
    } catch (error: any) {
      console.error('❌ Microphone access error:', error.message);
      
      if (error.name === 'NotAllowedError') {
        console.error('💡 Permission denied. Check browser settings.');
      } else if (error.name === 'NotFoundError') {
        console.error('💡 No microphone found. Is your mic plugged in?');
      }
      
      toast.error('Microphone not accessible: ' + error.message);
    }
  };

  const handleUserSpeech = async (transcript: string) => {
    console.log('👤 User said:', transcript);
    
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
      setLiveTranscripts('🤔 Thinking...');

      const systemPrompt =
        sessionDetail?.selectedDoctor?.agentPrompt ||
        "You are a helpful and friendly medical assistant. Answer user questions clearly and empathetically. Keep responses concise and conversational.";

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
      console.error('❌ API Error:', error);
      
      let errorMsg = 'AI response failed';
      if (error.code === 'ERR_NETWORK') {
        errorMsg = 'Cannot connect to API. Check your internet.';
      } else if (error.response?.status === 500) {
        errorMsg = 'Server error: ' + (error.response?.data?.details || 'Unknown error');
      }
      
      toast.error(errorMsg);
      setLiveTranscripts('');
      setCurrentRole(null);
      
      // Restart recognition even on error
      if (callStarted.current && recognitionRef.current) {
        setTimeout(() => {
          try {
            console.log('🎤 Restarting recognition after error...');
            recognitionRef.current.start();
          } catch (e) {
            console.error('Failed to restart recognition:', e);
          }
        }, 2000);
      }
    }
  };

  const speakText = (text: string) => {
  console.log('🔊 [SPEAKTEXT] Preparing to speak:', text.substring(0, 50) + '...');
  
  if (!synthesisRef.current) {
    console.error('❌ SpeechSynthesis not available');
    return;
  }

  synthesisRef.current.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  
  utterance.onstart = () => {
    console.log('🔊 [ONSTART] AI started speaking');
    setIsSpeaking(true);
    setCurrentRole('assistant');
  };
  
  utterance.onerror = (event: any) => {
    console.error('🔊 [ONERROR] TTS error:', event.error);
  };
  
  utterance.onend = () => {
    console.log('🔊 [ONEND] AI finished speaking');
    console.log('🔍 Debug - shouldStartRecognitionOnTtsEnd:', shouldStartRecognitionOnTtsEnd.current);
    console.log('🔍 Debug - callStarted:', callStarted.current);
    console.log('🔍 Debug - recognitionRef exists:', !!recognitionRef.current);
    
    setIsSpeaking(false);
    setCurrentRole(null);
    
    if (shouldStartRecognitionOnTtsEnd.current && callStarted.current) {
      console.log('⏳ Starting recognition after AI response...');
      // No timeout needed since we're using continuous mode
      if (callStarted.current && recognitionRef.current) {
        try {
          console.log('🎤 [STARTING RECOGNITION] Calling recognition.start()...');
          recognitionRef.current.start();
          console.log('✅ Recognition.start() succeeded');
        } catch (err: any) {
          console.error('❌ Recognition.start() failed:', err.message);
          setLiveTranscripts('Failed to start microphone: ' + err.message);
        }
      } else {
        console.error('❌ Cannot start recognition - conditions not met');
        console.error('   callStarted:', callStarted.current);
        console.error('   recognitionRef:', !!recognitionRef.current);
      }
    } else {
      console.error('❌ Skipping recognition start');
      console.error('   shouldStartRecognitionOnTtsEnd:', shouldStartRecognitionOnTtsEnd.current);
      console.error('   callStarted:', callStarted.current);
    }
  };

  console.log('🔊 Calling speechSynthesis.speak()...');
  synthesisRef.current.speak(utterance);
};

  const startCall = () => {
    console.log('📞 [STARTCALL] Starting call...');
    
    if (!sessionDetail) {
      console.error('❌ Session not loaded');
      toast.error('Session not loaded');
      return;
    }

    try {
      console.log('🔧 Initializing speech recognition...');
      const recognition = initializeSpeechRecognition();
      if (!recognition) {
        console.error('❌ Failed to initialize speech recognition');
        return;
      }

      console.log('✅ Speech recognition initialized');
      recognitionRef.current = recognition;
      
      callStarted.current = true;
      setCallStartedUI(true);
      shouldStartRecognitionOnTtsEnd.current = true;

      console.log('🔊 Playing welcome message...');
      // Generate specialist-specific welcome message
      const specialist = sessionDetail.selectedDoctor.specialist;
      let welcome = "Hello, I am your AI Medical Voice Agent. How can I help you today?";
      
      if (specialist === 'General Physician') {
        welcome = "Hello, I'm your General Physician AI. I'm here to help with your everyday health concerns. What symptoms or health issues are you experiencing today?";
      } else if (specialist === 'Cardiologist') {
        welcome = "Hello, I'm your Cardiologist AI specialist. I focus on heart and cardiovascular health. Do you have any concerns about your heart health, blood pressure, or chest discomfort?";
      } else if (specialist === 'Dermatologist') {
        welcome = "Hello, I'm your Dermatologist AI specialist. I specialize in skin health and conditions. Tell me, what skin concerns brought you in today?";
      } else if (specialist === 'Neurologist') {
        welcome = "Hello, I'm your Neurologist AI specialist. I focus on nervous system and neurological conditions. Are you experiencing any headaches, migraines, or neurological symptoms?";
      } else if (specialist === 'Orthopedist') {
        welcome = "Hello, I'm your Orthopedist AI specialist. I specialize in bone, joint, and muscle health. Do you have any pain or mobility issues today?";
      } else if (specialist === 'Pulmonologist') {
        welcome = "Hello, I'm your Pulmonologist AI specialist. I focus on respiratory and lung health. Are you experiencing any breathing difficulties or respiratory symptoms?";
      } else if (specialist === 'Gastroenterologist') {
        welcome = "Hello, I'm your Gastroenterologist AI specialist. I specialize in digestive system health. What digestive symptoms or concerns do you have?";
      } else if (specialist === 'Psychologist') {
        welcome = "Hello, I'm your Psychologist AI specialist. I'm here to support your mental and emotional well-being. How are you feeling today? What brought you here?";
      }
      
      conversationHistory.current.push({ role: 'assistant', content: welcome });
      setMessages([{ role: 'assistant', text: welcome }]);
      speakText(welcome);
      
      toast.success('Call started! Speak after the welcome message.');
      console.log('✅ Call started - recognition will start after welcome message');
    } catch (err) {
      console.error('❌ Error starting call:', err);
      toast.error('Failed to start call');
    }
  };

  const endCall = async () => {
    setLoading(true);
    recognitionRef.current?.stop();
    synthesisRef.current?.cancel();
    callStarted.current = false;
    setCallStartedUI(false);

    try {
      // Convert sessionId to string (it might be an array from useParams)
      const sessionIdStr = Array.isArray(sessionId) ? sessionId[0] : sessionId;
      
      console.log('📊 [REPORT] Generating medical report...');
      console.log('📊 SessionID:', sessionIdStr);
      console.log('📊 Messages count:', messages.length);
      console.log('📊 Messages:', JSON.stringify(messages, null, 2));
      
      const reportResponse = await axios.post('/api/medical-report', {
        sessionId: sessionIdStr,
        messages,
        sessionDetail
      });
      
      console.log('📊 [REPORT] Response:', reportResponse.data);
      toast.success('Report generated successfully!');
    } catch (error: any) {
      console.error('❌ Error generating report:', error);
      console.error('📊 Error details:', error.response?.data || error.message);
      toast.error('Failed to generate report: ' + (error.response?.data?.message || error.message));
    }

    setLoading(false);
    router.replace('/dashboard');
  };

  return (
    <div className='border rounded-3xl p-10 bg-secondary'>
      <div className='flex justify-between items-center'>
        <h2 className='p-1 px-2 border flex gap-2 items-center'>
          <Circle className={`h-4 w-4 rounded-full ${callStartedUI ? 'bg-green-500' : 'bg-red-500'}`} />
          {callStartedUI ? 'Connected' : 'Not Connected'}
        </h2>
        <div className='flex items-center gap-2'>
          {isListening && <Mic className='h-5 w-5 text-green-500 animate-pulse' />}
          {isSpeaking && <span className='text-sm text-blue-500 animate-pulse'>AI Speaking...</span>}
        </div>
      </div>

      {sessionDetail && (
        <div className='flex flex-col items-center mt-10'>
          <Image
            src={sessionDetail.selectedDoctor.image}
            alt={sessionDetail.selectedDoctor.specialist ?? ''}
            width={120}
            height={120}
            className='rounded-full h-[120px] w-[120px] object-cover'
          />
          <h2 className='mt-4 text-lg font-semibold'>{sessionDetail.selectedDoctor.specialist}</h2>
          <p className='text-sm text-gray-500'>AI Medical Voice Agent</p>

          {/* Live Transcript Display */}
          {callStartedUI && (
            <div className='mt-8 w-full max-w-2xl'>
              <div className='bg-gray-800 text-white rounded-lg p-4 min-h-[80px] flex items-center justify-center'>
                {liveTranscripts ? (
                  <p className='text-sm text-center'>{liveTranscripts}</p>
                ) : (
                  <p className='text-gray-400 text-sm'>Waiting for input...</p>
                )}
              </div>
            </div>
          )}

          {/* Conversation History */}
          <div ref={chatContainerRef} className='mt-6 w-full max-w-2xl max-h-[350px] overflow-y-auto bg-white rounded-lg border p-3'>
            {messages.map((msg, index) => (
              <div key={index} className={`mb-3 p-3 rounded-md ${msg.role === 'user' ? 'bg-blue-100 text-right ml-8' : 'bg-gray-100 mr-8'}`}>
                <p className='text-xs font-semibold'>{msg.role === 'user' ? 'You' : 'AI'}</p>
                <p className='text-sm'>{msg.text}</p>
              </div>
            ))}
          </div>

          {!callStartedUI ? (
            <Button className='mt-10' onClick={startCall} disabled={loading}>
              {loading ? <Loader className='animate-spin' /> : <PhoneCall />} Start Call
            </Button>
          ) : (
            <Button variant='destructive' onClick={endCall} disabled={loading} className='mt-10'>
              {loading ? <Loader className='animate-spin' /> : <PhoneOff />} End Call
            </Button>
          )}
          
          <p className='text-xs text-gray-400 mt-4'>Use Chrome or Edge for best experience</p>
        </div>
      )}
    </div>
  );
};

export default MedicalVoiceAgent;