import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface FiltersProps {
  categories: Array<{ id: number; name: string }>;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  selectedDays: string;
  onDaysChange: (value: string) => void;
}

export function Filters({
  categories,
  selectedCategory,
  onCategoryChange,
  selectedDays,
  onDaysChange,
}: FiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <Select value={selectedCategory} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={String(cat.id)}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroup
        type="single"
        value={selectedDays}
        onValueChange={(value) => value && onDaysChange(value)}
      >
        <ToggleGroupItem value="1">Daily</ToggleGroupItem>
        <ToggleGroupItem value="7">Weekly</ToggleGroupItem>
        <ToggleGroupItem value="30">Monthly</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
