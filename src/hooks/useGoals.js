import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getGoals, updateGoals } from '../lib/api.js'
import { queryKeys } from './queryKeys.js'

export function useGoals(options = {}) {
  return useQuery({
    queryKey: queryKeys.goals.all,
    queryFn: getGoals,
    ...options,
  })
}

export function useUpdateGoals() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => updateGoals(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all })
    },
  })
}
