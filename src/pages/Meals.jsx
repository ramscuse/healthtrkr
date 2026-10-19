import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, X, Loader2, Star } from "lucide-react";
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
  useRecentFoods,
  useFavoriteFoods,
  useAddFavoriteFood,
  useRemoveFavoriteFood,
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
import { cn, ymd } from "@/lib/utils";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

// Native <select> styled to match the shadcn token system.
const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const LIST_CLASS = "divide-y divide-border border border-border rounded-lg overflow-hidden";

const MACROS = [
  { key: "calories", unit: "", label: "Calories", short: "kcal" },
  { key: "protein", unit: "g", label: "Protein", short: "protein" },
  { key: "carbs", unit: "g", label: "Carbs", short: "carbs" },
  { key: "fat", unit: "g", label: "Fat", short: "fat" },
];

const GOAL_FIELDS = [
  { key: "calorieMin", label: "Calorie Min", short: "Cal Min", unit: "kcal" },
  { key: "calorieMax", label: "Calorie Max", short: "Cal Max", unit: "kcal" },
  { key: "proteinMin", label: "Protein Min", short: "Protein Min", unit: "g" },
  { key: "proteinMax", label: "Protein Max", short: "Protein Max", unit: "g" },
  { key: "carbsGoal", label: "Carbs Goal", short: "Carbs", unit: "g" },
  { key: "fatGoal", label: "Fat Goal", short: "Fat", unit: "g" },
];

const REQUIRED_NUTRIENTS = [
  ["calories", "Calories"],
  ["protein", "Protein (g)"],
  ["carbs", "Carbs (g)"],
  ["fat", "Fat (g)"],
];

const OPTIONAL_NUTRIENTS = [
  ["fiber", "Fiber (g)"],
  ["sugar", "Sugar (g)"],
  ["addedSugars", "Added sugars (g)"],
  ["saturatedFat", "Sat. fat (g)"],
  ["sodium", "Sodium (mg)"],
];

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

const EMPTY_PRESET = { id: null, name: "", items: [] };

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Empty string → null (unset); any other value (including 0) → Number.
const toNullableNumber = (v) => (v === "" || v == null ? null : Number(v));

function defaultServingIdx(servings) {
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
  if (chosen.source === "barcode") {
    // Barcode foods have a single server-resolved 100 g serving; no servingId.
    return {
      food: { source: "barcode", barcode: chosen.barcode },
      serving: {},
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

// Convert a FatSecret food detail into our "chosen food" shape (source='fatsecret').
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

// Convert a serializeFood-shaped row (custom foods, favorites, recents;
// servings inline) into "chosen food" shape so it can be logged directly.
function storedFoodToChosen(f) {
  const base = {
    foodName: f.name,
    brandName: f.brandName,
    foodType: f.foodType,
    servings: f.servings,
  };
  if (f.source === "custom") return { ...base, source: "custom", customFoodId: f.id };
  if (f.source === "barcode") return { ...base, source: "barcode", barcode: f.foodUrl };
  // fatsecret — servings already carry fatSecretServingId via serializeServing.
  return { ...base, source: "fatsecret", fatSecretFoodId: f.fatSecretFoodId };
}

function fmt(v, suffix = "") {
  if (v == null || !Number.isFinite(v)) return "";
  // Show one decimal for small numbers so e.g. 0.7g doesn't round to "1"
  const shown = Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${shown}${suffix}`;
}

function servingSummary(s) {
  return s ? `${s.description} · ${fmt(s.calories)} kcal · ${fmt(s.protein, "g")} protein` : "";
}

// Trimmed `value`, published after `delay` ms without changes. Clearing the
// input clears the result immediately.
function useDebouncedQuery(value, delay) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setDebounced("");
      return;
    }
    const t = setTimeout(() => setDebounced(trimmed), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return value.trim() ? debounced : "";
}

function FavoriteButton({ name, isFav, pending, onClick, shrink = true }) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
      disabled={pending}
      aria-label={`${isFav ? "Unfavorite" : "Favorite"} ${name}`}
      aria-pressed={isFav}
      className={cn(
        shrink && "shrink-0",
        isFav ? "text-primary" : "text-muted-foreground hover:text-primary"
      )}
    >
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Star className={isFav ? "fill-current" : ""} />
      )}
    </Button>
  );
}

// Clickable stored-food row (favorites, recents, My Foods) with trailing actions.
function FoodRow({ food, showBrand = true, detail = "", onPick, children }) {
  return (
    <li className="flex items-center justify-between px-3 py-2.5 gap-2">
      <button
        type="button"
        onClick={onPick}
        className="flex-1 min-w-0 text-left hover:bg-accent rounded-sm px-1 py-0.5 transition-colors"
      >
        <p className="text-sm font-medium truncate">
          {food.name}
          {showBrand && food.brandName ? (
            <span className="text-muted-foreground font-normal"> · {food.brandName}</span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {servingSummary(food.servings[defaultServingIdx(food.servings)])}
          {detail}
        </p>
      </button>
      {children}
    </li>
  );
}

export default function Meals() {
  const location = useLocation();
  const navigate = useNavigate();

  // ── Page state ──
  const [date, setDate] = useState(ymd);
  const [notice, setNotice] = useState(""); // page-level notice ("X items dropped" etc.)
  const [saveAsMeal, setSaveAsMeal] = useState(null);

  // ── Slide-over state ──
  const [slideOver, setSlideOver] = useState({ open: false, mealType: "breakfast" });
  const [panelMode, setPanelMode] = useState("search");

  // ── Search panel state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchClientError, setSearchClientError] = useState("");
  const debouncedSearchQuery = useDebouncedQuery(searchQuery, 700);

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
  const [presetForm, setPresetForm] = useState(EMPTY_PRESET);
  const [presetSearchQuery, setPresetSearchQuery] = useState("");
  const debouncedPresetSearchQuery = useDebouncedQuery(presetSearchQuery, 500);
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
  // Recents and favorites are per meal type and only needed while the
  // slide-over is open.
  const recentFoodsQuery = useRecentFoods(slideOver.mealType, { enabled: slideOver.open });
  const favoritesQuery = useFavoriteFoods(slideOver.mealType, { enabled: slideOver.open });

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
  const addFavoriteMutation = useAddFavoriteFood();
  const removeFavoriteMutation = useRemoveFavoriteFood();
  // Separate instance for the "Save current meal as Preset" inline form so
  // its isPending state doesn't collide with the preset editor.
  const saveAsPresetMutation = useCreateMealPreset();

  // ── Derived from queries ──
  const meals = mealsQuery.data;
  const loading = mealsQuery.isPending;
  const error =
    notice ||
    mealsQuery.error?.message ||
    customFoodsQuery.error?.message ||
    presetsQuery.error?.message ||
    goalsQuery.error?.message ||
    deleteMealMutation.error?.message ||
    "";
  const customFoods = customFoodsQuery.error ? [] : customFoodsQuery.data || [];
  const presets = presetsQuery.error ? [] : presetsQuery.data || [];
  const goals = goalsQuery.data;

  // Not error-gated: React Query keeps the last good data across a refetch
  // error, and a hard failure is surfaced via searchError.
  const favorites = favoritesQuery.data || [];
  const favoriteIds = new Set(favorites.map((f) => f.id));
  // Recently-logged foods for this meal type, minus anything already shown in
  // "My Foods" (those are listed there with edit/delete).
  const customFoodIds = new Set(customFoods.map((f) => f.id));
  const recentFoods = (recentFoodsQuery.error ? [] : recentFoodsQuery.data || []).filter(
    (f) => !customFoodIds.has(f.id)
  );
  // Which row's star is mid-flight. Adds via a search hit are keyed by
  // fatSecretFoodId (no stored id yet); everything else by the stored food id.
  const favoritingFsId = addFavoriteMutation.isPending
    ? addFavoriteMutation.variables?.fatSecretFoodId
    : null;
  const favoritingFoodId = addFavoriteMutation.isPending
    ? addFavoriteMutation.variables?.foodId
    : null;
  const unfavoritingFoodId = removeFavoriteMutation.isPending
    ? removeFavoriteMutation.variables?.foodId
    : null;
  const isFavPending = (id) => favoritingFoodId === id || unfavoritingFoodId === id;

  const searchResults = searchResultsQuery.data?.foods || [];
  const searchLoading = searchResultsQuery.isFetching;
  // The delete-custom-food button lives in the search panel, so its error
  // surfaces here rather than in the custom-food editor.
  const searchError =
    searchClientError ||
    searchResultsQuery.error?.message ||
    favoritesQuery.error?.message ||
    deleteCustomFoodMutation.error?.message ||
    addFavoriteMutation.error?.message ||
    removeFavoriteMutation.error?.message ||
    "";

  const presetSearchResults = presetSearchResultsQuery.data?.foods || [];
  const presetSearchLoading = presetSearchResultsQuery.isFetching;

  // ── Derived from mutations ──
  const submitting = addMealMutation.isPending;
  const submitError = submitClientError || addMealMutation.error?.message || "";

  const savingCustomFood = createCustomFoodMutation.isPending || updateCustomFoodMutation.isPending;
  const customFoodError =
    customFoodClientError ||
    createCustomFoodMutation.error?.message ||
    updateCustomFoodMutation.error?.message ||
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
    createPresetMutation.error?.message ||
    updatePresetMutation.error?.message ||
    deletePresetMutation.error?.message ||
    logPresetMutation.error?.message ||
    "";

  const deletingId = deleteMealMutation.isPending ? deleteMealMutation.variables : null;

  const goalsSaving = updateGoalsMutation.isPending;
  const goalsError = goalsClientError || updateGoalsMutation.error?.message || "";

  const totals = meals?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const mealLabel = capitalize(slideOver.mealType);

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
    setSearchClientError("");
    setChosenFood(null);
    setChosenServingIdx(0);
    setQuantity(1);
    setSubmitClientError("");
    setCustomFoodForm(EMPTY_CUSTOM_FOOD);
    setCustomFoodClientError("");
    setCustomFoodAdvancedOpen({});
    setPresetForm(EMPTY_PRESET);
    setPresetSearchQuery("");
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
  }

  function closeSlideOver() {
    setSlideOver((prev) => ({ ...prev, open: false }));
    resetPanelState();
  }

  // ── Search ──
  function handleSearchInput(e) {
    setSearchQuery(e.target.value);
    setSearchClientError("");
  }

  // FatSecret search hits arrive without servings and need a one-shot
  // food.get (direct getFoodDetail call, not a hook); stored foods carry theirs.
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

  // ── Custom-food editor ──
  function openCustomFoodEditor(existing = null) {
    if (existing) {
      setCustomFoodForm({
        id: existing.id,
        name: existing.name,
        brandName: existing.brandName ?? "",
        // Server nulls → "" so every input stays controlled.
        servings: existing.servings.map((s) => ({
          ...Object.fromEntries(Object.keys(EMPTY_CUSTOM_SERVING).map((k) => [k, s[k] ?? ""])),
          id: s.id,
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
        metricAmount: toNullableNumber(s.metricAmount),
        metricUnit: s.metricUnit.trim() || null,
        isDefault: s.isDefault === true,
        calories: Number(s.calories),
        protein: Number(s.protein),
        carbs: Number(s.carbs),
        fat: Number(s.fat),
        fiber: toNullableNumber(s.fiber),
        sugar: toNullableNumber(s.sugar),
        sodium: toNullableNumber(s.sodium),
        saturatedFat: toNullableNumber(s.saturatedFat),
        addedSugars: toNullableNumber(s.addedSugars),
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
      for (const [field] of REQUIRED_NUTRIENTS) {
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

  // ── Favorites ──
  // Toggle an already-stored food (serializeFood row) for the current meal type.
  function handleToggleFavorite(food) {
    const mealType = slideOver.mealType;
    if (favoriteIds.has(food.id)) {
      removeFavoriteMutation.mutate({ foodId: food.id, mealType });
    } else {
      addFavoriteMutation.mutate({ foodId: food.id, mealType });
    }
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
      setPresetForm(EMPTY_PRESET);
    }
    setPresetSearchQuery("");
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
      items: valid.map((it) => ({ servingId: it.servingId, quantity: it.quantity })),
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

  // ── Goals ──
  // The form buffer is loaded from the current goals when editing starts, so a
  // background refetch can't clobber unsaved input.
  function startEditingGoals() {
    setGoalsForm(Object.fromEntries(GOAL_FIELDS.map(({ key }) => [key, goals?.[key] ?? ""])));
    setGoalsEditing(true);
  }

  function handleSaveGoals() {
    setGoalsClientError("");
    const payload = Object.fromEntries(
      GOAL_FIELDS.map(({ key }) => [key, toNullableNumber(goalsForm[key])])
    );
    updateGoalsMutation.mutate(payload, {
      onSuccess: () => {
        setGoalsEditing(false);
        toast.success("Goals saved");
      },
    });
  }

  // ─── Panel renderers ────────────────────────────────────────────────────
  function renderStoredFoodRow(food) {
    return (
      <FoodRow key={food.id} food={food} onPick={() => pickFoodForLog(storedFoodToChosen(food))}>
        <FavoriteButton
          name={food.name}
          isFav={favoriteIds.has(food.id)}
          pending={isFavPending(food.id)}
          onClick={() => handleToggleFavorite(food)}
        />
      </FoodRow>
    );
  }

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
          <ul className={LIST_CLASS}>
            {searchResults.map((food) => {
              const p = food.defaultPreview;
              // Search hits carry a fatSecretFoodId, not a stored Food id;
              // match against favorited FS foods to reflect the star state.
              const favForFs = favorites.find((f) => f.fatSecretFoodId === food.foodId);
              return (
                <li key={food.foodId} className="flex items-center gap-1 pr-2">
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
                    className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-accent transition-colors"
                  >
                    <p className="text-sm font-medium">
                      {food.foodName}
                      {food.brandName ? (
                        <span className="text-muted-foreground"> · {food.brandName}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p ? `Per ${servingSummary(p)}` : "Tap to load servings"}
                    </p>
                  </button>
                  <FavoriteButton
                    name={food.foodName}
                    isFav={!!favForFs}
                    pending={
                      favoritingFsId === food.foodId ||
                      (favForFs && unfavoritingFoodId === favForFs.id)
                    }
                    onClick={() =>
                      favForFs
                        ? removeFavoriteMutation.mutate({
                            foodId: favForFs.id,
                            mealType: slideOver.mealType,
                          })
                        : addFavoriteMutation.mutate({
                            source: "fatsecret",
                            fatSecretFoodId: food.foodId,
                            mealType: slideOver.mealType,
                          })
                    }
                  />
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
          onClick={() => openCustomFoodEditor()}
          className="text-xs font-medium text-primary hover:underline"
        >
          + Create custom food
        </button>

        {favorites.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Favorites
              </h3>
              <ul className={LIST_CLASS}>{favorites.map(renderStoredFoodRow)}</ul>
            </div>
          </>
        )}

        <Separator />

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            My Foods
          </h3>
          {customFoods.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved foods yet.</p>
          ) : (
            <ul className={LIST_CLASS}>
              {customFoods.map((food) => (
                <FoodRow
                  key={food.id}
                  food={food}
                  showBrand={false}
                  detail={food.servings.length > 1 ? ` · ${food.servings.length} servings` : ""}
                  onPick={() => pickFoodForLog(storedFoodToChosen(food))}
                >
                  <div className="flex items-center gap-1 shrink-0">
                    <FavoriteButton
                      shrink={false}
                      name={food.name}
                      isFav={favoriteIds.has(food.id)}
                      pending={isFavPending(food.id)}
                      onClick={() => handleToggleFavorite(food)}
                    />
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
                      onClick={() => deleteCustomFoodMutation.mutate(food.id)}
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
                </FoodRow>
              ))}
            </ul>
          )}

          {recentFoods.length > 0 && (
            <div className="mt-4">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recently logged
              </h4>
              <ul className={LIST_CLASS}>{recentFoods.map(renderStoredFoodRow)}</ul>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderLogPanel() {
    if (!chosenFood) return null;
    const serving = chosenFood.servings[chosenServingIdx];
    const q = Number(quantity) || 0;
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
            {{ custom: "My Food", barcode: "Barcode" }[chosenFood.source] ?? "FatSecret"}
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
          {MACROS.map(({ key, unit, short }) => (
            <div key={key} className="text-center">
              <p className={cn("text-base font-bold", key === "protein" && "text-primary")}>
                {fmt((serving?.[key] ?? 0) * q, unit)}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{short}</p>
            </div>
          ))}
        </div>

        {submitError && <p className="text-xs text-destructive">{submitError}</p>}

        <Button type="submit" disabled={submitting} className="w-full h-9">
          {submitting ? "Adding..." : `Add to ${mealLabel}`}
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
    const nutrientField = (s, idx, [key, label], required = false) => (
      <div key={key} className="space-y-1.5">
        <Label htmlFor={`cf-${key}-${idx}`} className="text-[11px]">
          {label}
          {required && (
            <>
              {" "}
              <span className="text-destructive">*</span>
            </>
          )}
        </Label>
        <Input
          id={`cf-${key}-${idx}`}
          type="number"
          value={s[key]}
          onChange={(e) => updateCustomServingField(idx, key, e.target.value)}
          required={required}
          min="0"
          step="0.1"
          inputMode="decimal"
          className="h-9"
        />
      </div>
    );
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
                {REQUIRED_NUTRIENTS.map((n) => nutrientField(s, idx, n, true))}
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
                  {OPTIONAL_NUTRIENTS.map((n) => nutrientField(s, idx, n))}
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
          <Button type="button" size="sm" onClick={() => openPresetEditor()}>
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
                        onClick={() => deletePresetMutation.mutate(preset.id)}
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
          <ul className={LIST_CLASS}>
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
                      {p ? `Per ${servingSummary(p)}` : "FatSecret food"}
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
            <ul className={LIST_CLASS}>
              {customFoods.map((food) => (
                <FoodRow
                  key={food.id}
                  food={food}
                  showBrand={false}
                  onPick={() => pickFoodForPreset(storedFoodToChosen(food))}
                />
              ))}
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
      ? mealLabel
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
            <Button type="button" variant="outline" size="sm" onClick={startEditingGoals}>
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
              {GOAL_FIELDS.map(({ key, label, unit }) => (
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
              {GOAL_FIELDS.map(({ key, short, unit }) => (
                <div key={key} className="bg-muted rounded-lg p-2">
                  <p className="text-xs text-muted-foreground mb-0.5">{short}</p>
                  <p className="text-sm font-bold">
                    {goals[key] ?? "—"}
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
                            {item.quantity !== 1 ? `${item.quantity}× ` : ""}
                            {item.servingDesc ? `${item.servingDesc} · ` : ""}
                            {fmt(item.calories)} kcal · {fmt(item.protein, "g")} protein ·{" "}
                            {fmt(item.carbs, "g")} carbs · {fmt(item.fat, "g")} fat
                          </p>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            deleteMealMutation.mutate(item.id, {
                              onSuccess: () => toast.success("Entry removed"),
                            })
                          }
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
                {MACROS.map(({ key, unit, label }) => (
                  <div key={key}>
                    <p className={cn("text-2xl font-bold", key === "protein" && "text-primary")}>
                      {fmt(totals[key] || 0, unit)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
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
