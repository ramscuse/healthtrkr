import { useQuery } from "@tanstack/react-query";
import {
  getWorkoutHistory,
  logWorkout,
  getCustomExercises,
  createCustomExercise,
  deleteCustomExercise,
  getWorkoutPresets,
  createWorkoutPreset,
  updateWorkoutPreset,
  deleteWorkoutPreset,
} from "../lib/api.js";
import { useInvalidatingMutation } from "../lib/queryClient.js";
import { queryKeys } from "./queryKeys.js";

const { workouts } = queryKeys;

export const useWorkoutHistory = (limit = 5, options = {}) =>
  useQuery({
    queryKey: workouts.history(limit),
    queryFn: () => getWorkoutHistory(limit),
    ...options,
  });

export const useCustomExercises = (options = {}) =>
  useQuery({ queryKey: workouts.customExercises, queryFn: getCustomExercises, ...options });

export const useWorkoutPresets = (options = {}) =>
  useQuery({ queryKey: workouts.presets, queryFn: getWorkoutPresets, ...options });

export const useLogWorkout = () =>
  useInvalidatingMutation(logWorkout, [workouts.diary, queryKeys.progress.all]);

export const useCreateCustomExercise = () =>
  useInvalidatingMutation(createCustomExercise, [workouts.customExercises]);

export const useDeleteCustomExercise = () =>
  useInvalidatingMutation(deleteCustomExercise, [workouts.customExercises]);

export const useCreateWorkoutPreset = () =>
  useInvalidatingMutation(createWorkoutPreset, [workouts.presets]);

export const useUpdateWorkoutPreset = () =>
  useInvalidatingMutation(({ id, data }) => updateWorkoutPreset(id, data), [workouts.presets]);

export const useDeleteWorkoutPreset = () =>
  useInvalidatingMutation(deleteWorkoutPreset, [workouts.presets]);
