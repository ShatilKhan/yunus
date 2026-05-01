import { useMemo } from "react";
import { PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface ChartSectionProps {
  data: Array<{ name: string; total: number; type: string }>;
}

export function ChartSection({ data }: ChartSectionProps) {
  const chartData = useMemo(() => {
    return data.map((item) => ({
      name: item.name,
      value: Number(item.total),
      fill: item.type === "saving" ? "var(--chart-2)" : "var(--chart-1)",
    }));
  }, [data]);

  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    data.forEach((item) => {
      config[item.name] = {
        label: item.name,
        color: item.type === "saving" ? "var(--chart-2)" : "var(--chart-1)",
      };
    });
    return config;
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Spending Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">No data for this period</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px]">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, value }) => `${name}: ${value.toFixed(0)}`}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
