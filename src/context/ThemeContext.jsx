import { createContext, useContext, useEffect, useState } from "react";
import { updateAccount } from "../lib/api.js";
import { useUser } from "./UserContext.jsx";

const ThemeContext = createContext({ darkMode: false, toggleDarkMode: () => {} });

function applyThemeColor(dark) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((tag) => {
    tag.setAttribute("content", dark ? "#0a0a0a" : "#ffffff");
  });
}

export function ThemeProvider({ children }) {
  const { user } = useUser();
  // Dark by default: logged-out users and new accounts render dark. A user who
  // has explicitly chosen light (darkMode === false) keeps that preference.
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const dm = user?.darkMode ?? true;
    setDarkMode(dm);
    document.documentElement.classList.toggle("dark", dm);
    applyThemeColor(dm);
  }, [user?.darkMode]);

  async function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    applyThemeColor(next);
    try {
      await updateAccount({ darkMode: next });
    } catch {
      // revert on failure
      setDarkMode(!next);
      document.documentElement.classList.toggle("dark", !next);
      applyThemeColor(!next);
    }
  }

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>{children}</ThemeContext.Provider>
  );
}

export function useDarkMode() {
  return useContext(ThemeContext);
}
