import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { login, register, forgotPassword, resetPassword } from "../lib/api.js";
import { useUser } from "../context/UserContext.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

function AuthShell({ children }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">healthtrkr</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your personal fitness companion</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorAlert({ children }) {
  return (
    <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
      <AlertDescription className="text-destructive">{children}</AlertDescription>
    </Alert>
  );
}

// Card with a title/description header around a form (forgot + reset views).
function FormCard({ title, description, onSubmit, error, children }) {
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <ErrorAlert>{error}</ErrorAlert>}
            {children}
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function Field({ id, label, ...inputProps }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required className="h-10" {...inputProps} />
    </div>
  );
}

// view: 'login' | 'register' | 'forgot' | 'reset'
export default function Auth() {
  const navigate = useNavigate();
  const { refresh: refreshUser } = useUser();
  const [view, setView] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function switchTab(tab) {
    setView(tab);
    setError("");
    setName("");
    setEmail("");
    setPassword("");
    setCode("");
    setNewPassword("");
  }

  function goToForgot() {
    setError("");
    setView("forgot");
  }

  async function submit(e, action, fallbackError = "Something went wrong. Please try again.") {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await action();
    } catch (err) {
      setError(err.message || fallbackError);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = (e) =>
    submit(e, async () => {
      if (view === "login") {
        await login(email, password, rememberMe);
      } else {
        await register(email, password, name);
      }
      await refreshUser();
      navigate("/");
    });

  const handleForgot = (e) =>
    submit(e, async () => {
      await forgotPassword(email);
      toast.success("Check your email — a 6-digit code is on its way.");
      setView("reset");
    });

  const handleReset = (e) =>
    submit(
      e,
      async () => {
        await resetPassword(email, code.trim(), newPassword);
        toast.success("Password reset! You can now log in.");
        switchTab("login");
      },
      "Invalid or expired code."
    );

  const emailProps = {
    type: "email",
    autoComplete: "email",
    value: email,
    onChange: (e) => setEmail(e.target.value),
    placeholder: "you@example.com",
  };

  if (view === "forgot") {
    return (
      <FormCard
        title="Reset your password"
        description="Enter your email and we'll send you a 6-digit code."
        onSubmit={handleForgot}
        error={error}
      >
        <Field id="email" label="Email" {...emailProps} />
        <Button type="submit" disabled={loading} className="w-full h-10">
          {loading ? "Sending…" : "Send Code"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => switchTab("login")} className="w-full">
          Back to Log In
        </Button>
      </FormCard>
    );
  }

  if (view === "reset") {
    return (
      <FormCard
        title="Enter your reset code"
        description="Check your email for a 6-digit code."
        onSubmit={handleReset}
        error={error}
      >
        <Field id="reset-email" label="Email" {...emailProps} />
        <Field
          id="code"
          label="6-digit code"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          className="h-10 text-center font-mono tracking-widest"
        />
        <Field
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min 6 characters"
        />
        <Button type="submit" disabled={loading || code.length !== 6} className="w-full h-10">
          {loading ? "Resetting…" : "Reset Password"}
        </Button>
        <div className="flex justify-between text-sm">
          <button
            type="button"
            onClick={goToForgot}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => switchTab("login")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Log In
          </button>
        </div>
      </FormCard>
    );
  }

  // Login / Register
  return (
    <AuthShell>
      <Card>
        <CardContent>
          <Tabs value={view} onValueChange={switchTab}>
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">
                Log In
              </TabsTrigger>
              <TabsTrigger value="register" className="flex-1">
                Register
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {error && <ErrorAlert>{error}</ErrorAlert>}

            {view === "register" && (
              <Field
                id="name"
                label="Name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            )}

            <Field id="email" label="Email" name="email" {...emailProps} />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {view === "login" && (
                  <button
                    type="button"
                    onClick={goToForgot}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={view === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Min 6 characters"
                className="h-10"
              />
            </div>

            {view === "login" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label
                  htmlFor="remember"
                  className="text-muted-foreground font-normal cursor-pointer"
                >
                  Remember me
                </Label>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full h-10">
              {loading ? "Please wait..." : view === "login" ? "Log In" : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
