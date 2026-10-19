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
import { cn, ymd } from "@/lib/utils";

// YYYY-MM-DD → local midnight (new Date("YYYY-MM-DD") would be UTC).
const parseDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (date, opts) => date.toLocaleDateString("en-US", opts);
const dayLabel = (s) => fmt(parseDay(s), { weekday: "short", month: "short", day: "numeric" });
const dayNum = (s) => Number(s.slice(8));

const hasData = (s) => s.consumed.calories > 0 || s.water > 0;

const CHART_MARGIN = { top: 4, right: 4, left: 0, bottom: 0 };

const WORKOUT_BADGE = (
  <span className="text-xs bg-green-500/15 text-green-500 font-semibold rounded-full px-2 py-0.5">
    💪 Workout
  </span>
);

function LegendItem({ swatch, children }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-3 inline-block", swatch)} />
      {children}
    </span>
  );
}

// Per-day macro grid. Calories/protein show progress toward their max plus the min;
// the rest show progress "of" their goal. Goals are validated non-negative server-side.
function DayMetrics({ day, goals, className }) {
  const metrics = [
    {
      label: "Calories",
      value: day.consumed.calories,
      unit: "kcal",
      color: "text-indigo-500",
      bar: "bg-indigo-400",
      goal: goals.calorieMax,
      min: goals.calorieMin,
    },
    {
      label: "Protein",
      value: day.consumed.protein,
      unit: "g",
      color: "text-violet-500",
      bar: "bg-violet-400",
      goal: goals.proteinMax,
      min: goals.proteinMin,
    },
    {
      label: "Carbs",
      value: day.consumed.carbs,
      unit: "g",
      color: "text-amber-500",
      bar: "bg-amber-400",
      goal: goals.carbsGoal,
    },
    {
      label: "Fat",
      value: day.consumed.fat,
      unit: "g",
      color: "text-orange-500",
      bar: "bg-orange-400",
      goal: goals.fatGoal,
    },
    {
      label: "Water",
      value: day.water,
      unit: "oz",
      color: "text-sky-500",
      bar: "bg-sky-400",
      goal: goals.waterGoal,
    },
  ];
  return (
    <div className={cn("grid grid-cols-3 sm:grid-cols-5 gap-px bg-border", className)}>
      {metrics.map(({ label, value: raw, unit, color, bar, goal, min }) => {
        const value = Math.round(raw);
        return (
          <div key={label} className="bg-card px-3 py-3">
            <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
            <p className={cn("text-base font-bold", color)}>
              {value}
              <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>
            </p>
            {goal ? (
              <>
                <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                  <div
                    className={cn(bar, "h-1.5 rounded-full transition-all")}
                    style={{ width: `${Math.min(100, (value / goal) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {`${Math.round((value / goal) * 100)}%`}
                  {min ? ` · min ${min}` : ` of ${goal}`}
                </p>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function Progress() {
  const { darkMode } = useDarkMode();
  const [viewMode, setViewMode] = useState("weekly"); // 'weekly' | 'monthly'
  const [weekOffset, setWeekOffset] = useState(0); // weeks back from the current week
  const [monthOffset, setMonthOffset] = useState(0); // months back from the current month
  const [selectedDay, setSelectedDay] = useState(null); // YYYY-MM-DD
  const isWeekly = viewMode === "weekly";

  const now = new Date();
  const today = ymd(now);
  // Monday-first weeks: step back to Monday, then by whole weeks.
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7
  );
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const month = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const numDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthName = fmt(month, { month: "long", year: "numeric" });
  const calendarOffset = (month.getDay() + 6) % 7; // blank cells before the 1st in a Mon-first grid

  // Only the active view fetches. Both queries retain their cached data when
  // disabled, so toggling viewMode back is instant.
  const weeklyQuery = useProgressWeekly(ymd(weekStart), { enabled: isWeekly });
  const monthlyQuery = useProgressRange(ymd(month), numDays, { enabled: !isWeekly });
  const activeQuery = isWeekly ? weeklyQuery : monthlyQuery;

  const summaries = activeQuery.data ?? [];
  const loading = activeQuery.isLoading;
  const error = activeQuery.error?.message;

  // Averages exclude days with no data.
  const activeDays = summaries.filter(hasData);
  const avg = (pick) =>
    Math.round(activeDays.reduce((sum, d) => sum + pick(d), 0) / (activeDays.length || 1));

  // Every day in a response carries the same goals (or null for a new user).
  const goals = summaries[0]?.goals || {};

  const chartData = summaries.map((s) => ({
    day: isWeekly ? fmt(parseDay(s.date), { weekday: "short" }) : dayNum(s.date),
    calories: Math.round(s.consumed.calories),
    protein: Math.round(s.consumed.protein),
  }));

  const selectedDaySummary = selectedDay && summaries.find((s) => s.date === selectedDay);

  function step(delta) {
    if (isWeekly) {
      setWeekOffset((w) => w + delta);
    } else {
      setSelectedDay(null);
      setMonthOffset((m) => m + delta);
    }
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
  const tooltipCursor = { fill: darkMode ? "#ffffff10" : "#00000008" };
  const axisTick = { fontSize: 11, fill: darkMode ? "#6b7280" : "#9ca3af" };
  const gridStroke = darkMode ? "#374151" : "#f3f4f6";

  const weeklyCharts = [
    {
      title: "Calorie Intake",
      dataKey: "calories",
      fill: "#6366f1",
      swatch: "bg-indigo-500",
      min: goals.calorieMin,
      max: goals.calorieMax,
      formatter: (v) => [`${v} kcal`, "Calories"],
    },
    {
      title: "Protein Intake",
      dataKey: "protein",
      fill: "#8b5cf6",
      swatch: "bg-violet-500",
      min: goals.proteinMin,
      max: goals.proteinMax,
      formatter: (v) => [`${v}g`, "Protein"],
    },
  ];

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
        <Button type="button" variant="outline" size="sm" onClick={() => step(-1)}>
          <ChevronLeft />
          Prev
        </Button>
        <span className="text-sm font-semibold">
          {isWeekly
            ? `${fmt(weekStart, { month: "short", day: "numeric" })} – ${fmt(weekEnd, { month: "short", day: "numeric" })}`
            : monthName}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => step(1)}
          disabled={(isWeekly ? weekOffset : monthOffset) >= 0}
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
            value: avg((d) => d.consumed.calories),
            unit: "kcal",
            color: "text-indigo-500",
            note: goals.calorieMin ? `Goal ${goals.calorieMin}–${goals.calorieMax}` : null,
          },
          {
            label: "Avg Cal Burned",
            value: avg((d) => d.burned.active),
            unit: "kcal",
            color: "text-orange-500",
            note: "Active calories",
          },
          {
            label: "Avg Protein",
            value: avg((d) => d.consumed.protein),
            unit: "g",
            color: "text-violet-500",
            note: goals.proteinMin ? `Goal ${goals.proteinMin}–${goals.proteinMax}g` : null,
          },
          {
            label: "Avg Water",
            value: avg((d) => d.water),
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
      ) : isWeekly ? (
        /* ══════════════ WEEKLY VIEW ══════════════ */
        <div className="space-y-4">
          {weeklyCharts.map(({ title, dataKey, fill, swatch, min, max, formatter }) => (
            <Card key={dataKey}>
              <CardContent>
                <p className="text-sm font-semibold mb-4">{title}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      domain={[0, (dataMax) => Math.max(dataMax, max || 0) * 1.05]}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={tooltipCursor}
                      formatter={formatter}
                    />
                    <Bar dataKey={dataKey} fill={fill} radius={[4, 4, 0, 0]} />
                    {min > 0 && (
                      <ReferenceLine
                        y={min}
                        stroke="#22c55e"
                        strokeDasharray="5 3"
                        strokeWidth={1.5}
                      />
                    )}
                    {max > 0 && (
                      <ReferenceLine
                        y={max}
                        stroke="#ef4444"
                        strokeDasharray="5 3"
                        strokeWidth={1.5}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 justify-center">
                  <LegendItem swatch={cn("rounded-xs", swatch)}>Actual</LegendItem>
                  {min > 0 && <LegendItem swatch="rounded-xs bg-green-500">Min</LegendItem>}
                  {max > 0 && <LegendItem swatch="rounded-xs bg-red-500">Max</LegendItem>}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Day-by-day detail cards */}
          <div className="space-y-3">
            {summaries.map((s) => {
              const active = hasData(s);
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
                      {s.workoutLogged && WORKOUT_BADGE}
                      {!active && <span className="text-xs text-muted-foreground/60">No data</span>}
                    </div>
                  </div>
                  {active && (
                    <DayMetrics day={s} goals={goals} className="border-t border-border" />
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        /* ══════════════ MONTHLY VIEW ══════════════ */
        <div className="space-y-4">
          <Card>
            <CardContent>
              <p className="text-sm font-semibold mb-4">Daily Calories — {monthName}</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={CHART_MARGIN}>
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
                    cursor={tooltipCursor}
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

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: calendarOffset }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {summaries.map((s) => {
                  const cal = s.consumed.calories;
                  const isSelected = s.date === selectedDay;

                  // Semantic goal-status heatmap.
                  let bgColor = "bg-muted text-muted-foreground";
                  if (hasData(s)) {
                    const calOk =
                      (goals.calorieMin == null || cal >= goals.calorieMin) &&
                      (goals.calorieMax == null || cal <= goals.calorieMax) &&
                      (goals.calorieMin != null || goals.calorieMax != null || cal > 0);
                    const watOk = goals.waterGoal ? s.water >= goals.waterGoal : true;
                    if (calOk && watOk) bgColor = "bg-green-500/15 text-green-500";
                    else if (calOk || watOk) bgColor = "bg-amber-500/15 text-amber-500";
                    else bgColor = "bg-red-500/15 text-red-500";
                  }

                  return (
                    <button
                      key={s.date}
                      type="button"
                      onClick={() => setSelectedDay((prev) => (prev === s.date ? null : s.date))}
                      className={cn(
                        bgColor,
                        "rounded-lg p-1.5 aspect-square flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all",
                        s.date === today && "ring-2 ring-primary/50",
                        isSelected ? "ring-2 ring-primary scale-105 shadow-md" : "hover:opacity-80"
                      )}
                    >
                      <span className="text-xs font-bold leading-none">{dayNum(s.date)}</span>
                      {s.workoutLogged && <span className="text-xs leading-none">💪</span>}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                <LegendItem swatch="rounded-sm bg-green-500/15">Goals met</LegendItem>
                <LegendItem swatch="rounded-sm bg-amber-500/15">Partial</LegendItem>
                <LegendItem swatch="rounded-sm bg-red-500/15">Missed</LegendItem>
                <LegendItem swatch="rounded-sm bg-muted">No data</LegendItem>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  💪 Workout logged
                </span>
              </div>

              {selectedDaySummary && (
                <div className="mt-5 border-t border-border pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold">{dayLabel(selectedDaySummary.date)}</p>
                    <div className="flex items-center gap-2">
                      {selectedDaySummary.workoutLogged && WORKOUT_BADGE}
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
                    <DayMetrics
                      day={selectedDaySummary}
                      goals={goals}
                      className="rounded-xl overflow-hidden border border-border"
                    />
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
