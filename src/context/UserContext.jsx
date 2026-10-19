import { createContext, useContext, useEffect, useState } from "react";
import { getAccount, isLoggedIn } from "../lib/api.js";

const UserContext = createContext({ user: null, loading: true, refresh: async () => {} });

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!isLoggedIn()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser((await getAccount()) || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return <UserContext.Provider value={{ user, loading, refresh }}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
