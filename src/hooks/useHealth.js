import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getHealthToday, updateActiveCalories } from "../lib/api.js";
import { queryKeys } from "./queryKeys.js";

export function useHealthToday(options = {}) {
  return useQuery({
    queryKey: queryKeys.health.today,
    queryFn: getHealthToday,
    ...options,
  });
}

export function useUpdateActiveCalories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ date, calories }) => updateActiveCalories(date, calories),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.health.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.all });
    },
  });
}
