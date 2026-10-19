import { useQuery } from "@tanstack/react-query";
import {
  getMeals,
  searchFood,
  addMeal,
  deleteMeal,
  getCustomFoods,
  createCustomFood,
  updateCustomFood,
  deleteCustomFood,
  getPresets,
  createPreset,
  updatePreset,
  deletePreset,
  logPreset,
  getRecentFoods,
  getFavoriteFoods,
  addFavoriteFood,
  removeFavoriteFood,
} from "../lib/api.js";
import { useInvalidatingMutation } from "../lib/queryClient.js";
import { queryKeys } from "./queryKeys.js";

const { meals } = queryKeys;

export const useMeals = (date, options = {}) =>
  useQuery({
    queryKey: meals.byDate(date),
    queryFn: () => getMeals(date),
    ...options,
    enabled: !!date && (options.enabled ?? true),
  });

export const useCustomFoods = (options = {}) =>
  useQuery({ queryKey: meals.customFoods, queryFn: getCustomFoods, ...options });

export const useMealPresets = (options = {}) =>
  useQuery({ queryKey: meals.presets, queryFn: getPresets, ...options });

export const useRecentFoods = (mealType, options = {}) =>
  useQuery({
    queryKey: meals.recent(mealType),
    queryFn: () => getRecentFoods(mealType),
    ...options,
    enabled: !!mealType && (options.enabled ?? true),
  });

export const useFavoriteFoods = (mealType, options = {}) =>
  useQuery({
    queryKey: meals.favorites(mealType),
    queryFn: () => getFavoriteFoods(mealType),
    ...options,
    enabled: !!mealType && (options.enabled ?? true),
  });

// FatSecret search is rate-limited and stable: cache 5 min, min 2 chars.
export const useFoodSearch = (query, options = {}) =>
  useQuery({
    queryKey: meals.search(query),
    queryFn: () => searchFood(query),
    staleTime: 5 * 60_000,
    ...options,
    enabled: typeof query === "string" && query.length >= 2 && (options.enabled ?? true),
  });

// Diary writes refresh the logged day (every day when unknown, e.g. delete by
// id), progress aggregates, and recents (derived from logs). Never search or
// the foods/presets library.
const diaryKeys = (date) => [
  date ? meals.byDate(date) : meals.diary,
  queryKeys.progress.all,
  meals.recentAll,
];

export const useAddMeal = () => useInvalidatingMutation(addMeal, (v) => diaryKeys(v?.date));

export const useDeleteMeal = () => useInvalidatingMutation(deleteMeal, diaryKeys());

/** @param {{ presetId: string, date: string, mealType: string }} variables */
export const useLogPreset = () =>
  useInvalidatingMutation(
    ({ presetId, date, mealType }) => logPreset(presetId, { date, mealType }),
    (v) => diaryKeys(v?.date)
  );

export const useCreateCustomFood = () =>
  useInvalidatingMutation(createCustomFood, [meals.customFoods]);

export const useUpdateCustomFood = () =>
  useInvalidatingMutation(({ id, data }) => updateCustomFood(id, data), [meals.customFoods]);

export const useDeleteCustomFood = () =>
  useInvalidatingMutation(deleteCustomFood, [meals.customFoods]);

export const useAddFavoriteFood = () =>
  useInvalidatingMutation(addFavoriteFood, [meals.favoritesAll]);

export const useRemoveFavoriteFood = () =>
  useInvalidatingMutation(
    ({ foodId, mealType }) => removeFavoriteFood(foodId, mealType),
    [meals.favoritesAll]
  );

export const useCreateMealPreset = () => useInvalidatingMutation(createPreset, [meals.presets]);

export const useUpdateMealPreset = () =>
  useInvalidatingMutation(({ id, data }) => updatePreset(id, data), [meals.presets]);

export const useDeleteMealPreset = () => useInvalidatingMutation(deletePreset, [meals.presets]);
