"use client";
import React from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SessionDetail } from "../medical-agent/[sessionId]/page";
import HistoryTableRow from "./HistoryTableRow";

type Props = {
  historyList: SessionDetail[];
};

function HistoryTable({ historyList }: Props) {
  return (
    <Table>
      <TableCaption>Previous Consultation Reports</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Doctor</TableHead>
          <TableHead>AI Medical Specilist</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {historyList.map((record: SessionDetail, index: number) => (
          <HistoryTableRow key={index} record={record} />
        ))}
      </TableBody>
    </Table>
  );
}

export default HistoryTable;