import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMeals,
  searchFood,
  getFoodDetail,
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
} from '../lib/api.js'
import { queryKeys } from './queryKeys.js'

// Reads

export function useMeals(date, options = {}) {
  return useQuery({
    queryKey: queryKeys.meals.byDate(date),
    queryFn: () => getMeals(date),
    ...options,
    enabled: !!date && (options.enabled ?? true),
  })
}

export function useCustomFoods(options = {}) {
  return useQuery({
    queryKey: queryKeys.meals.customFoods,
    queryFn: getCustomFoods,
    ...options,
  })
}

export function useMealPresets(options = {}) {
  return useQuery({
    queryKey: queryKeys.meals.presets,
    queryFn: getPresets,
    ...options,
  })
}

// FatSecret search is rate-limited and results are stable; cache aggressively
// and require a minimum query length to avoid noise.
export function useFoodSearch(query, options = {}) {
  return useQuery({
    queryKey: queryKeys.meals.search(query),
    queryFn: () => searchFood(query),
    staleTime: 5 * 60_000,
    ...options,
    enabled:
      typeof query === 'string' &&
      query.length >= 2 &&
      (options.enabled ?? true),
  })
}

export function useFoodDetail(foodId, options = {}) {
  return useQuery({
    queryKey: queryKeys.meals.foodDetail(foodId),
    queryFn: () => getFoodDetail(foodId),
    staleTime: 5 * 60_000,
    ...options,
    enabled: !!foodId && (options.enabled ?? true),
  })
}

// Mutations
// Daily meal writes invalidate `meals.diary` (covering byDate for every date)
// and `progress.all` (summary/weekly/range aggregates). They do NOT touch the
// FatSecret search cache or the custom-foods/presets library.

export function useAddMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => addMeal(data),
    onSuccess: (_, variables) => {
      const date = variables?.date
      if (date) {
        queryClient.invalidateQueries({ queryKey: queryKeys.meals.byDate(date) })
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.meals.diary })
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.all })
    },
  })
}

export function useDeleteMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    // We don't know the deleted meal's date from `id` alone, so invalidate
    // the whole diary sub-tree (cheap — typically only the active day is
    // cached).
    mutationFn: (id) => deleteMeal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.diary })
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.all })
    },
  })
}

/** @param {{ presetId: string, date: string, mealType: string }} variables */
export function useLogPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ presetId, date, mealType }) =>
      logPreset(presetId, { date, mealType }),
    onSuccess: (_, variables) => {
      const date = variables?.date
      if (date) {
        queryClient.invalidateQueries({ queryKey: queryKeys.meals.byDate(date) })
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.meals.diary })
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.all })
    },
  })
}

export function useCreateCustomFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => createCustomFood(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.customFoods })
    },
  })
}

export function useUpdateCustomFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => updateCustomFood(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.customFoods })
    },
  })
}

export function useDeleteCustomFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => deleteCustomFood(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.customFoods })
    },
  })
}

export function useCreateMealPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => createPreset(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.presets })
    },
  })
}

export function useUpdateMealPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => updatePreset(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.presets })
    },
  })
}

export function useDeleteMealPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => deletePreset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.presets })
    },
  })
}
