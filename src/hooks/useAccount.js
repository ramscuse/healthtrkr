import { useQuery } from "@tanstack/react-query";
import { getAccount } from "../lib/api.js";
import { queryKeys } from "./queryKeys.js";

export const useAccount = (options = {}) =>
  useQuery({ queryKey: queryKeys.account.all, queryFn: getAccount, ...options });
