import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccount, updateAccount } from "../lib/api.js";
import { queryKeys } from "./queryKeys.js";

export function useAccount(options = {}) {
  return useQuery({
    queryKey: queryKeys.account.all,
    queryFn: getAccount,
    ...options,
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => updateAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.account.all });
    },
  });
}
