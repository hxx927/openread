import { z } from 'zod'

export const bookSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  code: z.string(),
  addedAt: z.number(),
})

export const sourceIpcSchema = {
  // ---- 书源管理 ----
  'source-list': { args: z.tuple([]), return: z.array(bookSourceSchema) },
  'source-add': { args: z.tuple([z.string(), z.string().optional()]), return: bookSourceSchema },
  'source-remove': { args: z.tuple([z.string()]), return: z.boolean() },
  'source-toggle': { args: z.tuple([z.string(), z.boolean()]), return: z.boolean() },
  // 选择本地 .js 书源文件导入,返回文件内容
  'source-open-file': { args: z.tuple([]), return: z.array(z.object({ name: z.string(), code: z.string() })) },
  // 从链接导入书源
  'source-add-url': { args: z.tuple([z.string()]), return: bookSourceSchema },
  // 书源运行时 preload 的 file:// 地址(渲染层建隐藏 webview 时用)
  'source-runtime-preload': { args: z.tuple([]), return: z.string() },

  // ---- 给书源运行时用的能力 ----
  'source-http': {
    args: z.tuple([
      z.object({
        url: z.string(),
        method: z.string().optional(),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.string().optional(),
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
  'source-cache-get': { args: z.tuple([z.string()]), return: z.string().nullable() },
  'source-cache-set': { args: z.tuple([z.string(), z.string()]), return: z.boolean() },
  'source-cache-remove': { args: z.tuple([z.string()]), return: z.boolean() },
}
