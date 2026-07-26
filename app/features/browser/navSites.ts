export interface NavSite {
  name: string
  url: string
}

/** 分类推荐站点(仿墨鱼导航页)。点击直接在当前标签打开。 */
export const NAV_CATEGORIES: { key: string; label: string; sites: NavSite[] }[] = [
  {
    key: 'recommend',
    label: '推荐',
    sites: [
      { name: '微信读书', url: 'https://weread.qq.com' },
      { name: '番茄小说', url: 'https://fanqienovel.com' },
      { name: '七猫小说', url: 'https://www.qimao.com' },
      { name: '起点中文', url: 'https://www.qidian.com' },
      { name: '知乎', url: 'https://www.zhihu.com' },
      { name: '哔哩哔哩', url: 'https://www.bilibili.com' },
      { name: '抖音', url: 'https://www.douyin.com' },
      { name: '小红书', url: 'https://www.xiaohongshu.com' },
    ],
  },
  {
    key: 'novel',
    label: '小说',
    sites: [
      { name: '起点中文', url: 'https://www.qidian.com' },
      { name: '晋江文学', url: 'https://www.jjwxc.net' },
      { name: '纵横中文', url: 'https://www.zongheng.com' },
      { name: '番茄小说', url: 'https://fanqienovel.com' },
      { name: '七猫小说', url: 'https://www.qimao.com' },
      { name: '飞卢小说', url: 'https://www.faloo.com' },
    ],
  },
  {
    key: 'video',
    label: '视频',
    sites: [
      { name: '哔哩哔哩', url: 'https://www.bilibili.com' },
      { name: '抖音', url: 'https://www.douyin.com' },
      { name: '腾讯视频', url: 'https://v.qq.com' },
      { name: '爱奇艺', url: 'https://www.iqiyi.com' },
      { name: '优酷', url: 'https://www.youku.com' },
    ],
  },
  {
    key: 'study',
    label: '备考',
    sites: [
      { name: '粉笔网', url: 'https://www.fenbi.com' },
      { name: '中国大学MOOC', url: 'https://www.icourse163.org' },
      { name: '知乎', url: 'https://www.zhihu.com' },
    ],
  },
  {
    key: 'finance',
    label: '财经',
    sites: [
      { name: '东方财富', url: 'https://www.eastmoney.com' },
      { name: '雪球', url: 'https://xueqiu.com' },
      { name: '新浪财经', url: 'https://finance.sina.com.cn' },
    ],
  },
  {
    key: 'ai',
    label: 'AI',
    sites: [
      { name: '豆包', url: 'https://www.doubao.com' },
      { name: 'DeepSeek', url: 'https://chat.deepseek.com' },
      { name: 'Kimi', url: 'https://www.kimi.com' },
      { name: '元宝', url: 'https://yuanbao.tencent.com' },
    ],
  },
]
