import { useState, useEffect, useCallback } from "react";

interface User {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [initData, setInitData] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) {
      setError("This app must be opened from Telegram.");
      setLoading(false);
      return;
    }

    tg.ready();
    tg.expand();

    const data = tg.initData;
    if (!data) {
      setError("Missing Telegram authentication data.");
      setLoading(false);
      return;
    }

    setInitData(data);

    try {
      const userData = tg.initDataUnsafe?.user;
      if (userData) {
        setUser(userData);
      }
    } catch {
      // initDataUnsafe might not be available
    }

    setLoading(false);
  }, []);

  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const res = await fetch(endpoint, {
        ...options,
        headers: {
          ...options.headers,
          "X-Telegram-Init-Data": initData,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401) {
        setError("Unauthorized. You are not whitelisted.");
        throw new Error("Unauthorized");
      }

      return res;
    },
    [initData]
  );

  return { user, initData, loading, error, apiFetch };
}
