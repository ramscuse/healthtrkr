import { createContext, useContext, useEffect, useState } from "react";
import { updateAccount } from "../lib/api.js";
import { useUser } from "./UserContext.jsx";

const ThemeContext = createContext({ darkMode: false, toggleDarkMode: () => {} });

export function ThemeProvider({ children }) {
  const { user } = useUser();
  // Dark by default: logged-out users and new accounts render dark. A user who
  // has explicitly chosen light (darkMode === false) keeps that preference.
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => setDarkMode(user?.darkMode ?? true), [user?.darkMode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    document.querySelectorAll('meta[name="theme-color"]').forEach((tag) => {
      tag.setAttribute("content", darkMode ? "#0a0a0a" : "#ffffff");
    });
  }, [darkMode]);

  async function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    try {
      await updateAccount({ darkMode: next });
    } catch {
      setDarkMode(!next);
    }
  }

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>{children}</ThemeContext.Provider>
  );
}

export function useDarkMode() {
  return useContext(ThemeContext);
}
