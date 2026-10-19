import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { changePassword, logout } from "../lib/api.js";
import { useAccount } from "../hooks/useAccount.js";
import { useGoals, useUpdateGoals } from "../hooks/useGoals.js";
import { useDarkMode } from "../context/ThemeContext.jsx";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

const GOAL_FIELDS = [
  { key: "calorieMin", label: "Calorie Min", unit: "kcal" },
  { key: "calorieMax", label: "Calorie Max", unit: "kcal" },
  { key: "proteinMin", label: "Protein Min", unit: "g" },
  { key: "proteinMax", label: "Protein Max", unit: "g" },
  { key: "waterGoal", label: "Water Goal", unit: "oz" },
];

const PASSWORD_FIELDS = [
  { key: "current", label: "Current Password", autoComplete: "current-password" },
  { key: "next", label: "New Password", autoComplete: "new-password" },
  { key: "confirm", label: "Confirm New Password", autoComplete: "new-password" },
];
const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

export default function Account() {
  const { darkMode, toggleDarkMode } = useDarkMode();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const accountQuery = useAccount();
  const goalsQuery = useGoals();
  const updateGoalsMutation = useUpdateGoals();

  const profile = accountQuery.data;
  const goals = goalsQuery.data;

  // Edit buffer, seeded from the cached goals each time editing starts.
  const [goalsEditing, setGoalsEditing] = useState(false);
  const [goalsForm, setGoalsForm] = useState({});

  // Password: direct call (one-shot, not cached).
  const [pwd, setPwd] = useState(EMPTY_PASSWORDS);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");

  const goalsSaving = updateGoalsMutation.isPending;
  const goalsError = updateGoalsMutation.error?.message;

  function startGoalsEdit() {
    setGoalsForm(Object.fromEntries(GOAL_FIELDS.map(({ key }) => [key, goals?.[key] ?? ""])));
    setGoalsEditing(true);
  }

  function handleSaveGoals() {
    const payload = {};
    for (const [key, val] of Object.entries(goalsForm)) {
      const n = Number(val);
      if (val !== "" && Number.isFinite(n)) payload[key] = n;
    }
    updateGoalsMutation.mutate(payload, {
      onSuccess: () => {
        setGoalsEditing(false);
        toast.success("Goals saved");
      },
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setPwdError("");

    if (pwd.next !== pwd.confirm) {
      setPwdError("New passwords do not match.");
      return;
    }
    if (pwd.next.length < 6) {
      setPwdError("New password must be at least 6 characters.");
      return;
    }

    setPwdSaving(true);
    try {
      await changePassword(pwd.current, pwd.next);
      toast.success("Password updated successfully");
      setPwd(EMPTY_PASSWORDS);
    } catch (err) {
      setPwdError(err.message || "Failed to update password.");
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    queryClient.clear();
    navigate("/login");
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>

      {/* Profile Info */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile.name && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground w-16">Name</span>
                <span className="text-sm">{profile.name}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground w-16">Email</span>
              <span className="text-sm">{profile.email}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goals */}
      <Card>
        <CardHeader>
          <CardTitle>Goals</CardTitle>
          <CardAction>
            {!goalsEditing ? (
              <Button type="button" variant="outline" size="sm" onClick={startGoalsEdit}>
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleSaveGoals} disabled={goalsSaving}>
                  {goalsSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGoalsEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          {goalsEditing ? (
            <div className="space-y-3">
              {GOAL_FIELDS.map(({ key, label, unit }) => (
                <div key={key} className="flex items-center gap-3">
                  <Label htmlFor={`goal-${key}`} className="text-muted-foreground w-28 shrink-0">
                    {label}
                  </Label>
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      id={`goal-${key}`}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={goalsForm[key] ?? ""}
                      onChange={(e) => setGoalsForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">{unit}</span>
                  </div>
                </div>
              ))}
              {goalsError && <p className="text-xs text-destructive">{goalsError}</p>}
            </div>
          ) : goals ? (
            <div className="space-y-2">
              {/* calorie/protein min+max are non-null in the schema; only water is optional */}
              {[
                { label: "Calories", value: `${goals.calorieMin}–${goals.calorieMax} kcal` },
                { label: "Protein", value: `${goals.proteinMin}–${goals.proteinMax} g` },
                { label: "Water", value: goals.waterGoal ? `${goals.waterGoal} oz / day` : null },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground w-16">{label}</span>
                  <span className="text-sm">
                    {value ?? <span className="text-muted-foreground">Not set</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading goals…</p>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Dark Mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Switch between light and dark theme
            </p>
          </div>
          <Switch
            checked={darkMode}
            onCheckedChange={toggleDarkMode}
            aria-label="Toggle dark mode"
          />
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          {pwdError && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-4">
              <AlertDescription className="text-destructive">{pwdError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {PASSWORD_FIELDS.map(({ key, label, autoComplete }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`${key}-password`}>{label}</Label>
                <Input
                  id={`${key}-password`}
                  type="password"
                  value={pwd[key]}
                  onChange={(e) => setPwd((p) => ({ ...p, [key]: e.target.value }))}
                  required
                  autoComplete={autoComplete}
                />
              </div>
            ))}

            <Button type="submit" disabled={pwdSaving} className="w-full">
              {pwdSaving ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Log Out */}
      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={handleLogout} className="w-full">
            Log Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
