import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckIcon, XIcon } from "lucide-react";
import { useProgressSummary } from "../hooks/useProgress.js";
import { useWaterToday, useLogWater } from "../hooks/useWater.js";
import { useGoals } from "../hooks/useGoals.js";
import { useUpdateActiveCalories } from "../hooks/useHealth.js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn, ymd } from "@/lib/utils";

// [value text, bar fill] for over / under / within the goal range
const GOAL_STATUS_CLASSES = {
  over: ["text-red-500", "bg-red-500"],
  under: ["text-yellow-500", "bg-yellow-400"],
  ok: ["text-green-500", "bg-green-500"],
};

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function MetricBar({ value, max, fillClass, className }) {
  if (!(max > 0)) return null;
  return (
    <div className={cn("w-full bg-muted rounded-full h-1.5", className)}>
      <div
        className={cn("h-1.5 rounded-full transition-all", fillClass)}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}

function GoalCard({ title, value, min, max, unit, suffix }) {
  const [textClass, barClass] =
    GOAL_STATUS_CLASSES[value > max ? "over" : value < min ? "under" : "ok"];
  return (
    <Card>
      <CardContent>
        <SectionLabel>{title}</SectionLabel>
        <p className={cn("text-3xl font-bold mt-1", textClass)}>
          {Math.round(value)}
          {suffix && (
            <span className="text-base font-normal text-muted-foreground ml-1">{suffix}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Goal: {min}–{max} {unit}
        </p>
        <MetricBar value={value} max={max} fillClass={barClass} className="mt-2" />
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const today = ymd();

  const summaryQuery = useProgressSummary(today);
  const waterQuery = useWaterToday();
  const goalsQuery = useGoals();
  const logWaterMutation = useLogWater();
  const updateActiveCal = useUpdateActiveCalories();

  const [activeCalEditing, setActiveCalEditing] = useState(false);
  const [activeCalInput, setActiveCalInput] = useState("");
  const [activeCalClientError, setActiveCalClientError] = useState("");

  if (summaryQuery.isPending || waterQuery.isPending || goalsQuery.isPending) {
    return (
      <div className="space-y-6">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const error =
    summaryQuery.error?.message || waterQuery.error?.message || goalsQuery.error?.message;
  if (error) {
    return (
      <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
        <AlertDescription className="text-destructive">{error}</AlertDescription>
      </Alert>
    );
  }

  // All three queries have data here; the API always returns these fields.
  const { consumed, burned, net, deficit, workoutLogged } = summaryQuery.data;
  const waterTotal = waterQuery.data.total;
  const goals = goalsQuery.data;
  const activeCalError = activeCalClientError || updateActiveCal.error?.message;

  function handleSaveActiveCal() {
    const n = Number(activeCalInput);
    if (!Number.isFinite(n) || n < 0) {
      setActiveCalClientError("Enter a valid number.");
      return;
    }
    setActiveCalClientError("");
    updateActiveCal.mutate(
      { date: today, calories: n },
      { onSuccess: () => setActiveCalEditing(false) }
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>

      {/* 3 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GoalCard
          title="Calories"
          value={consumed.calories}
          min={goals.calorieMin}
          max={goals.calorieMax}
          unit="kcal"
        />
        <GoalCard
          title="Protein"
          value={consumed.protein}
          min={goals.proteinMin}
          max={goals.proteinMax}
          unit="g"
          suffix="g"
        />

        {/* Active Burned */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <SectionLabel>Active Burned</SectionLabel>
              {!activeCalEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveCalInput(burned.active > 0 ? String(Math.round(burned.active)) : "");
                    setActiveCalEditing(true);
                    setActiveCalClientError("");
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {burned.active > 0 ? "Edit" : "Log"}
                </button>
              )}
            </div>
            {activeCalEditing ? (
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={activeCalInput}
                    onChange={(e) => {
                      setActiveCalInput(e.target.value);
                      setActiveCalClientError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveActiveCal()}
                    placeholder="kcal"
                    className="w-24"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveActiveCal}
                    disabled={updateActiveCal.isPending}
                  >
                    {updateActiveCal.isPending ? "…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      setActiveCalEditing(false);
                      setActiveCalClientError("");
                    }}
                    aria-label="Cancel"
                  >
                    <XIcon />
                  </Button>
                </div>
                {activeCalError && <p className="text-xs text-destructive">{activeCalError}</p>}
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-primary mt-1">
                  {burned.active > 0 ? Math.round(burned.active) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {burned.active > 0 ? "kcal active burned today" : "Tap Log to add manually"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calorie Balance Card */}
      <Card>
        <CardContent className="space-y-4">
          <SectionLabel>Calorie Balance</SectionLabel>
          <div className="grid grid-cols-3 gap-3 sm:gap-6 text-center">
            {[
              [Math.round(net), "Net calories"],
              [Math.abs(Math.round(deficit)), deficit >= 0 ? "Deficit" : "Surplus", "text-primary"],
              [Math.round(burned.total), "Total burned"],
            ].map(([value, label, colorClass]) => (
              <div key={label}>
                <p className={cn("text-2xl sm:text-3xl font-bold", colorClass)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Workout Card */}
      <Card>
        <CardContent className="flex items-center gap-4">
          <div
            className={cn(
              "shrink-0 size-12 rounded-full flex items-center justify-center",
              workoutLogged ? "bg-green-500/15 text-green-500" : "bg-muted text-muted-foreground"
            )}
          >
            {workoutLogged ? <CheckIcon className="size-6" /> : <XIcon className="size-6" />}
          </div>
          <div>
            <h2 className="text-sm font-semibold">
              {workoutLogged ? "Workout logged today" : "No workout logged yet"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {workoutLogged
                ? "Great work keeping up with your training."
                : "Head to Workouts to log a session."}
            </p>
          </div>
          {!workoutLogged && (
            <Button
              variant="link"
              size="sm"
              onClick={() => navigate("/workouts")}
              className="ml-auto"
            >
              Log workout
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Water Card */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Water Intake</SectionLabel>
            <button
              onClick={() => navigate("/water")}
              className="text-xs font-semibold text-sky-500 hover:underline"
            >
              View all →
            </button>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold text-sky-500">{Math.round(waterTotal)}</span>
            <span className="text-base text-sky-500/80 font-medium pb-1">
              oz &nbsp;·&nbsp; {(waterTotal / 8).toFixed(1)} cups
            </span>
            {goals.waterGoal > 0 && (
              <span className="text-xs text-muted-foreground pb-1 ml-auto">
                Goal: {goals.waterGoal} oz
              </span>
            )}
          </div>
          <MetricBar value={waterTotal} max={goals.waterGoal} fillClass="bg-sky-500" />
          <div className="grid grid-cols-4 gap-2">
            {[8, 12, 16, 32].map((oz) => (
              <button
                key={oz}
                type="button"
                onClick={() => logWaterMutation.mutate({ date: today, amount: oz })}
                disabled={logWaterMutation.isPending}
                className="flex flex-col items-center justify-center bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-xl py-3 transition-colors disabled:opacity-50"
              >
                <span className="text-base font-bold text-sky-500">{oz}</span>
                <span className="text-xs text-sky-500/80 font-medium">oz</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick-add Row */}
      <div>
        <SectionLabel>Quick Add</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {["breakfast", "lunch", "dinner", "snack"].map((meal) => (
            <Button
              key={meal}
              variant="outline"
              onClick={() => navigate("/meals", { state: { openFor: meal } })}
              className="h-auto py-4 capitalize hover:border-primary hover:text-primary"
            >
              + {meal}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
