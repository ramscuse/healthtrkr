import { useQuery } from "@tanstack/react-query";
import { getProgressSummary, getProgressWeekly, getProgressRange } from "../lib/api.js";
import { queryKeys } from "./queryKeys.js";

export function useProgressSummary(date, options = {}) {
  return useQuery({
    queryKey: queryKeys.progress.summary(date),
    queryFn: () => getProgressSummary(date),
    ...options,
    enabled: !!date && (options.enabled ?? true),
  });
}

export function useProgressWeekly(startDate, options = {}) {
  return useQuery({
    queryKey: queryKeys.progress.weekly(startDate),
    queryFn: () => getProgressWeekly(startDate),
    ...options,
    enabled: !!startDate && (options.enabled ?? true),
  });
}

export function useProgressRange(startDate, numDays, options = {}) {
  return useQuery({
    queryKey: queryKeys.progress.range(startDate, numDays),
    queryFn: () => getProgressRange(startDate, numDays),
    ...options,
    enabled: !!startDate && Number.isFinite(numDays) && numDays > 0 && (options.enabled ?? true),
  });
}
