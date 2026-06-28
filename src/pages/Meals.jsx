import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { getFoodDetail } from "../lib/api.js";
import {
  useMeals,
  useAddMeal,
  useDeleteMeal,
  useCustomFoods,
  useCreateCustomFood,
  useUpdateCustomFood,
  useDeleteCustomFood,
  useMealPresets,
  useCreateMealPreset,
  useUpdateMealPreset,
  useDeleteMealPreset,
  useLogPreset,
  useFoodSearch,
} from "../hooks/useMeals.js";
import { useGoals, useUpdateGoals } from "../hooks/useGoals.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

// Native <select> styled to match the shadcn token system (used for the simple
// numeric serving/unit pickers).
const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const EMPTY_CUSTOM_SERVING = {
  description: "1 serving",
  metricAmount: "",
  metricUnit: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  sugar: "",
  sodium: "",
  saturatedFat: "",
  addedSugars: "",
  isDefault: true,
};

const EMPTY_CUSTOM_FOOD = {
  id: null,
  name: "",
  brandName: "",
  servings: [{ ...EMPTY_CUSTOM_SERVING }],
};

function defaultServingIdx(servings) {
  if (!Array.isArray(servings) || servings.length === 0) return 0;
  const i = servings.findIndex((s) => s.isDefault);
  return i >= 0 ? i : 0;
}

// Build the food/serving payload used by POST /api/meals. For FatSecret foods
// the client only sends the FS ids — the server fetches the canonical
// nutrition data from FatSecret to avoid trusting client-supplied macros.
function buildLogPayload(chosen, servingIdx, quantity) {
  const serving = chosen.servings[servingIdx];
  if (chosen.source === "custom") {
    return {
      food: { source: "custom" },
      serving: { source: "custom", servingId: serving.id },
      quantity,
    };
  }
  return {
    food: { source: "fatsecret", fatSecretFoodId: chosen.fatSecretFoodId },
    serving: {
      source: "fatsecret",
      fatSecretServingId: serving.fatSecretServingId ?? serving.servingId,
    },
    quantity,
  };
}

// Convert a FatSecret search result into our "chosen food" shape (source='fatsecret').
function fsFoodToChosen(f) {
  return {
    source: "fatsecret",
    fatSecretFoodId: f.foodId,
    foodName: f.foodName,
    brandName: f.brandName,
    foodType: f.foodType,
    foodUrl: f.foodUrl,
    servings: f.servings.map((s) => ({
      ...s,
      fatSecretServingId: s.servingId,
    })),
  };
}

// Convert a custom food (from GET /custom-foods) into "chosen food" shape (source='custom').
function customFoodToChosen(f) {
  return {
    source: "custom",
    customFoodId: f.id,
    foodName: f.name,
    brandName: f.brandName,
    foodType: f.foodType,
    servings: f.servings,
  };
}

function fmt(v, suffix = "") {
  if (v == null || !Number.isFinite(v)) return "";
  // Show one decimal for small numbers so e.g. 0.7g doesn't round to "1"
  const shown = Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${shown}${suffix}`;
}

export default function Meals() {
  const today = getTodayString();
  const location = useLocation();
  const navigate = useNavigate();

  // ── Page state ──
  const [date, setDate] = useState(today);
  const [notice, setNotice] = useState(""); // page-level notice ("X items dropped" etc.)
  const [saveAsMeal, setSaveAsMeal] = useState(null);

  // ── Slide-over state ──
  const [slideOver, setSlideOver] = useState({ open: false, mealType: "breakfast" });
  const [panelMode, setPanelMode] = useState("search");

  // ── Search panel state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchClientError, setSearchClientError] = useState("");
  const debounceRef = useRef(null);

  // ── Log panel state ──
  const [chosenFood, setChosenFood] = useState(null);
  const [chosenServingIdx, setChosenServingIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [submitClientError, setSubmitClientError] = useState("");

  // ── Custom-food editor state ──
  const [customFoodForm, setCustomFoodForm] = useState(EMPTY_CUSTOM_FOOD);
  const [customFoodClientError, setCustomFoodClientError] = useState("");
  const [customFoodAdvancedOpen, setCustomFoodAdvancedOpen] = useState({});

  // ── Preset state ──
  const [presetForm, setPresetForm] = useState({ id: null, name: "", items: [] });
  const [presetSearchQuery, setPresetSearchQuery] = useState("");
  const [debouncedPresetSearchQuery, setDebouncedPresetSearchQuery] = useState("");
  const presetDebounceRef = useRef(null);
  const [presetPickFood, setPresetPickFood] = useState(null);
  const [presetPickServingIdx, setPresetPickServingIdx] = useState(0);
  const [presetPickQuantity, setPresetPickQuantity] = useState(1);
  const [presetClientError, setPresetClientError] = useState("");

  // ── Goals state (form buffer) ──
  const [goalsEditing, setGoalsEditing] = useState(false);
  const [goalsForm, setGoalsForm] = useState({});
  const [goalsClientError, setGoalsClientError] = useState("");

  // ── Hooks: reads ──
  const mealsQuery = useMeals(date);
  const customFoodsQuery = useCustomFoods();
  const presetsQuery = useMealPresets();
  const goalsQuery = useGoals();
  const searchResultsQuery = useFoodSearch(debouncedSearchQuery);
  const presetSearchResultsQuery = useFoodSearch(debouncedPresetSearchQuery);

  // ── Hooks: mutations ──
  const addMealMutation = useAddMeal();
  const deleteMealMutation = useDeleteMeal();
  const logPresetMutation = useLogPreset();
  const createCustomFoodMutation = useCreateCustomFood();
  const updateCustomFoodMutation = useUpdateCustomFood();
  const deleteCustomFoodMutation = useDeleteCustomFood();
  const createPresetMutation = useCreateMealPreset();
  const updatePresetMutation = useUpdateMealPreset();
  const deletePresetMutation = useDeleteMealPreset();
  const updateGoalsMutation = useUpdateGoals();
  // Separate instance for the "Save current meal as Preset" inline form so
  // its isPending state doesn't collide with the preset editor.
  const saveAsPresetMutation = useCreateMealPreset();

  // ── Derived from queries ──
  const meals = mealsQuery.data;
  const loading = mealsQuery.isPending;
  const error =
    notice ||
    (mealsQuery.error && mealsQuery.error.message) ||
    (customFoodsQuery.error && customFoodsQuery.error.message) ||
    (presetsQuery.error && presetsQuery.error.message) ||
    (goalsQuery.error && goalsQuery.error.message) ||
    (deleteMealMutation.error && deleteMealMutation.error.message) ||
    "";
  const customFoods = customFoodsQuery.error ? [] : customFoodsQuery.data || [];
  const presets = presetsQuery.error ? [] : presetsQuery.data || [];
  const goals = goalsQuery.data;

  const searchResults = searchResultsQuery.data?.foods || [];
  const searchLoading = searchResultsQuery.isFetching;
  // The delete-custom-food button lives in the search panel, so its error
  // surfaces here rather than in the custom-food editor.
  const searchError =
    searchClientError ||
    (searchResultsQuery.error && searchResultsQuery.error.message) ||
    (deleteCustomFoodMutation.error && deleteCustomFoodMutation.error.message) ||
    "";

  const presetSearchResults = presetSearchResultsQuery.data?.foods || [];
  const presetSearchLoading = presetSearchResultsQuery.isFetching;

  // ── Derived from mutations ──
  const submitting = addMealMutation.isPending;
  const submitError =
    submitClientError || (addMealMutation.error && addMealMutation.error.message) || "";

  const savingCustomFood = createCustomFoodMutation.isPending || updateCustomFoodMutation.isPending;
  const customFoodError =
    customFoodClientError ||
    (createCustomFoodMutation.error && createCustomFoodMutation.error.message) ||
    (updateCustomFoodMutation.error && updateCustomFoodMutation.error.message) ||
    "";
  const deletingCustomFoodId = deleteCustomFoodMutation.isPending
    ? deleteCustomFoodMutation.variables
    : null;

  const loggingPresetId = logPresetMutation.isPending
    ? logPresetMutation.variables?.presetId
    : null;
  const deletingPresetId = deletePresetMutation.isPending ? deletePresetMutation.variables : null;
  const savingPreset = createPresetMutation.isPending || updatePresetMutation.isPending;
  const presetError =
    presetClientError ||
    (createPresetMutation.error && createPresetMutation.error.message) ||
    (updatePresetMutation.error && updatePresetMutation.error.message) ||
    (deletePresetMutation.error && deletePresetMutation.error.message) ||
    (logPresetMutation.error && logPresetMutation.error.message) ||
    "";

  const deletingId = deleteMealMutation.isPending ? deleteMealMutation.variables : null;

  const goalsSaving = updateGoalsMutation.isPending;
  const goalsError =
    goalsClientError || (updateGoalsMutation.error && updateGoalsMutation.error.message) || "";

  // ── Effects ──

  // Sync goals form buffer to the loaded goals (initial load + external updates).
  // Skip while editing so a background refetch can't clobber unsaved input.
  useEffect(() => {
    if (!goals || goalsEditing) return;
    setGoalsForm({
      calorieMin: goals.calorieMin ?? "",
      calorieMax: goals.calorieMax ?? "",
      proteinMin: goals.proteinMin ?? "",
      proteinMax: goals.proteinMax ?? "",
      carbsGoal: goals.carbsGoal ?? "",
      fatGoal: goals.fatGoal ?? "",
    });
  }, [goals, goalsEditing]);

  // Debounce the slide-over search; the actual fetch happens via useFoodSearch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedSearchQuery("");
      return;
    }
    debounceRef.current = setTimeout(() => setDebouncedSearchQuery(trimmed), 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Debounce the preset-inline search.
  useEffect(() => {
    if (presetDebounceRef.current) clearTimeout(presetDebounceRef.current);
    const trimmed = presetSearchQuery.trim();
    if (!trimmed) {
      setDebouncedPresetSearchQuery("");
      return;
    }
    presetDebounceRef.current = setTimeout(() => setDebouncedPresetSearchQuery(trimmed), 500);
    return () => {
      if (presetDebounceRef.current) clearTimeout(presetDebounceRef.current);
    };
  }, [presetSearchQuery]);

  // Deep-link from dashboard quick-add buttons.
  useEffect(() => {
    const openFor = location.state?.openFor;
    if (openFor && MEAL_TYPES.includes(openFor) && !loading) {
      openSlideOver(openFor);
      const { openFor: _removed, ...restState } = location.state ?? {};
      navigate(location.pathname, { replace: true, state: restState });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Slide-over open/close ──
  function resetPanelState() {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setSearchClientError("");
    setChosenFood(null);
    setChosenServingIdx(0);
    setQuantity(1);
    setSubmitClientError("");
    setCustomFoodForm(EMPTY_CUSTOM_FOOD);
    setCustomFoodClientError("");
    setCustomFoodAdvancedOpen({});
    setPresetForm({ id: null, name: "", items: [] });
    setPresetSearchQuery("");
    setDebouncedPresetSearchQuery("");
    setPresetPickFood(null);
    setPresetPickServingIdx(0);
    setPresetPickQuantity(1);
    setPresetClientError("");
  }

  function openSlideOver(mealType, initialMode = "search") {
    setSlideOver({ open: true, mealType });
    setPanelMode(initialMode);
    resetPanelState();
    setSaveAsMeal(null);
    // useCustomFoods + useMealPresets auto-load on mount; no manual fetch.
  }

  function closeSlideOver() {
    setSlideOver((prev) => ({ ...prev, open: false }));
    resetPanelState();
  }

  // ── Search ──
  function handleSearchInput(e) {
    setSearchQuery(e.target.value);
    setSearchClientError("");
    // The debounce effect transitions searchQuery → debouncedSearchQuery;
    // useFoodSearch fires when length >= 2 and caches by query.
  }

  // Click a search result. Custom foods already include their servings inline;
  // FatSecret search hits are lightweight and need a separate food.get fetch
  // to materialize the full servings array. getFoodDetail is called directly
  // (imperative, one-shot) rather than via a hook.
  async function pickFoodForLog(food) {
    setSubmitClientError("");
    if (food.source === "fatsecret" && (!food.servings || food.servings.length === 0)) {
      try {
        const detail = await getFoodDetail(food.fatSecretFoodId);
        if (!detail) throw new Error("Could not load food details.");
        const chosen = fsFoodToChosen(detail);
        setChosenFood(chosen);
        setChosenServingIdx(defaultServingIdx(chosen.servings));
      } catch (err) {
        setSearchClientError(err.message || "Failed to load food details.");
        return;
      }
    } else {
      setChosenFood(food);
      setChosenServingIdx(defaultServingIdx(food.servings));
    }
    setQuantity(1);
    setPanelMode("log");
  }

  // ── Log a meal ──
  function handleLogSubmit(e) {
    e.preventDefault();
    if (!chosenFood) return;
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      setSubmitClientError("Quantity must be a positive number.");
      return;
    }
    setSubmitClientError("");
    const payload = {
      date,
      mealType: slideOver.mealType,
      ...buildLogPayload(chosenFood, chosenServingIdx, q),
    };
    addMealMutation.mutate(payload, {
      onSuccess: () => {
        closeSlideOver();
        toast.success(`Added to ${slideOver.mealType}`);
      },
    });
  }

  // ── Delete a meal entry ──
  function handleDelete(id) {
    deleteMealMutation.mutate(id, { onSuccess: () => toast.success("Entry removed") });
  }

  // ── Custom-food editor ──
  function openCustomFoodEditor(existing = null) {
    if (existing) {
      setCustomFoodForm({
        id: existing.id,
        name: existing.name,
        brandName: existing.brandName ?? "",
        servings: existing.servings.map((s) => ({
          id: s.id,
          description: s.description ?? "",
          metricAmount: s.metricAmount ?? "",
          metricUnit: s.metricUnit ?? "",
          calories: s.calories ?? "",
          protein: s.protein ?? "",
          carbs: s.carbs ?? "",
          fat: s.fat ?? "",
          fiber: s.fiber ?? "",
          sugar: s.sugar ?? "",
          sodium: s.sodium ?? "",
          saturatedFat: s.saturatedFat ?? "",
          addedSugars: s.addedSugars ?? "",
          isDefault: s.isDefault ?? false,
        })),
      });
    } else {
      setCustomFoodForm({ ...EMPTY_CUSTOM_FOOD, servings: [{ ...EMPTY_CUSTOM_SERVING }] });
    }
    setCustomFoodClientError("");
    setCustomFoodAdvancedOpen({});
    setPanelMode("custom-food");
  }

  function updateCustomFoodField(field, value) {
    setCustomFoodForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateCustomServingField(idx, field, value) {
    setCustomFoodForm((prev) => {
      const servings = prev.servings.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
      return { ...prev, servings };
    });
  }

  function setCustomDefaultServing(idx) {
    setCustomFoodForm((prev) => ({
      ...prev,
      servings: prev.servings.map((s, i) => ({ ...s, isDefault: i === idx })),
    }));
  }

  function addCustomServing() {
    setCustomFoodForm((prev) => ({
      ...prev,
      servings: [...prev.servings, { ...EMPTY_CUSTOM_SERVING, isDefault: false }],
    }));
  }

  function removeCustomServing(idx) {
    setCustomFoodForm((prev) => {
      if (prev.servings.length <= 1) return prev;
      const servings = prev.servings.filter((_, i) => i !== idx);
      if (!servings.some((s) => s.isDefault)) servings[0].isDefault = true;
      return { ...prev, servings };
    });
  }

  function buildCustomFoodPayload() {
    return {
      name: customFoodForm.name.trim(),
      brandName: customFoodForm.brandName.trim() || null,
      servings: customFoodForm.servings.map((s) => ({
        id: typeof s.id === "string" ? s.id : null,
        description: s.description.trim(),
        metricAmount: s.metricAmount === "" ? null : Number(s.metricAmount),
        metricUnit: s.metricUnit.trim() || null,
        isDefault: s.isDefault === true,
        calories: Number(s.calories),
        protein: Number(s.protein),
        carbs: Number(s.carbs),
        fat: Number(s.fat),
        fiber: s.fiber === "" ? null : Number(s.fiber),
        sugar: s.sugar === "" ? null : Number(s.sugar),
        sodium: s.sodium === "" ? null : Number(s.sodium),
        saturatedFat: s.saturatedFat === "" ? null : Number(s.saturatedFat),
        addedSugars: s.addedSugars === "" ? null : Number(s.addedSugars),
      })),
    };
  }

  function handleSaveCustomFood() {
    if (!customFoodForm.name.trim()) {
      setCustomFoodClientError("Name is required.");
      return;
    }
    if (customFoodForm.servings.length === 0) {
      setCustomFoodClientError("Add at least one serving.");
      return;
    }
    for (const [i, s] of customFoodForm.servings.entries()) {
      if (!s.description.trim()) {
        setCustomFoodClientError(`Serving ${i + 1}: description is required.`);
        return;
      }
      for (const field of ["calories", "protein", "carbs", "fat"]) {
        const n = Number(s[field]);
        if (s[field] === "" || !Number.isFinite(n) || n < 0) {
          setCustomFoodClientError(
            `Serving ${i + 1}: ${field} is required and must be a non-negative number.`
          );
          return;
        }
      }
    }
    setCustomFoodClientError("");
    const payload = buildCustomFoodPayload();
    const onSuccess = () => {
      setPanelMode("search");
      toast.success("Custom food saved");
    };
    if (customFoodForm.id) {
      updateCustomFoodMutation.mutate({ id: customFoodForm.id, data: payload }, { onSuccess });
    } else {
      createCustomFoodMutation.mutate(payload, { onSuccess });
    }
  }

  function handleDeleteCustomFood(id) {
    deleteCustomFoodMutation.mutate(id);
  }

  // ── Preset list actions ──
  function handleLogPreset(presetId) {
    setPresetClientError("");
    logPresetMutation.mutate(
      { presetId, date, mealType: slideOver.mealType },
      {
        onSuccess: () => {
          closeSlideOver();
          toast.success("Preset logged");
        },
      }
    );
  }

  function handleDeletePreset(id) {
    deletePresetMutation.mutate(id);
  }

  // ── Preset editor ──
  function openPresetEditor(existing = null) {
    if (existing) {
      setPresetForm({
        id: existing.id,
        name: existing.name,
        items: existing.items.map((it) => ({
          servingId: it.servingId,
          quantity: it.quantity,
          foodName: it.foodName,
          servingDesc: it.servingDesc,
          caloriesPerServing: it.serving?.calories ?? 0,
        })),
      });
    } else {
      setPresetForm({ id: null, name: "", items: [] });
    }
    setPresetSearchQuery("");
    setDebouncedPresetSearchQuery("");
    setPresetPickFood(null);
    setPresetClientError("");
    setPanelMode("new-preset");
  }

  function handlePresetSearchInput(e) {
    setPresetSearchQuery(e.target.value);
    setPresetPickFood(null);
  }

  function pickFoodForPreset(food) {
    setPresetPickFood(food);
    setPresetPickServingIdx(defaultServingIdx(food.servings));
    setPresetPickQuantity(1);
  }

  function addPickedFoodToPreset() {
    if (!presetPickFood) return;
    const serving = presetPickFood.servings[presetPickServingIdx];
    if (!serving) return;
    if (presetPickFood.source !== "custom") {
      setPresetClientError(
        "FatSecret foods must be saved to My Foods before they can be added to a preset."
      );
      return;
    }
    setPresetClientError("");
    setPresetForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          servingId: serving.id,
          quantity: presetPickQuantity,
          foodName: presetPickFood.foodName,
          servingDesc: serving.description,
          caloriesPerServing: serving.calories ?? 0,
        },
      ],
    }));
    setPresetPickFood(null);
    setPresetPickServingIdx(0);
    setPresetPickQuantity(1);
    setPresetSearchQuery("");
    setDebouncedPresetSearchQuery("");
  }

  function updatePresetItemQuantity(idx, value) {
    setPresetForm((prev) => {
      const items = prev.items.map((it, i) =>
        i === idx ? { ...it, quantity: Math.max(0.25, parseFloat(value) || 0.25) } : it
      );
      return { ...prev, items };
    });
  }

  function removePresetItem(idx) {
    setPresetForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  function handleSavePreset() {
    const name = presetForm.name.trim();
    if (!name) {
      setPresetClientError("Preset name is required.");
      return;
    }
    if (presetForm.items.length === 0) {
      setPresetClientError("Add at least one item.");
      return;
    }
    setPresetClientError("");
    const payload = {
      name,
      items: presetForm.items.map((it) => ({ servingId: it.servingId, quantity: it.quantity })),
    };
    const onSuccess = () => {
      setPanelMode("presets");
      toast.success("Preset saved");
    };
    if (presetForm.id) {
      updatePresetMutation.mutate({ id: presetForm.id, data: payload }, { onSuccess });
    } else {
      createPresetMutation.mutate(payload, { onSuccess });
    }
  }

  // ── Save current meal section as a preset ──
  function handleSaveMealAsPreset(items) {
    const name = saveAsMeal.name.trim();
    if (!name || !items.length) return;
    const valid = items.filter((it) => it.servingId);
    const dropped = items.length - valid.length;
    if (valid.length === 0) {
      setSaveAsMeal((prev) => ({
        ...prev,
        error: "No items reference a saved food — cannot save as preset.",
      }));
      return;
    }
    setSaveAsMeal((prev) => ({ ...prev, error: "" }));
    const payload = {
      name,
      items: valid.map((it) => ({ servingId: it.servingId, quantity: it.quantity ?? 1 })),
    };
    saveAsPresetMutation.mutate(payload, {
      onSuccess: () => {
        setSaveAsMeal(null);
        if (dropped > 0) {
          setNotice(
            `Saved preset, but ${dropped} item${dropped === 1 ? "" : "s"} could not be included (their food was deleted).`
          );
        } else {
          setNotice("");
          toast.success("Preset saved");
        }
      },
      onError: (err) => {
        setSaveAsMeal((prev) => ({ ...prev, error: err.message || "Failed to save preset." }));
      },
    });
  }

  function handleSaveGoals() {
    setGoalsClientError("");
    // Empty string → null (unset); any other value (including 0) → Number.
    const toNullableNumber = (v) => (v === "" || v == null ? null : Number(v));
    const payload = {
      calorieMin: toNullableNumber(goalsForm.calorieMin),
      calorieMax: toNullableNumber(goalsForm.calorieMax),
      proteinMin: toNullableNumber(goalsForm.proteinMin),
      proteinMax: toNullableNumber(goalsForm.proteinMax),
      carbsGoal: toNullableNumber(goalsForm.carbsGoal),
      fatGoal: toNullableNumber(goalsForm.fatGoal),
    };
    updateGoalsMutation.mutate(payload, {
      onSuccess: () => {
        setGoalsEditing(false);
        toast.success("Goals saved");
      },
    });
  }

  const totals = meals?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 };

  // ─── Panel renderers ────────────────────────────────────────────────────
  function renderSearchPanel() {
    return (
      <>
        <div className="space-y-1.5">
          <Label htmlFor="food-search">Search food...</Label>
          <Input
            id="food-search"
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            placeholder="e.g. chicken breast, banana"
            className="h-9"
          />
        </div>

        {searchLoading && (
          <p className="text-xs text-muted-foreground animate-pulse">Searching...</p>
        )}

        {searchError && <p className="text-xs text-destructive">{searchError}</p>}

        {!searchLoading && searchResults.length > 0 && (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {searchResults.map((food) => {
              const p = food.defaultPreview;
              return (
                <li key={food.foodId}>
                  <button
                    type="button"
                    onClick={() =>
                      pickFoodForLog({
                        source: "fatsecret",
                        fatSecretFoodId: food.foodId,
                        foodName: food.foodName,
                        brandName: food.brandName,
                        foodType: food.foodType,
                        foodUrl: food.foodUrl,
                        servings: [],
                      })
                    }
                    className="w-full text-left px-4 py-3 hover:bg-accent transition-colors"
                  >
                    <p className="text-sm font-medium">
                      {food.foodName}
                      {food.brandName ? (
                        <span className="text-muted-foreground"> · {food.brandName}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p
                        ? `Per ${p.description} · ${fmt(p.calories)} kcal · ${fmt(p.protein, "g")} protein`
                        : "Tap to load servings"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!searchLoading &&
          searchQuery.trim() &&
          !searchError &&
          (searchQuery.trim().length < 2 ? (
            <p className="text-xs text-muted-foreground">Keep typing…</p>
          ) : searchResults.length === 0 && debouncedSearchQuery.length >= 2 ? (
            <p className="text-xs text-muted-foreground">No results found.</p>
          ) : null)}

        <button
          type="button"
          onClick={() => openCustomFoodEditor(null)}
          className="text-xs font-medium text-primary hover:underline"
        >
          + Create custom food
        </button>

        <Separator />

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            My Foods
          </h3>
          {customFoods.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved foods yet.</p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {customFoods.map((food) => {
                const d = food.servings[defaultServingIdx(food.servings)];
                return (
                  <li key={food.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <button
                      type="button"
                      onClick={() => pickFoodForLog(customFoodToChosen(food))}
                      className="flex-1 min-w-0 text-left hover:bg-accent rounded-sm px-1 py-0.5 transition-colors"
                    >
                      <p className="text-sm font-medium truncate">{food.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d
                          ? `${d.description} · ${fmt(d.calories)} kcal · ${fmt(d.protein, "g")} protein`
                          : ""}
                        {food.servings.length > 1 ? ` · ${food.servings.length} servings` : ""}
                      </p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => openCustomFoodEditor(food)}
                        aria-label={`Edit ${food.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => handleDeleteCustomFood(food.id)}
                        disabled={deletingCustomFoodId === food.id}
                        aria-label={`Delete ${food.name}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deletingCustomFoodId === food.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </>
    );
  }

  function renderLogPanel() {
    if (!chosenFood) return null;
    const serving = chosenFood.servings[chosenServingIdx];
    const q = Number(quantity) || 0;
    const preview = {
      calories: (serving?.calories ?? 0) * q,
      protein: (serving?.protein ?? 0) * q,
      carbs: (serving?.carbs ?? 0) * q,
      fat: (serving?.fat ?? 0) * q,
    };
    return (
      <form onSubmit={handleLogSubmit} className="space-y-4">
        <div>
          <p className="text-sm font-semibold">
            {chosenFood.foodName}
            {chosenFood.brandName ? (
              <span className="text-muted-foreground font-normal"> · {chosenFood.brandName}</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {chosenFood.source === "custom" ? "My Food" : "FatSecret"}
          </p>
        </div>

        {chosenFood.servings.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="serving-select">Serving</Label>
            <select
              id="serving-select"
              value={chosenServingIdx}
              onChange={(e) => setChosenServingIdx(Number(e.target.value))}
              className={SELECT_CLASS}
            >
              {chosenFood.servings.map((s, i) => (
                <option key={s.id ?? s.fatSecretServingId ?? i} value={i}>
                  {s.description} — {fmt(s.calories)} kcal
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{serving?.description}</p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="0.25"
            step="0.25"
            inputMode="decimal"
            className="w-32 h-9"
          />
        </div>

        <div className="grid grid-cols-4 gap-2 bg-muted rounded-lg p-3">
          <div className="text-center">
            <p className="text-base font-bold">{fmt(preview.calories)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">kcal</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-primary">{fmt(preview.protein, "g")}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">protein</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold">{fmt(preview.carbs, "g")}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">carbs</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold">{fmt(preview.fat, "g")}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">fat</p>
          </div>
        </div>

        {submitError && <p className="text-xs text-destructive">{submitError}</p>}

        <Button type="submit" disabled={submitting} className="w-full h-9">
          {submitting
            ? "Adding..."
            : `Add to ${slideOver.mealType.charAt(0).toUpperCase() + slideOver.mealType.slice(1)}`}
        </Button>

        <button
          type="button"
          onClick={() => {
            setPanelMode("search");
            setSubmitClientError("");
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Back to search
        </button>
      </form>
    );
  }

  function renderCustomFoodPanel() {
    const f = customFoodForm;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setPanelMode("search")}
            aria-label="Back to search"
          >
            <ArrowLeft />
          </Button>
          <h3 className="text-sm font-semibold">{f.id ? "Edit Custom Food" : "New Custom Food"}</h3>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cf-name"
              type="text"
              value={f.name}
              onChange={(e) => updateCustomFoodField("name", e.target.value)}
              required
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-brand">Brand (optional)</Label>
            <Input
              id="cf-brand"
              type="text"
              value={f.brandName}
              onChange={(e) => updateCustomFoodField("brandName", e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Servings
            </p>
            <button
              type="button"
              onClick={addCustomServing}
              className="text-xs font-medium text-primary hover:underline"
            >
              + Add another serving
            </button>
          </div>

          {f.servings.map((s, idx) => (
            <div key={idx} className="border border-border rounded-lg p-3 space-y-3 bg-card">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium">
                  <input
                    type="radio"
                    name="defaultServing"
                    checked={s.isDefault}
                    onChange={() => setCustomDefaultServing(idx)}
                    className="accent-primary size-4"
                  />
                  Default
                </label>
                {f.servings.length > 1 && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeCustomServing(idx)}
                    aria-label="Remove serving"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X />
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`cf-desc-${idx}`} className="text-[11px]">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`cf-desc-${idx}`}
                  type="text"
                  value={s.description}
                  onChange={(e) => updateCustomServingField(idx, "description", e.target.value)}
                  placeholder="e.g. 1 scoop"
                  className="h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`cf-amt-${idx}`} className="text-[11px]">
                    Metric amount
                  </Label>
                  <Input
                    id={`cf-amt-${idx}`}
                    type="number"
                    value={s.metricAmount}
                    onChange={(e) => updateCustomServingField(idx, "metricAmount", e.target.value)}
                    placeholder="e.g. 30"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`cf-unit-${idx}`} className="text-[11px]">
                    Unit
                  </Label>
                  <select
                    id={`cf-unit-${idx}`}
                    value={s.metricUnit}
                    onChange={(e) => updateCustomServingField(idx, "metricUnit", e.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value="">—</option>
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="oz">oz</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  ["calories", "Calories"],
                  ["protein", "Protein (g)"],
                  ["carbs", "Carbs (g)"],
                  ["fat", "Fat (g)"],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`cf-${key}-${idx}`} className="text-[11px]">
                      {label} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`cf-${key}-${idx}`}
                      type="number"
                      value={s[key]}
                      onChange={(e) => updateCustomServingField(idx, key, e.target.value)}
                      required
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      className="h-9"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setCustomFoodAdvancedOpen((prev) => ({ ...prev, [idx]: !prev[idx] }))
                }
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {customFoodAdvancedOpen[idx]
                  ? "Hide advanced nutrients"
                  : "Advanced nutrients (optional)"}
              </button>

              {customFoodAdvancedOpen[idx] && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["fiber", "Fiber (g)"],
                    ["sugar", "Sugar (g)"],
                    ["addedSugars", "Added sugars (g)"],
                    ["saturatedFat", "Sat. fat (g)"],
                    ["sodium", "Sodium (mg)"],
                  ].map(([key, label]) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={`cf-${key}-${idx}`} className="text-[11px]">
                        {label}
                      </Label>
                      <Input
                        id={`cf-${key}-${idx}`}
                        type="number"
                        value={s[key]}
                        onChange={(e) => updateCustomServingField(idx, key, e.target.value)}
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {customFoodError && <p className="text-xs text-destructive">{customFoodError}</p>}

        <Button
          type="button"
          onClick={handleSaveCustomFood}
          disabled={savingCustomFood}
          className="w-full h-9"
        >
          {savingCustomFood ? "Saving..." : f.id ? "Save Changes" : "Save Custom Food"}
        </Button>
      </div>
    );
  }

  function renderPresetsPanel() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Meal Presets</h3>
          <Button type="button" size="sm" onClick={() => openPresetEditor(null)}>
            + New Preset
          </Button>
        </div>

        {presetError && <p className="text-xs text-destructive">{presetError}</p>}

        {presets.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No presets yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a preset to quickly log multiple foods at once.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {presets.map((preset) => {
              const totalCal = preset.items.reduce(
                (sum, it) => sum + (it.serving?.calories ?? 0) * it.quantity,
                0
              );
              return (
                <li key={preset.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{preset.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {preset.items.length} item{preset.items.length !== 1 ? "s" : ""} ·{" "}
                        {fmt(totalCal)} kcal
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleLogPreset(preset.id)}
                        disabled={loggingPresetId === preset.id}
                      >
                        {loggingPresetId === preset.id ? "Adding..." : "Use"}
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => openPresetEditor(preset)}
                        aria-label={`Edit preset ${preset.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => handleDeletePreset(preset.id)}
                        disabled={deletingPresetId === preset.id}
                        aria-label={`Delete preset ${preset.name}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deletingPresetId === preset.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                      </Button>
                    </div>
                  </div>
                  {preset.items.length > 0 && (
                    <ul className="space-y-0.5">
                      {preset.items.map((item) => (
                        <li key={item.id} className="text-xs text-muted-foreground truncate">
                          {item.quantity !== 1 ? `${item.quantity}× ` : ""}
                          {item.foodName}
                          {item.servingDesc ? ` (${item.servingDesc})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  function renderNewPresetPanel() {
    const totalCal = presetForm.items.reduce(
      (sum, it) => sum + it.caloriesPerServing * it.quantity,
      0
    );
    const pickServing = presetPickFood?.servings[presetPickServingIdx];

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setPanelMode("presets");
              setPresetClientError("");
            }}
            aria-label="Back to presets"
          >
            <ArrowLeft />
          </Button>
          <h3 className="text-sm font-semibold">{presetForm.id ? "Edit Preset" : "New Preset"}</h3>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preset-name">
            Preset Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="preset-name"
            type="text"
            value={presetForm.name}
            onChange={(e) => setPresetForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Morning Stack"
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preset-search">Add Item</Label>
          <p className="text-[11px] text-muted-foreground">
            Pick from My Foods (or search FatSecret — items must first be saved to My Foods to add
            to a preset).
          </p>
          <Input
            id="preset-search"
            type="text"
            value={presetSearchQuery}
            onChange={handlePresetSearchInput}
            placeholder="Search to add foods..."
            className="h-9"
          />
        </div>

        {presetSearchLoading && (
          <p className="text-xs text-muted-foreground animate-pulse">Searching...</p>
        )}

        {!presetSearchLoading && !presetPickFood && presetSearchResults.length > 0 && (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {presetSearchResults.map((food) => {
              const p = food.defaultPreview;
              return (
                <li
                  key={food.foodId}
                  className="flex items-center justify-between px-3 py-2.5 gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{food.foodName}</p>
                    <p className="text-xs text-muted-foreground">
                      {p
                        ? `Per ${p.description} · ${fmt(p.calories)} kcal · ${fmt(p.protein, "g")} protein`
                        : "FatSecret food"}
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      Save to My Foods first to add to a preset.
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!presetPickFood && !presetSearchQuery.trim() && customFoods.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              My Foods
            </p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {customFoods.map((food) => {
                const d = food.servings[defaultServingIdx(food.servings)];
                return (
                  <li key={food.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <button
                      type="button"
                      onClick={() => pickFoodForPreset(customFoodToChosen(food))}
                      className="min-w-0 flex-1 text-left hover:bg-accent rounded-sm px-1 py-0.5 transition-colors"
                    >
                      <p className="text-sm font-medium truncate">{food.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d
                          ? `${d.description} · ${fmt(d.calories)} kcal · ${fmt(d.protein, "g")} protein`
                          : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {presetPickFood && (
          <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 space-y-3">
            <p className="text-sm font-semibold">{presetPickFood.foodName}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="preset-pick-serving" className="text-[11px]">
                  Serving
                </Label>
                <select
                  id="preset-pick-serving"
                  value={presetPickServingIdx}
                  onChange={(e) => setPresetPickServingIdx(Number(e.target.value))}
                  className={SELECT_CLASS}
                >
                  {presetPickFood.servings.map((s, i) => (
                    <option key={s.id ?? s.fatSecretServingId ?? i} value={i}>
                      {s.description}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preset-pick-qty" className="text-[11px]">
                  Quantity
                </Label>
                <Input
                  id="preset-pick-qty"
                  type="number"
                  value={presetPickQuantity}
                  onChange={(e) =>
                    setPresetPickQuantity(Math.max(0.25, parseFloat(e.target.value) || 0.25))
                  }
                  min="0.25"
                  step="0.25"
                  inputMode="decimal"
                  className="h-9"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {pickServing
                ? `${fmt((pickServing.calories ?? 0) * presetPickQuantity)} kcal total`
                : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={addPickedFoodToPreset}>
                Add to preset
              </Button>
              <button
                type="button"
                onClick={() => setPresetPickFood(null)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Items in this preset
            </p>
            {presetForm.items.length > 0 && (
              <p className="text-xs text-muted-foreground">{fmt(totalCal)} kcal total</p>
            )}
          </div>
          {presetForm.items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Search and add foods above.</p>
          ) : (
            <ul className="space-y-2">
              {presetForm.items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 border border-border rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.foodName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.servingDesc ? `${item.servingDesc} · ` : ""}
                      {fmt(item.caloriesPerServing * item.quantity)} kcal
                    </p>
                  </div>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updatePresetItemQuantity(idx, e.target.value)}
                    min="0.25"
                    step="0.25"
                    inputMode="decimal"
                    className="w-16 h-8 text-center"
                    aria-label={`Quantity for ${item.foodName}`}
                  />
                  <span className="text-xs text-muted-foreground">×</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removePresetItem(idx)}
                    aria-label={`Remove ${item.foodName}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {presetError && <p className="text-xs text-destructive">{presetError}</p>}

        <Button
          type="button"
          onClick={handleSavePreset}
          disabled={savingPreset || !presetForm.name.trim() || presetForm.items.length === 0}
          className="w-full h-9"
        >
          {savingPreset ? "Saving..." : presetForm.id ? "Save Changes" : "Save Preset"}
        </Button>
      </div>
    );
  }

  const sheetTitle =
    panelMode === "presets" || panelMode === "new-preset"
      ? slideOver.mealType.charAt(0).toUpperCase() + slideOver.mealType.slice(1)
      : `Add to ${slideOver.mealType}`;

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Meal Logger</h1>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
        />
      </div>

      {error && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      {/* Nutrition Goals */}
      <Card className="py-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold">Nutrition Goals</h2>
          {!goalsEditing ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setGoalsEditing(true)}>
              Edit Goals
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
                onClick={() => {
                  setGoalsEditing(false);
                  setGoalsClientError("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
        <div className="px-5 py-4">
          {goalsEditing ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { key: "calorieMin", label: "Calorie Min", unit: "kcal" },
                { key: "calorieMax", label: "Calorie Max", unit: "kcal" },
                { key: "proteinMin", label: "Protein Min", unit: "g" },
                { key: "proteinMax", label: "Protein Max", unit: "g" },
                { key: "carbsGoal", label: "Carbs Goal", unit: "g" },
                { key: "fatGoal", label: "Fat Goal", unit: "g" },
              ].map(({ key, label, unit }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`goal-${key}`}>{label}</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id={`goal-${key}`}
                      type="number"
                      min="0"
                      value={goalsForm[key] ?? ""}
                      onChange={(e) => setGoalsForm((f) => ({ ...f, [key]: e.target.value }))}
                      inputMode="numeric"
                      className="h-9"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">{unit}</span>
                  </div>
                </div>
              ))}
              {goalsError && <p className="col-span-full text-xs text-destructive">{goalsError}</p>}
            </div>
          ) : goals ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
              {[
                { label: "Cal Min", value: goals.calorieMin, unit: "kcal" },
                { label: "Cal Max", value: goals.calorieMax, unit: "kcal" },
                { label: "Protein Min", value: goals.proteinMin, unit: "g" },
                { label: "Protein Max", value: goals.proteinMax, unit: "g" },
                { label: "Carbs", value: goals.carbsGoal, unit: "g" },
                { label: "Fat", value: goals.fatGoal, unit: "g" },
              ].map(({ label, value, unit }) => (
                <div key={label} className="bg-muted rounded-lg p-2">
                  <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                  <p className="text-sm font-bold">
                    {value ?? "—"}
                    <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading goals…</p>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {MEAL_TYPES.map((mealType) => {
            const items = meals?.[mealType] || [];
            const subtotal = items.reduce((sum, item) => sum + (item.calories || 0), 0);

            return (
              <Card key={mealType} className="py-0 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold capitalize">{mealType}</h2>
                  <span className="text-sm text-muted-foreground">{fmt(subtotal)} kcal</span>
                </div>

                {items.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between px-5 py-3 gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {item.foodName}
                            {item.brandName ? (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                · {item.brandName}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.quantity && item.quantity !== 1 ? `${item.quantity}× ` : ""}
                            {item.servingDesc ? `${item.servingDesc} · ` : ""}
                            {fmt(item.calories)} kcal · {fmt(item.protein, "g")} protein ·{" "}
                            {fmt(item.carbs, "g")} carbs · {fmt(item.fat, "g")} fat
                          </p>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          aria-label={`Delete ${item.foodName}`}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-3 text-sm text-muted-foreground">Nothing logged yet.</p>
                )}

                <div className="px-5 py-3 border-t border-border flex items-center gap-4">
                  <button
                    onClick={() => openSlideOver(mealType)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    + Add Food
                  </button>
                  <button
                    onClick={() => openSlideOver(mealType, "presets")}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Presets
                  </button>
                  {items.length > 0 && saveAsMeal?.mealType !== mealType && (
                    <button
                      onClick={() => setSaveAsMeal({ mealType, name: "", error: "" })}
                      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    >
                      Save as Preset
                    </button>
                  )}
                </div>

                {saveAsMeal?.mealType === mealType && (
                  <div className="px-5 py-3 border-t border-border bg-primary/5 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Save "{mealType}" as a preset:
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={saveAsMeal.name}
                        onChange={(e) =>
                          setSaveAsMeal((prev) => ({ ...prev, name: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveMealAsPreset(items);
                          if (e.key === "Escape") setSaveAsMeal(null);
                        }}
                        placeholder="Preset name…"
                        className="flex-1 h-8"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveMealAsPreset(items)}
                        disabled={saveAsPresetMutation.isPending || !saveAsMeal.name.trim()}
                      >
                        {saveAsPresetMutation.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSaveAsMeal(null)}>
                        Cancel
                      </Button>
                    </div>
                    {saveAsMeal.error && (
                      <p className="text-xs text-destructive">{saveAsMeal.error}</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          <Card className="py-0 overflow-hidden">
            <div className="px-5 py-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Daily Totals
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-2xl font-bold">{fmt(totals.calories || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Calories</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{fmt(totals.protein || 0, "g")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Protein</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{fmt(totals.carbs || 0, "g")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Carbs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{fmt(totals.fat || 0, "g")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Fat</p>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Add-food slide-over */}
      <Sheet
        open={slideOver.open}
        onOpenChange={(open) => {
          if (!open) closeSlideOver();
        }}
      >
        <SheetContent className="w-full sm:max-w-[420px] p-0 gap-0">
          <SheetHeader className="flex-row items-center justify-between border-b pr-12">
            <SheetTitle className="capitalize">{sheetTitle}</SheetTitle>
            {panelMode === "search" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPanelMode("presets");
                  setPresetClientError("");
                }}
              >
                Presets
              </Button>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {panelMode === "search" && renderSearchPanel()}
            {panelMode === "log" && renderLogPanel()}
            {panelMode === "custom-food" && renderCustomFoodPanel()}
            {panelMode === "presets" && renderPresetsPanel()}
            {panelMode === "new-preset" && renderNewPresetPanel()}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
