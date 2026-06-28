import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useProgressWeekly, useProgressRange } from "../hooks/useProgress.js";
import { useDarkMode } from "../context/ThemeContext.jsx";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// ── Date helpers ──────────────────────────────────────────────────────────────

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Get the Monday of the week containing `date` (YYYY-MM-DD string)
function getMondayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthStart(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function dayNum(dateStr) {
  return parseInt(dateStr.split("-")[2], 10);
}

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Sun
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasData(s) {
  return (s.consumed?.calories || 0) > 0 || (s.water || 0) > 0;
}

function pct(actual, goal) {
  if (!goal || goal <= 0) return null;
  return Math.round((actual / goal) * 100);
}

function GoalBar({ value, goal, color = "bg-primary" }) {
  if (!goal || goal <= 0) return null;
  const width = Math.min(100, (value / goal) * 100);
  return (
    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
      <div
        className={cn(color, "h-1.5 rounded-full transition-all")}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Progress() {
  const today = getTodayString();
  const { darkMode } = useDarkMode();
  const todayDate = new Date(today.replace(/-/g, "/"));

  // View mode
  const [viewMode, setViewMode] = useState("weekly"); // 'weekly' | 'monthly'

  // Week navigation (offset in weeks from current)
  const [weekOffset, setWeekOffset] = useState(0);

  // Month navigation
  const [monthYear, setMonthYear] = useState(todayDate.getFullYear());
  const [monthMonth, setMonthMonth] = useState(todayDate.getMonth() + 1);

  // Computed date range
  const weekStart = addDays(getMondayOf(today), weekOffset * 7);
  const weekEnd = addDays(weekStart, 6);

  const monthStart = getMonthStart(monthYear, monthMonth);
  const numDays = getDaysInMonth(monthYear, monthMonth);

  // Only the active view fetches. Both queries retain their cached data when
  // disabled, so toggling viewMode back is instant.
  const weeklyQuery = useProgressWeekly(weekStart, { enabled: viewMode === "weekly" });
  const monthlyQuery = useProgressRange(monthStart, numDays, { enabled: viewMode === "monthly" });
  const activeQuery = viewMode === "weekly" ? weeklyQuery : monthlyQuery;

  const summaries = Array.isArray(activeQuery.data) ? activeQuery.data : [];
  const loading = activeQuery.isLoading;
  const error = (activeQuery.error && activeQuery.error.message) || "";

  // ── Averages (exclude days with no data) ──
  const activeDays = summaries.filter(hasData);
  const n = activeDays.length || 1;

  const avgCalIn = Math.round(activeDays.reduce((s, d) => s + (d.consumed?.calories || 0), 0) / n);
  const avgCalBurned = Math.round(activeDays.reduce((s, d) => s + (d.burned?.active || 0), 0) / n);
  const avgProtein = Math.round(activeDays.reduce((s, d) => s + (d.consumed?.protein || 0), 0) / n);
  const avgWater = Math.round(activeDays.reduce((s, d) => s + (d.water || 0), 0) / n);

  // Goals from first non-null entry
  const goals = summaries.find((s) => s.goals)?.goals || {};

  // ── Chart data (weekly) ──
  const chartData = summaries.map((s) => ({
    day: new Date(s.date.replace(/-/g, "/")).toLocaleDateString("en-US", { weekday: "short" }),
    calories: Math.round(s.consumed?.calories || 0),
    protein: Math.round(s.consumed?.protein || 0),
    water: Math.round(s.water || 0),
  }));

  // ── Month calendar helpers ──
  const firstDow = dayOfWeek(monthStart); // 0=Sun
  const calendarOffset = firstDow === 0 ? 6 : firstDow - 1; // offset to Monday-first grid

  // Selected day detail
  const [selectedDay, setSelectedDay] = useState(null); // date string

  function handleSelectDay(s) {
    setSelectedDay((prev) => (prev === s.date ? null : s.date));
  }

  const selectedDaySummary = selectedDay ? summaries.find((s) => s.date === selectedDay) : null;

  // ── Navigation ──
  function prevWeek() {
    setWeekOffset((w) => w - 1);
  }
  function nextWeek() {
    if (weekOffset < 0) setWeekOffset((w) => w + 1);
  }
  function prevMonth() {
    setSelectedDay(null);
    if (monthMonth === 1) {
      setMonthMonth(12);
      setMonthYear((y) => y - 1);
    } else setMonthMonth((m) => m - 1);
  }
  function nextMonth() {
    const now = new Date();
    if (
      monthYear > now.getFullYear() ||
      (monthYear === now.getFullYear() && monthMonth >= now.getMonth() + 1)
    )
      return;
    setSelectedDay(null);
    if (monthMonth === 12) {
      setMonthMonth(1);
      setMonthYear((y) => y + 1);
    } else setMonthMonth((m) => m + 1);
  }

  if (error) {
    return (
      <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
        <AlertDescription className="text-destructive">{error}</AlertDescription>
      </Alert>
    );
  }

  // Recharts tooltip styled from the active theme (Recharts needs concrete values).
  const tooltipStyle = {
    borderRadius: "8px",
    border: `1px solid ${darkMode ? "#374151" : "#e5e7eb"}`,
    fontSize: "12px",
    backgroundColor: darkMode ? "#1f2937" : "#ffffff",
    color: darkMode ? "#f9fafb" : "#111827",
  };
  const axisTick = { fontSize: 11, fill: darkMode ? "#6b7280" : "#9ca3af" };
  const gridStroke = darkMode ? "#374151" : "#f3f4f6";

  return (
    <div className="space-y-6">
      {/* ── Header + view toggle ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Progress</h1>
        <Tabs value={viewMode} onValueChange={setViewMode}>
          <TabsList>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Period navigation ── */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={viewMode === "weekly" ? prevWeek : prevMonth}
        >
          <ChevronLeft />
          Prev
        </Button>
        <span className="text-sm font-semibold">
          {viewMode === "weekly"
            ? `${shortDate(weekStart)} – ${shortDate(weekEnd)}`
            : monthLabel(monthYear, monthMonth)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={viewMode === "weekly" ? nextWeek : nextMonth}
          disabled={
            viewMode === "weekly"
              ? weekOffset >= 0
              : monthYear === todayDate.getFullYear() && monthMonth === todayDate.getMonth() + 1
          }
        >
          Next
          <ChevronRight />
        </Button>
      </div>

      {/* ── Averages ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Avg Cal In",
            value: avgCalIn,
            unit: "kcal",
            color: "text-indigo-500",
            note: goals.calorieMin ? `Goal ${goals.calorieMin}–${goals.calorieMax}` : null,
          },
          {
            label: "Avg Cal Burned",
            value: avgCalBurned,
            unit: "kcal",
            color: "text-orange-500",
            note: "Active calories",
          },
          {
            label: "Avg Protein",
            value: avgProtein,
            unit: "g",
            color: "text-violet-500",
            note: goals.proteinMin ? `Goal ${goals.proteinMin}–${goals.proteinMax}g` : null,
          },
          {
            label: "Avg Water",
            value: avgWater,
            unit: "oz",
            color: "text-sky-500",
            note: goals.waterGoal ? `Goal ${goals.waterGoal} oz` : null,
          },
        ].map(({ label, value, unit, color, note }) => (
          <Card key={label}>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {label}
              </p>
              <p className={cn("text-2xl font-bold", color)}>
                {loading ? "…" : value}
                <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
              </p>
              {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
              {!activeDays.length && !loading && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">No data</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : viewMode === "weekly" ? (
        /* ══════════════ WEEKLY VIEW ══════════════ */
        <div className="space-y-4">
          {/* Calorie bar chart */}
          <Card>
            <CardContent>
              <p className="text-sm font-semibold mb-4">Calorie Intake</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    domain={[0, (dataMax) => Math.max(dataMax, goals.calorieMax || 0) * 1.05]}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: darkMode ? "#ffffff10" : "#00000008" }}
                    formatter={(v) => [`${v} kcal`, "Calories"]}
                  />
                  <Bar dataKey="calories" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  {goals.calorieMin > 0 && (
                    <ReferenceLine
                      y={goals.calorieMin}
                      stroke="#22c55e"
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                    />
                  )}
                  {goals.calorieMax > 0 && (
                    <ReferenceLine
                      y={goals.calorieMax}
                      stroke="#ef4444"
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-xs bg-indigo-500 inline-block" />
                  Actual
                </span>
                {goals.calorieMin > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-3 rounded-xs bg-green-500 inline-block" />
                    Min
                  </span>
                )}
                {goals.calorieMax > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-3 rounded-xs bg-red-500 inline-block" />
                    Max
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Protein bar chart */}
          <Card>
            <CardContent>
              <p className="text-sm font-semibold mb-4">Protein Intake</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    domain={[0, (dataMax) => Math.max(dataMax, goals.proteinMax || 0) * 1.05]}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: darkMode ? "#ffffff10" : "#00000008" }}
                    formatter={(v) => [`${v}g`, "Protein"]}
                  />
                  <Bar dataKey="protein" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  {goals.proteinMin > 0 && (
                    <ReferenceLine
                      y={goals.proteinMin}
                      stroke="#22c55e"
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                    />
                  )}
                  {goals.proteinMax > 0 && (
                    <ReferenceLine
                      y={goals.proteinMax}
                      stroke="#ef4444"
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-xs bg-violet-500 inline-block" />
                  Actual
                </span>
                {goals.proteinMin > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-3 rounded-xs bg-green-500 inline-block" />
                    Min
                  </span>
                )}
                {goals.proteinMax > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-3 rounded-xs bg-red-500 inline-block" />
                    Max
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Day-by-day detail cards */}
          <div className="space-y-3">
            {summaries.map((s) => {
              const active = hasData(s);
              const cal = Math.round(s.consumed?.calories || 0);
              const pro = Math.round(s.consumed?.protein || 0);
              const carbs = Math.round(s.consumed?.carbs || 0);
              const fat = Math.round(s.consumed?.fat || 0);
              const wat = Math.round(s.water || 0);
              return (
                <Card key={s.date} className="py-0 overflow-hidden">
                  <div
                    className={cn(
                      "flex items-center justify-between px-4 py-3",
                      !active && "bg-muted/50"
                    )}
                  >
                    <p
                      className={cn(
                        "text-sm font-bold",
                        active ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {dayLabel(s.date)}
                    </p>
                    <div className="flex items-center gap-2">
                      {s.workoutLogged && (
                        <span className="text-xs bg-green-500/15 text-green-500 font-semibold rounded-full px-2 py-0.5">
                          💪 Workout
                        </span>
                      )}
                      {!active && <span className="text-xs text-muted-foreground/60">No data</span>}
                    </div>
                  </div>
                  {active && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-border border-t border-border">
                      {[
                        {
                          label: "Calories",
                          value: cal,
                          unit: "kcal",
                          color: "text-indigo-500",
                          bar: "bg-indigo-400",
                          goal: goals.calorieMax,
                          min: goals.calorieMin,
                          max: goals.calorieMax,
                        },
                        {
                          label: "Protein",
                          value: pro,
                          unit: "g",
                          color: "text-violet-500",
                          bar: "bg-violet-400",
                          goal: goals.proteinMax,
                          min: goals.proteinMin,
                          max: goals.proteinMax,
                        },
                        {
                          label: "Carbs",
                          value: carbs,
                          unit: "g",
                          color: "text-amber-500",
                          bar: "bg-amber-400",
                          goal: goals.carbsGoal,
                        },
                        {
                          label: "Fat",
                          value: fat,
                          unit: "g",
                          color: "text-orange-500",
                          bar: "bg-orange-400",
                          goal: goals.fatGoal,
                        },
                        {
                          label: "Water",
                          value: wat,
                          unit: "oz",
                          color: "text-sky-500",
                          bar: "bg-sky-400",
                          goal: goals.waterGoal,
                        },
                      ].map(({ label, value, unit, color, bar, goal, min, max }) => (
                        <div key={label} className="bg-card px-3 py-3">
                          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                          <p className={cn("text-base font-bold", color)}>
                            {value}
                            <span className="text-xs font-normal text-muted-foreground ml-0.5">
                              {unit}
                            </span>
                          </p>
                          {goal || max ? (
                            <>
                              <GoalBar value={value} goal={goal || max} color={bar} />
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {max ? `${pct(value, max)}%` : `${pct(value, goal)}%`}
                                {min ? ` · min ${min}` : goal ? ` of ${goal}` : ""}
                              </p>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        /* ══════════════ MONTHLY VIEW ══════════════ */
        <div className="space-y-4">
          {/* Calorie bar chart for month */}
          <Card>
            <CardContent>
              <p className="text-sm font-semibold mb-4">
                Daily Calories — {monthLabel(monthYear, monthMonth)}
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={summaries.map((s) => ({
                    day: dayNum(s.date),
                    calories: Math.round(s.consumed?.calories || 0),
                  }))}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis
                    dataKey="day"
                    tick={{ ...axisTick, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ ...axisTick, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    domain={[0, (dataMax) => Math.max(dataMax, goals.calorieMax || 0) * 1.05]}
                  />
                  <Tooltip
                    contentStyle={{ ...tooltipStyle, fontSize: "11px" }}
                    cursor={{ fill: darkMode ? "#ffffff10" : "#00000008" }}
                    formatter={(v) => [`${v} kcal`, "Cal"]}
                  />
                  <Bar dataKey="calories" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  {goals.calorieMax > 0 && (
                    <ReferenceLine
                      y={goals.calorieMax}
                      stroke="#ef4444"
                      strokeDasharray="4 2"
                      strokeWidth={1}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Calendar grid */}
          <Card>
            <CardContent>
              <p className="text-sm font-semibold mb-4">Monthly Overview</p>

              {/* Day-of-week headers (Mon-Sun) */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-semibold text-muted-foreground py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar cells */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: calendarOffset }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {summaries.map((s) => {
                  const active = hasData(s);
                  const isToday = s.date === today;
                  const isSelected = s.date === selectedDay;
                  const cal = s.consumed?.calories || 0;
                  const wat = s.water || 0;
                  const workout = s.workoutLogged;

                  // Color logic — semantic goal-status heatmap.
                  let bgColor = "bg-muted text-muted-foreground";
                  if (active) {
                    const calOk =
                      (goals.calorieMin == null || cal >= goals.calorieMin) &&
                      (goals.calorieMax == null || cal <= goals.calorieMax) &&
                      (goals.calorieMin != null || goals.calorieMax != null || cal > 0);
                    const watOk = goals.waterGoal ? wat >= goals.waterGoal : true;
                    if (calOk && watOk) bgColor = "bg-green-500/15 text-green-500";
                    else if (calOk || watOk) bgColor = "bg-amber-500/15 text-amber-500";
                    else bgColor = "bg-red-500/15 text-red-500";
                  }

                  return (
                    <button
                      key={s.date}
                      type="button"
                      onClick={() => handleSelectDay(s)}
                      className={cn(
                        bgColor,
                        "rounded-lg p-1.5 aspect-square flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all",
                        isToday && "ring-2 ring-primary/50",
                        isSelected ? "ring-2 ring-primary scale-105 shadow-md" : "hover:opacity-80"
                      )}
                    >
                      <span className="text-xs font-bold leading-none">{dayNum(s.date)}</span>
                      {workout && <span className="text-xs leading-none">💪</span>}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-sm bg-green-500/15 inline-block" />
                  Goals met
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-sm bg-amber-500/15 inline-block" />
                  Partial
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-sm bg-red-500/15 inline-block" />
                  Missed
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-3 rounded-sm bg-muted inline-block" />
                  No data
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  💪 Workout logged
                </span>
              </div>

              {/* Selected day detail */}
              {selectedDaySummary && (
                <div className="mt-5 border-t border-border pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold">{dayLabel(selectedDaySummary.date)}</p>
                    <div className="flex items-center gap-2">
                      {selectedDaySummary.workoutLogged && (
                        <span className="text-xs bg-green-500/15 text-green-500 font-semibold rounded-full px-2 py-0.5">
                          💪 Workout
                        </span>
                      )}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setSelectedDay(null)}
                        aria-label="Close"
                      >
                        <X />
                      </Button>
                    </div>
                  </div>
                  {hasData(selectedDaySummary) ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-border rounded-xl overflow-hidden border border-border">
                      {[
                        {
                          label: "Calories",
                          value: Math.round(selectedDaySummary.consumed?.calories || 0),
                          unit: "kcal",
                          color: "text-indigo-500",
                          bar: "bg-indigo-400",
                          goal: goals.calorieMax,
                          min: goals.calorieMin,
                          max: goals.calorieMax,
                        },
                        {
                          label: "Protein",
                          value: Math.round(selectedDaySummary.consumed?.protein || 0),
                          unit: "g",
                          color: "text-violet-500",
                          bar: "bg-violet-400",
                          goal: goals.proteinMax,
                          min: goals.proteinMin,
                          max: goals.proteinMax,
                        },
                        {
                          label: "Carbs",
                          value: Math.round(selectedDaySummary.consumed?.carbs || 0),
                          unit: "g",
                          color: "text-amber-500",
                          bar: "bg-amber-400",
                          goal: goals.carbsGoal,
                        },
                        {
                          label: "Fat",
                          value: Math.round(selectedDaySummary.consumed?.fat || 0),
                          unit: "g",
                          color: "text-orange-500",
                          bar: "bg-orange-400",
                          goal: goals.fatGoal,
                        },
                        {
                          label: "Water",
                          value: Math.round(selectedDaySummary.water || 0),
                          unit: "oz",
                          color: "text-sky-500",
                          bar: "bg-sky-400",
                          goal: goals.waterGoal,
                        },
                      ].map(({ label, value, unit, color, bar, goal, min, max }) => (
                        <div key={label} className="bg-card px-3 py-3">
                          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                          <p className={cn("text-base font-bold", color)}>
                            {value}
                            <span className="text-xs font-normal text-muted-foreground ml-0.5">
                              {unit}
                            </span>
                          </p>
                          {(goal || max) && (
                            <>
                              <GoalBar value={value} goal={goal || max} color={bar} />
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {max ? `${pct(value, max)}%` : `${pct(value, goal)}%`}
                                {min ? ` · min ${min}` : goal ? ` of ${goal}` : ""}
                              </p>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No data logged for this day.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
