import { z } from 'zod'

export const bookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  path: z.string(),
  format: z.string(),
  addedAt: z.number(),
  lastReadAt: z.number(),
  progress: z.number(),
  location: z.string(),
  cover: z.string(),
})

export const readerIpcSchema = {
  // 选择电子书文件(多选),返回绝对路径数组
  'reader-open-dialog': {
    args: z.tuple([]),
    return: z.array(z.string()),
  },
  // 读取文件字节,交给渲染层的 foliate-js / pdf.js
  'reader-read-file': {
    args: z.tuple([z.string()]),
    return: z.object({ name: z.string(), bytes: z.instanceof(Uint8Array) }),
  },

  // ---- 书库 ----
  'library-list': {
    args: z.tuple([]),
    return: z.array(bookSchema),
  },
  'library-upsert': {
    args: z.tuple([bookSchema]),
    return: bookSchema,
  },
  'library-remove': {
    args: z.tuple([z.string()]),
    return: z.boolean(),
  },
  'library-set-progress': {
    args: z.tuple([z.string(), z.number(), z.string()]),
    return: z.boolean(),
  },
}
