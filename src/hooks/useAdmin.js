import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getUsers,
  getUserById,
  updateUser,
  resetUserPassword,
  deleteUser,
} from '../lib/api.js'
import { queryKeys } from './queryKeys.js'

export function useAdminUsers(options = {}) {
  return useQuery({
    queryKey: queryKeys.admin.users,
    queryFn: getUsers,
    ...options,
  })
}

export function useAdminUser(id, options = {}) {
  return useQuery({
    queryKey: queryKeys.admin.user(id),
    queryFn: () => getUserById(id),
    ...options,
    enabled: !!id && (options.enabled ?? true),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateUser(id, patch),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users })
      if (variables?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.user(variables.id) })
      }
    },
  })
}

// No invalidation: the password is not part of any cached user object, and
// the resulting server-side tokenVersion bump isn't surfaced through admin
// endpoints.
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }) => resetUserPassword(id, newPassword),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users })
    },
  })
}
