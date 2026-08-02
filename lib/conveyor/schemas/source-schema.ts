import { z } from 'zod'

const sourceIdSchema = z.string().regex(/^src-[a-zA-Z0-9_-]{1,120}$/, '无效的书源 ID')
const sourceNameSchema = z.string().max(200)
const sourceCodeSchema = z.string().max(4 * 1024 * 1024)
const sourceUrlSchema = z.string().min(1).max(8_192)
const sourceHeadersSchema = z
  .record(z.string().max(256), z.string().max(16 * 1024))
  .refine(
    (headers) =>
      Object.entries(headers).reduce((size, [name, value]) => size + name.length + value.length, 0) <= 64 * 1024,
    '请求头过大'
  )

export const bookSourceSchema = z.object({
  id: sourceIdSchema,
  name: sourceNameSchema,
  enabled: z.boolean(),
  code: sourceCodeSchema,
  kind: z.enum(['js', 'html']).default('js'),
  addedAt: z.number(),
})

const sourcePatchSchema = z.object({
  name: sourceNameSchema.optional(),
  enabled: z.boolean().optional(),
  code: sourceCodeSchema.optional(),
  kind: z.enum(['js', 'html']).optional(),
})

export const sourceIpcSchema = {
  // ---- 书源管理 ----
  'source-list': { args: z.tuple([]), return: z.array(bookSourceSchema) },
  'source-add': {
    args: z.tuple([sourceCodeSchema, sourceNameSchema.optional()]),
    return: z.array(bookSourceSchema),
  },
  'source-update': {
    args: z.tuple([sourceIdSchema, sourcePatchSchema]),
    return: bookSourceSchema.nullable(),
  },
  'source-move': {
    args: z.tuple([sourceIdSchema, z.enum(['top', 'bottom', 'up', 'down'])]),
    return: z.boolean(),
  },
  'source-remove': { args: z.tuple([sourceIdSchema]), return: z.boolean() },
  'source-toggle': { args: z.tuple([sourceIdSchema, z.boolean()]), return: z.boolean() },
  'source-open-file': {
    args: z.tuple([]),
    return: z.array(z.object({ name: sourceNameSchema, code: sourceCodeSchema })),
  },
  'source-add-url': { args: z.tuple([sourceUrlSchema]), return: z.array(bookSourceSchema) },
  'source-runtime-preload': { args: z.tuple([]), return: z.string() },

  // ---- 登录 / 会话 ----
  'source-auth-status': {
    args: z.tuple([sourceIdSchema]),
    return: z.object({ hasCredentials: z.boolean(), persistentAvailable: z.boolean() }),
  },
  'source-auth-get': { args: z.tuple([sourceIdSchema]), return: z.string().max(256 * 1024) },
  'source-auth-set': {
    args: z.tuple([sourceIdSchema, z.string().max(256 * 1024)]),
    return: z.object({ saved: z.boolean(), persistent: z.boolean() }),
  },
  'source-auth-clear': { args: z.tuple([sourceIdSchema]), return: z.boolean() },
  'source-open-login': { args: z.tuple([sourceIdSchema, sourceUrlSchema]), return: z.boolean() },
  'source-session-clear': { args: z.tuple([sourceIdSchema]), return: z.boolean() },

  // ---- runtime 能力 ----
  'source-cover': {
    args: z.tuple([sourceIdSchema, sourceUrlSchema]),
    return: z.string().max(48 * 1024 * 1024),
  },
  'source-http': {
    args: z.tuple([
      z.object({
        sourceId: sourceIdSchema,
        url: sourceUrlSchema,
        method: z.string().max(32).optional(),
        headers: sourceHeadersSchema.optional(),
        body: z
          .string()
          .max(8 * 1024 * 1024)
          .optional(),
        followRedirects: z.boolean().optional(),
      }),
    ]),
    return: z.object({
      statusCode: z.number(),
      headers: z.record(z.string(), z.string()),
      body: z.string(),
      data: z.string(),
      url: z.string(),
    }),
  },
  'source-cookie-get': {
    args: z.tuple([sourceIdSchema, sourceUrlSchema]),
    return: z.string().max(64 * 1024),
  },
  'source-cookie-get-one': {
    args: z.tuple([sourceIdSchema, sourceUrlSchema, z.string().max(1_024)]),
    return: z.string().max(64 * 1024),
  },
  'source-cookie-set': {
    args: z.tuple([sourceIdSchema, sourceUrlSchema, z.string().max(64 * 1024)]),
    return: z.boolean(),
  },
  'source-cookie-set-one': {
    args: z.tuple([sourceIdSchema, sourceUrlSchema, z.string().max(1_024), z.string().max(64 * 1024)]),
    return: z.boolean(),
  },
  'source-cookie-remove': {
    args: z.tuple([sourceIdSchema, sourceUrlSchema]),
    return: z.boolean(),
  },
  'source-cache-get': {
    args: z.tuple([z.string().max(8_192)]),
    return: z
      .string()
      .max(8 * 1024 * 1024)
      .nullable(),
  },
  'source-cache-set': {
    args: z.tuple([z.string().max(8_192), z.string().max(8 * 1024 * 1024)]),
    return: z.boolean(),
  },
  'source-cache-remove': { args: z.tuple([z.string().max(8_192)]), return: z.boolean() },
}
