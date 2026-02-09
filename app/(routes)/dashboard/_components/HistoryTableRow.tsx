"use client";
import React, { useEffect, useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { SessionDetail } from "../medical-agent/[sessionId]/page";
import moment from "moment";
import ViewReportDialog from "./ViewReportDialog";

type Props = {
  record: SessionDetail;
};

function HistoryTableRow({ record }: Props) {
  const [relativeDate, setRelativeDate] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRelativeDate(moment(new Date(record.createdOn)).fromNow());
    }
  }, [record.createdOn]);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {record.selectedDoctor.specialist}
      </TableCell>
      <TableCell>{record.notes}</TableCell>
      <TableCell>
        <span suppressHydrationWarning>{relativeDate}</span>
      </TableCell>
      <TableCell className="text-right">
        <ViewReportDialog record={record} />
      </TableCell>
    </TableRow>
  );
}

export default HistoryTableRow;
