import { useQuery } from "@tanstack/react-query";
import { getProgressSummary, getProgressWeekly, getProgressRange } from "../lib/api.js";
import { queryKeys } from "./queryKeys.js";

export const useProgressSummary = (date, options = {}) =>
  useQuery({
    queryKey: queryKeys.progress.summary(date),
    queryFn: () => getProgressSummary(date),
    ...options,
    enabled: !!date && (options.enabled ?? true),
  });

export const useProgressWeekly = (startDate, options = {}) =>
  useQuery({
    queryKey: queryKeys.progress.weekly(startDate),
    queryFn: () => getProgressWeekly(startDate),
    ...options,
    enabled: !!startDate && (options.enabled ?? true),
  });

export const useProgressRange = (startDate, numDays, options = {}) =>
  useQuery({
    queryKey: queryKeys.progress.range(startDate, numDays),
    queryFn: () => getProgressRange(startDate, numDays),
    ...options,
    enabled: !!startDate && Number.isFinite(numDays) && numDays > 0 && (options.enabled ?? true),
  });
