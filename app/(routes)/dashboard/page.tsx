'use client'
import React from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'

// Dynamically import ALL components with ssr: false
const AddNewSessionDialog = dynamic(
  () => import('./_components/AddNewSessionDialog'),
  { ssr: false }
)

const HistoryList = dynamic(
  () => import('./_components/HistoryList'),
  { ssr: false }
)

const DoctorsAgentList = dynamic(
  () => import('./_components/DoctorsAgentList'),
  { ssr: false }
)

const Chatbot = dynamic(
  () => import('./_components/Chatbot'),
  { ssr: false }
)

function Dashboard() {
  return (
    <div>
      <div className='flex justify-between item-center'>
        <h2 className='font-bold text-2xl'>My Dashboard</h2>
        <AddNewSessionDialog/>
      </div>
      <HistoryList/>
      <DoctorsAgentList/>
      {/* ✅ Floating chatbot assistant */}
      <Chatbot />
    </div>
  )
}

export default Dashboard