import { useQuery } from "@tanstack/react-query";
import { getWaterToday, getWaterEntries, logWater, deleteWaterEntry } from "../lib/api.js";
import { useInvalidatingMutation } from "../lib/queryClient.js";
import { queryKeys } from "./queryKeys.js";

const waterKeys = [queryKeys.water.all, queryKeys.progress.all];

export const useWaterToday = (options = {}) =>
  useQuery({ queryKey: queryKeys.water.today, queryFn: getWaterToday, ...options });

export const useWaterEntries = (date, options = {}) =>
  useQuery({
    queryKey: queryKeys.water.byDate(date),
    queryFn: () => getWaterEntries(date),
    ...options,
    enabled: !!date && (options.enabled ?? true),
  });

export const useLogWater = () => useInvalidatingMutation(logWater, waterKeys);
export const useDeleteWaterEntry = () => useInvalidatingMutation(deleteWaterEntry, waterKeys);
