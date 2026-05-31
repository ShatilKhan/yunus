import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Entry {
  id: number;
  amount: number;
  note: string | null;
  created_at: string;
  category_name: string;
  category_type: string;
}

interface DataTableProps {
  data: Entry[];
}

export function DataTable({ data }: DataTableProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-muted-foreground">No entries found for this filter</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    // SQLite returns "YYYY-MM-DD HH:MM:SS" — parse manually for browser compatibility
    const parts = dateStr.split(/[\sT]/);
    const dateParts = parts[0]!.split("-").map(Number);
    const timeParts = (parts[1] || "00:00:00").split(":").map(Number);
    const date = new Date(
      dateParts[0]!,
      (dateParts[1] || 1) - 1,
      dateParts[2] || 1,
      timeParts[0] || 0,
      timeParts[1] || 0,
      timeParts[2] || 0
    );
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium whitespace-nowrap">
                {formatDate(entry.created_at)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={entry.category_type === "saving" ? "secondary" : "default"}
                >
                  {entry.category_name}
                </Badge>
              </TableCell>
              <TableCell className="tabular-nums">
                {Number(entry.amount ?? 0).toFixed(2)}
              </TableCell>
              <TableCell className="text-muted-foreground max-w-[200px] truncate">
                {entry.note || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
