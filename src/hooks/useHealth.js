import { updateActiveCalories } from "../lib/api.js";
import { useInvalidatingMutation } from "../lib/queryClient.js";
import { queryKeys } from "./queryKeys.js";

export const useUpdateActiveCalories = () =>
  useInvalidatingMutation(
    ({ date, calories }) => updateActiveCalories(date, calories),
    [queryKeys.progress.all]
  );
