import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  value: Date;
  onChange: (d: Date) => void;
  className?: string;
}

export default function DateTimeField({ label, value, onChange, className }: Props) {
  const safeValue = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();
  const timeStr = format(safeValue, "HH:mm");
  const handleDate = (d: Date | undefined) => {
    if (!d) return;
    const next = new Date(safeValue);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    onChange(next);
  };
  const handleTime = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [h, m] = e.target.value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const next = new Date(safeValue);
    next.setHours(h, m, 0, 0);
    onChange(next);
  };
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label>{label}</Label>}
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="flex-1 justify-start text-left font-normal">
              <CalendarIcon className="w-4 h-4 mr-2 opacity-70" />
              {format(safeValue, "dd.MM.yy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={safeValue}
              onSelect={handleDate}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <Input type="time" value={timeStr} onChange={handleTime} className="w-32" />
      </div>
    </div>
  );
}