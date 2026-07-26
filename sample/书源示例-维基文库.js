// @name 维基文库(示例书源)
//
// OpenRead 书源示例 —— 演示书源该怎么写。
// 目标站点是「中文维基文库」(zh.wikisource.org):收录公有领域 / 自由许可的文本,
// 且提供公开 API,用来做示例既合法又稳定。
//
// 一个书源就是一段 JS,实现下面这几个异步函数即可:
//   search(key, page)  搜索      -> 书籍数组
//   info(bookUrl)      详情      -> 单本书籍(可选;至少给出 tocUrl)
//   chapter(tocUrl)    目录      -> 章节数组
//   content(url)       正文      -> 文本字符串
//
// 运行时会注入这些工具:
//   Http(Get/Post/Head)、Cache、Cookie、parseHTMLSafely、removeHTMLTags、$(jQuery)、CryptoJS

const API = 'https://zh.wikisource.org/w/api.php'

async function getJSON(url) {
  const res = await new Http().Get(url, { 'User-Agent': 'OpenRead/1.0 (sample source)' })
  return JSON.parse(res.data)
}

/** 搜索:返回书籍数组 */
async function search(key, page) {
  const offset = ((page || 1) - 1) * 20
  const url =
    API +
    '?action=query&list=search&srsearch=' +
    encodeURIComponent(key) +
    '&srlimit=20&sroffset=' +
    offset +
    '&format=json&origin=*'
  const j = await getJSON(url)
  const list = (j.query && j.query.search) || []
  return list.map((it) => ({
    bookUrl: it.title, // 这里直接用条目标题当作书籍标识
    tocUrl: it.title,
    name: it.title,
    author: '维基文库',
    intro: removeHTMLTags(it.snippet || ''),
    coverUrl: '',
    type: 0,
  }))
}

/** 详情:示例里搜索结果已带 tocUrl,原样返回即可 */
async function info(bookUrl) {
  return { bookUrl: bookUrl, tocUrl: bookUrl, name: bookUrl, author: '维基文库' }
}

/** 目录:先找子页面(多章作品),没有就当作单篇全文 */
async function chapter(tocUrl) {
  const url =
    API + '?action=query&list=allpages&apprefix=' + encodeURIComponent(tocUrl + '/') + '&aplimit=500&format=json&origin=*'
  const j = await getJSON(url)
  const pages = (j.query && j.query.allpages) || []
  if (pages.length > 0) {
    return pages.map((p, i) => ({
      name: p.title.slice(tocUrl.length + 1) || p.title,
      url: p.title,
      chapterId: p.title,
      index: i,
    }))
  }
  return [{ name: '全文', url: tocUrl, chapterId: tocUrl, index: 0 }]
}

/** 正文:取页面 HTML,清成纯文本 */
async function content(url) {
  const api = API + '?action=parse&page=' + encodeURIComponent(url) + '&prop=text&format=json&origin=*'
  const j = await getJSON(api)
  const html = (j.parse && j.parse.text && j.parse.text['*']) || ''
  const doc = parseHTMLSafely(html)

  // 去掉编辑链接、目录框、参考等杂项
  doc.querySelectorAll('.mw-editsection, #toc, .toc, .reference, .navbox, table, style, script').forEach((el) => el.remove())

  const parts = []
  doc.querySelectorAll('p, h2, h3, blockquote, li').forEach((el) => {
    const t = (el.textContent || '').trim()
    if (t) parts.push(t)
  })
  const text = parts.join('\n\n').trim()
  return text || removeHTMLTags(html)
}
