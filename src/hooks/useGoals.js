import { useQuery } from "@tanstack/react-query";
import { getGoals, updateGoals } from "../lib/api.js";
import { useInvalidatingMutation } from "../lib/queryClient.js";
import { queryKeys } from "./queryKeys.js";

export const useGoals = (options = {}) =>
  useQuery({ queryKey: queryKeys.goals.all, queryFn: getGoals, ...options });

export const useUpdateGoals = () => useInvalidatingMutation(updateGoals, [queryKeys.goals.all]);
