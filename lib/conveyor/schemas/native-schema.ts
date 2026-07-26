import { z } from 'zod'

/**
 * "摸鱼 / 隐蔽" 原生能力通道。
 * 这些全部是 Electron 主进程原生 API 的薄封装 —— 无需任何第三方依赖。
 * 对应墨鱼阅读里的:窗口透明度 / 老板键 / 截图录屏保护 / 置顶。
 */
export const nativeIpcSchema = {
  // 读取当前隐蔽状态(用于 UI 初始化)
  'native-get-state': {
    args: z.tuple([]),
    return: z.object({
      opacity: z.number(),
      alwaysOnTop: z.boolean(),
      contentProtection: z.boolean(),
      visible: z.boolean(),
    }),
  },

  // 窗口不透明度 [0.2, 1] —— "透明摸鱼"
  'native-set-opacity': {
    args: z.tuple([z.number().min(0.2).max(1)]),
    return: z.number(),
  },

  // 窗口置顶(screen-saver 级,浮在其它窗口之上)
  'native-set-always-on-top': {
    args: z.tuple([z.boolean()]),
    return: z.boolean(),
  },

  // 截图 / 录屏保护:开启后窗口对系统截图与录屏不可见
  'native-set-content-protection': {
    args: z.tuple([z.boolean()]),
    return: z.boolean(),
  },

  // 立即隐藏 / 显示(老板键的手动版)
  'native-toggle-visible': {
    args: z.tuple([]),
    return: z.boolean(),
  },

  // 自定义老板键快捷键(如 "Control+Shift+X");返回是否注册成功
  'native-set-boss-key': {
    args: z.tuple([z.string().min(1)]),
    return: z.boolean(),
  },

  // 老板键总开关(默认关):开启才注册全局快捷键
  'native-set-boss-key-enabled': {
    args: z.tuple([z.boolean()]),
    return: z.boolean(),
  },

  // 失焦自动隐藏(默认关):点到别的窗口即最小化,点任务栏图标恢复
  'native-set-auto-hide-on-blur': {
    args: z.tuple([z.boolean()]),
    return: z.boolean(),
  },
}
