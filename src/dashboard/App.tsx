import { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { StatsCards } from "./components/StatsCards";
import { ChartSection } from "./components/ChartSection";
import { Filters } from "./components/Filters";
import { DataTable } from "./components/DataTable";
import { Skeleton } from "@/components/ui/skeleton";

interface Category {
  id: number;
  name: string;
}

interface Entry {
  id: number;
  amount: number;
  note: string | null;
  created_at: string;
  category_name: string;
  category_type: string;
}

interface StatsData {
  breakdown: Array<{ name: string; total: number; type: string }>;
  totals: {
    total_expense: number;
    total_saving: number;
    transaction_count: number;
  };
}

export function App() {
  const { user, loading: authLoading, error: authError, apiFetch } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDays, setSelectedDays] = useState("30");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadData() {
      setLoading(true);
      try {
        // Load categories
        const catRes = await apiFetch("/api/categories");
        const catData = await catRes.json();
        if (catData.success) setCategories(catData.data);

        // Load stats
        const statsRes = await apiFetch(`/api/stats?days=${selectedDays}`);
        const statsData = await statsRes.json();
        if (statsData.success) setStats(statsData.data);

        // Load entries
        const params = new URLSearchParams();
        params.set("days", selectedDays);
        if (selectedCategory !== "all") params.set("category", selectedCategory);

        const entriesRes = await apiFetch(`/api/entries?${params.toString()}`);
        const entriesData = await entriesRes.json();
        if (entriesData.success) setEntries(entriesData.data);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, authLoading, selectedCategory, selectedDays, apiFetch]);

  if (authLoading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="container mx-auto p-4 max-w-4xl text-center">
        <h1 className="text-xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">{authError}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Yunus Finance Tracker</h1>

      {stats && (
        <StatsCards
          totalExpense={Number(stats.totals.total_expense || 0)}
          totalSaving={Number(stats.totals.total_saving || 0)}
          transactionCount={Number(stats.totals.transaction_count || 0)}
        />
      )}

      <div className="mt-6 mb-6">
        <Filters
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedDays={selectedDays}
          onDaysChange={setSelectedDays}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {stats && <ChartSection data={stats.breakdown} />}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <DataTable data={entries} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
