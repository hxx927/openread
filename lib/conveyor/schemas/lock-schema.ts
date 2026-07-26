import { z } from 'zod'

export const lockIpcSchema = {
  'lock-status': {
    args: z.tuple([]),
    return: z.object({ enabled: z.boolean(), available: z.boolean() }),
  },
  'lock-set-pin': {
    args: z.tuple([z.string()]),
    return: z.boolean(),
  },
  'lock-verify': {
    args: z.tuple([z.string()]),
    return: z.boolean(),
  },
  'lock-disable': {
    args: z.tuple([z.string()]),
    return: z.boolean(),
  },
}
