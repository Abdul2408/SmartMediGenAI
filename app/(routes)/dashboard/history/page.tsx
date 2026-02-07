'use client'
import React from "react";
import dynamic from 'next/dynamic';

const HistoryList = dynamic(
  () => import('../_components/HistoryList'),
  { 
    ssr: false,
    loading: () => <div className="p-6">Loading history...</div>
  }
);

function History() {
  return (
    <div>
      <HistoryList />
    </div>
  );
}

export default History;