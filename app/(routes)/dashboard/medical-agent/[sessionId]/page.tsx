"use client"

import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import React from 'react'
import { doctorAgent } from '../../_components/DoctorAgentCard';
import { Circle, Loader, PhoneCall, PhoneOff } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Vapi from '@vapi-ai/web';
import { toast } from 'sonner';

export type SessionDetail = {
  sessionId: string;
  id: number;
  notes: string;
  report: JSON;
  selectedDoctor: doctorAgent;
  createdOn: string;
};

type messages = {
  role: string;
  text: string;
}

const MedicalVoiceAgent = () => {
  const { sessionId } = useParams();
  const [sessionDetail, setSessionDetail] = React.useState<SessionDetail>();
  const [vapiInstance, setVapiInstance] = React.useState<any>(null);
  const [currentRole, setCurrentRole] = React.useState<string | null>();
  const [liveTranscripts, setLiveTranscripts] = React.useState<string>();
  const [messages, setMessages] = React.useState<messages[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [CallStarted, setCallStarted] = React.useState(false);
  const router = useRouter();

  // Initialize VAPI instance once
  React.useEffect(() => {
    if (!vapiInstance && process.env.NEXT_PUBLIC_VAPI_API_KEY) {
      const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_API_KEY);
      setVapiInstance(vapi);
    }

    // Cleanup on unmount
    return () => {
      if (vapiInstance) {
        vapiInstance.stop();
        vapiInstance.removeAllListeners();
      }
    };
  }, []);

  React.useEffect(() => {
    sessionId && getSessionDetails();
  }, [sessionId]);

  const getSessionDetails = async () => {
    const result = await axios.get('/api/session-chat?sessionId=' + sessionId);
    console.log(result.data);
    setSessionDetail(result.data);
  };

  const StartCall = () => {
    if (!vapiInstance) {
      toast.error('VAPI is not initialized');
      return;
    }

    if (!sessionDetail) {
      toast.error('Session details not loaded');
      return;
    }

    const VapiAgentConfig = {
      name: "AI Medical Voice Agent",
      firstMessage: "Hello, I am your AI Medical Voice Agent. How can I assist you today?",
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: 'en',
      },
      voice: {
        provider: 'playht',
        voiceId: sessionDetail?.selectedDoctor?.voiceId || 'jennifer',
      },
      model: {
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: sessionDetail?.selectedDoctor?.agentPrompt ||
              "You are a helpful and friendly medical assistant. Answer user questions clearly and empathetically.",
          }
        ]
      }
    };

    // Remove old listeners before starting
    vapiInstance.removeAllListeners();

    // Add event listeners
    vapiInstance.on('call-start', () => {
      console.log('Call started');
      setCallStarted(true);
    });

    vapiInstance.on('call-end', () => {
      console.log('Call ended');
      setCallStarted(false);
    });

    vapiInstance.on('message', (message: any) => {
      if (message.type === 'transcript') {
        const { role, transcriptType, transcript } = message;
        console.log(`${role}: ${transcript}`);

        if (transcriptType === 'partial') {
          setLiveTranscripts(transcript);
          setCurrentRole(role);
        } else if (transcriptType === 'final') {
          setMessages((prev: any) => [...prev, { role: role, text: transcript }]);
          setLiveTranscripts("");
          setCurrentRole(null);
        }
      }
    });

    vapiInstance.on('speech-start', () => {
      console.log('Assistant started speaking');
      setCurrentRole('assistant');
    });

    vapiInstance.on('speech-end', () => {
      console.log('Assistant stopped speaking');
      setCurrentRole('user');
    });

    vapiInstance.on('error', (error: any) => {
      console.error('VAPI Error:', error);
      toast.error('Call error: ' + (error.message || 'Unknown error'));
    });

    // Start the call
    // @ts-ignore
    vapiInstance.start(VapiAgentConfig);
  };

  const endCall = async () => {
    setLoading(true);

    if (vapiInstance) {
      vapiInstance.stop();
    }

    await GenerateReport();

    setCallStarted(false);
    setVapiInstance(null);
    setLoading(false);

    toast.success('Your report has been generated successfully!');
    router.replace('/dashboard');
  };

  const GenerateReport = async () => {
    const result = await axios.post('/api/medical-report', {
      sessionId: sessionId,
      messages: messages,
      sessionDetail: sessionDetail
    });

    console.log(result.data);
    return result.data;
  };

  return (
    <div className='border rounded-3xl p-10 bg-secondary'>
      <div className='flex justify-between items-center'>
        <h2 className='p-1 px-2 rounded-md border flex gap-2 items-center'>
          <Circle className={`h-4 w-4 rounded-full ${CallStarted ? 'bg-green-500' : 'bg-red-500'}`} />
          {CallStarted ? 'Connected' : 'Not Connected'}
        </h2>
        <h2 className='font-bold text-xl text-gray-400'>00.00</h2>
      </div>

      {sessionDetail && (
        <div className='flex flex-col items-center mt-10'>
          <Image
            src={sessionDetail?.selectedDoctor?.image}
            alt={sessionDetail?.selectedDoctor?.specialist ?? ''}
            width={120}
            height={120}
            className='rounded-full mt-4 mb-2 h-[100px] w-[100px] object-cover'
          />
          <h2 className='mt-2 text-lg'>{sessionDetail?.selectedDoctor?.specialist}</h2>
          <p className='text-sm text-gray-500 text-center max-w-md'>
            AI Medical Voice Agent
          </p>

          <div className='mt-12 overflow-y-auto flex flex-col items-center px-10 md:px-28 lg:px-52 xl:px-72'>
            {messages?.slice(-4).map((msg: messages, index) => (
              <h2 className='text-gray-400 p-2' key={index}>{msg.role}: {msg.text}</h2>
            ))}
            {liveTranscripts && liveTranscripts?.length > 0 && (
              <h2 className='text-lg'>{currentRole}: {liveTranscripts}</h2>
            )}
          </div>

          {!CallStarted ? (
            <Button className='mt-20' onClick={StartCall} disabled={loading}>
              {loading ? <Loader className='animate-spin' /> : <PhoneCall />} Start Call
            </Button>
          ) : (
            <Button variant='destructive' onClick={endCall} disabled={loading} className='mt-20'>
              {loading ? <Loader className='animate-spin' /> : <PhoneOff />}
              End Call
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default MedicalVoiceAgent;