import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWaterToday, getWaterEntries, logWater, deleteWaterEntry } from "../lib/api.js";
import { queryKeys } from "./queryKeys.js";

export function useWaterToday(options = {}) {
  return useQuery({
    queryKey: queryKeys.water.today,
    queryFn: getWaterToday,
    ...options,
  });
}

export function useWaterEntries(date, options = {}) {
  return useQuery({
    queryKey: queryKeys.water.byDate(date),
    queryFn: () => getWaterEntries(date),
    ...options,
    enabled: !!date && (options.enabled ?? true),
  });
}

export function useLogWater() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => logWater(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.water.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.all });
    },
  });
}

export function useDeleteWaterEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteWaterEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.water.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.all });
    },
  });
}
