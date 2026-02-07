"use client";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import React from "react";
import axios from "axios";
import HistoryTable from "./HistoryTable";
import { SessionDetail } from "../medical-agent/[sessionId]/page";
import AddNewSessionDialog from "./AddNewSessionDialog";

const HistoryList = () => {
  const [historyList, setHistoryList] = React.useState<SessionDetail[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    GetHistoryList();
  }, []);

  const GetHistoryList = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await axios.get("/api/session-chat?sessionId=all");
      
      // Ensure result.data is an array
      if (Array.isArray(result.data)) {
        setHistoryList(result.data);
      } else {
        console.error("API returned non-array data:", result.data);
        setHistoryList([]);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
      setError("Failed to load consultation history");
      setHistoryList([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-10 flex justify-center items-center p-9">
        <p>Loading consultation history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-10 flex justify-center items-center p-9">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      {historyList.length === 0 ? (
        <div className="flex-col flex justify-center items-center gap-4 border-dashed rounded-2xl border-2 border p-9">
          <Image
            src="/medical-assistance.png"
            alt="No History"
            width={200}
            height={200}
          />
          <h2 className="font-bold text-xl mt-2">No Recent Consultation</h2>
          <p>It looks like you haven't consulted with any doctors yet</p>
          <AddNewSessionDialog />
        </div>
      ) : (
        <div>
          <HistoryTable historyList={historyList} />
        </div>
      )}
    </div>
  );
};

export default HistoryList;