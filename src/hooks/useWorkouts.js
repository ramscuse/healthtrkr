import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWorkouts,
  getWorkoutHistory,
  getWorkoutTemplate,
  logWorkout,
  getCustomExercises,
  createCustomExercise,
  deleteCustomExercise,
  getWorkoutPresets,
  createWorkoutPreset,
  updateWorkoutPreset,
  deleteWorkoutPreset,
} from "../lib/api.js";
import { queryKeys } from "./queryKeys.js";

// Reads

export function useWorkouts(date, options = {}) {
  return useQuery({
    queryKey: queryKeys.workouts.byDate(date),
    queryFn: () => getWorkouts(date),
    ...options,
    enabled: !!date && (options.enabled ?? true),
  });
}

export function useWorkoutHistory(limit = 5, options = {}) {
  return useQuery({
    queryKey: queryKeys.workouts.history(limit),
    queryFn: () => getWorkoutHistory(limit),
    ...options,
  });
}

// Static config endpoint (public) — fetch once and keep. Lives outside the
// diary sub-prefix so workout writes don't refetch it.
export function useWorkoutTemplate(options = {}) {
  return useQuery({
    queryKey: queryKeys.workouts.template,
    queryFn: getWorkoutTemplate,
    staleTime: Infinity,
    ...options,
  });
}

export function useCustomExercises(options = {}) {
  return useQuery({
    queryKey: queryKeys.workouts.customExercises,
    queryFn: getCustomExercises,
    ...options,
  });
}

export function useWorkoutPresets(options = {}) {
  return useQuery({
    queryKey: queryKeys.workouts.presets,
    queryFn: getWorkoutPresets,
    ...options,
  });
}

// Mutations

export function useLogWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => logWorkout(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.diary });
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.all });
    },
  });
}

export function useCreateCustomExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => createCustomExercise(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.customExercises });
    },
  });
}

export function useDeleteCustomExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteCustomExercise(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.customExercises });
    },
  });
}

export function useCreateWorkoutPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => createWorkoutPreset(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.presets });
    },
  });
}

export function useUpdateWorkoutPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateWorkoutPreset(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.presets });
    },
  });
}

export function useDeleteWorkoutPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteWorkoutPreset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.presets });
    },
  });
}
