import { useQuery, useMutation } from "@tanstack/react-query";
import { getUsers, updateUser, resetUserPassword, deleteUser } from "../lib/api.js";
import { useInvalidatingMutation } from "../lib/queryClient.js";
import { queryKeys } from "./queryKeys.js";

export const useAdminUsers = (options = {}) =>
  useQuery({ queryKey: queryKeys.admin.users, queryFn: getUsers, ...options });

export const useUpdateUser = () =>
  useInvalidatingMutation(({ id, patch }) => updateUser(id, patch), [queryKeys.admin.users]);

// No invalidation: passwords and tokenVersion aren't in any cached admin data.
export const useResetUserPassword = () =>
  useMutation({ mutationFn: ({ id, newPassword }) => resetUserPassword(id, newPassword) });

export const useDeleteUser = () => useInvalidatingMutation(deleteUser, [queryKeys.admin.users]);
