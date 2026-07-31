(() => {
  "use strict";

  const normalizeBook = (book) => ({
    ...book,
    chapters: book.chapters.map(([chapterNo, title, sections], chapterIndex) => ({
      id: `${book.id}-c${String(chapterIndex + 1).padStart(2, "0")}`,
      chapterNo,
      title,
      sections: sections.map((section, sectionIndex) => ({
        id: `${book.id}-c${String(chapterIndex + 1).padStart(2, "0")}-s${String(sectionIndex + 1).padStart(2, "0")}`,
        title: section
      }))
    }))
  });

  const books = [
    {
      id: "pep-g8-1",
      stage: "初中",
      grades: ["八年级"],
      title: "八年级上册",
      publisher: "人民教育出版社",
      structureBasis: "人教版义务教育教科书物理目录",
      officialUrl: "https://www.pep.com.cn/products/jc/czjks/201510/t20151026_1250694.shtml",
      chapters: [
        ["第一章", "机械运动", ["长度和时间的测量", "运动的描述", "运动的快慢", "测量平均速度"]],
        ["第二章", "声现象", ["声音的产生与传播", "声音的特性", "声的利用", "噪声的危害和控制"]],
        ["第三章", "物态变化", ["温度", "熔化和凝固", "汽化和液化", "升华和凝华"]],
        ["第四章", "光现象", ["光的直线传播", "光的反射", "平面镜成像", "光的折射", "光的色散"]],
        ["第五章", "透镜及其应用", ["透镜", "生活中的透镜", "凸透镜成像的规律", "眼睛和眼镜", "显微镜和望远镜"]],
        ["第六章", "质量与密度", ["质量", "密度", "测量物质的密度", "密度与社会生活"]]
      ]
    },
    {
      id: "pep-g8-2",
      stage: "初中",
      grades: ["八年级"],
      title: "八年级下册",
      publisher: "人民教育出版社",
      structureBasis: "人教版义务教育教科书物理目录",
      officialUrl: "https://www.pep.com.cn/products/jc/czjks/201510/t20151026_1250782.shtml",
      chapters: [
        ["第七章", "力", ["力", "弹力", "重力"]],
        ["第八章", "运动和力", ["牛顿第一定律", "二力平衡", "摩擦力"]],
        ["第九章", "压强", ["压强", "液体的压强", "大气压强", "流体压强与流速的关系"]],
        ["第十章", "浮力", ["浮力", "阿基米德原理", "物体的浮沉条件及应用"]],
        ["第十一章", "功和机械能", ["功", "功率", "动能和势能", "机械能及其转化"]],
        ["第十二章", "简单机械", ["杠杆", "滑轮", "机械效率"]]
      ]
    },
    {
      id: "pep-g9",
      stage: "初中",
      grades: ["九年级"],
      title: "九年级全一册",
      publisher: "人民教育出版社",
      structureBasis: "人教版义务教育教科书物理目录",
      officialUrl: "https://www.pep.com.cn/products/jc/czjks/201510/t20151026_1250693.shtml",
      chapters: [
        ["第十三章", "内能", ["分子热运动", "内能", "比热容"]],
        ["第十四章", "内能的利用", ["热机", "热机的效率", "能量的转化和守恒"]],
        ["第十五章", "电流和电路", ["两种电荷", "电流和电路", "串联和并联", "电流的测量", "串、并联电路中电流的规律"]],
        ["第十六章", "电压　电阻", ["电压", "串、并联电路中电压的规律", "电阻", "变阻器"]],
        ["第十七章", "欧姆定律", ["电流与电压和电阻的关系", "欧姆定律", "电阻的测量", "欧姆定律在串、并联电路中的应用"]],
        ["第十八章", "电功率", ["电能　电功", "电功率", "测量小灯泡的电功率", "焦耳定律"]],
        ["第十九章", "生活用电", ["家庭电路", "家庭电路中电流过大的原因", "安全用电"]],
        ["第二十章", "电与磁", ["磁现象　磁场", "电生磁", "电磁铁　电磁继电器", "电动机", "磁生电"]],
        ["第二十一章", "信息的传递", ["现代顺风耳——电话", "电磁波的海洋", "广播、电视和移动通信", "越来越宽的信息之路"]],
        ["第二十二章", "能源与可持续发展", ["能源", "核能", "太阳能", "能源与可持续发展"]]
      ]
    },
    {
      id: "pep-h-required-1",
      stage: "高中",
      grades: ["高一", "高三"],
      title: "必修第一册",
      publisher: "人民教育出版社",
      structureBasis: "2019版人教高中物理教材知识结构",
      officialUrl: "https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517520664858048.pdf",
      chapters: [
        ["第一章", "运动的描述", ["质点和参考系", "时间和位移", "速度", "加速度"]],
        ["第二章", "匀变速直线运动的研究", ["速度与时间关系", "位移与时间关系", "速度与位移关系", "自由落体运动", "运动图像与实验"]],
        ["第三章", "相互作用——力", ["重力和弹力", "摩擦力", "牛顿第三定律", "力的合成和分解", "共点力平衡"]],
        ["第四章", "运动和力的关系", ["牛顿第一定律", "牛顿第二定律", "力学单位制", "牛顿运动定律的应用", "超重和失重"]]
      ]
    },
    {
      id: "pep-h-required-2",
      stage: "高中",
      grades: ["高一", "高三"],
      title: "必修第二册",
      publisher: "人民教育出版社",
      structureBasis: "2019版人教高中物理教材知识结构",
      officialUrl: "https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517520664858048.pdf",
      chapters: [
        ["第五章", "抛体运动", ["曲线运动", "运动的合成和分解", "平抛运动", "斜抛运动"]],
        ["第六章", "圆周运动", ["线速度和角速度", "向心加速度", "向心力", "生活中的圆周运动"]],
        ["第七章", "万有引力与宇宙航行", ["行星运动", "万有引力定律", "万有引力理论的成就", "宇宙航行", "相对论时空观"]],
        ["第八章", "机械能守恒定律", ["功和功率", "重力势能", "动能和动能定理", "机械能守恒", "验证机械能守恒实验"]]
      ]
    },
    {
      id: "pep-h-required-3",
      stage: "高中",
      grades: ["高二", "高三"],
      title: "必修第三册",
      publisher: "人民教育出版社",
      structureBasis: "2019版人教高中物理教材知识结构",
      officialUrl: "https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517520664858048.pdf",
      chapters: [
        ["第九章", "静电场及其应用", ["电荷", "库仑定律", "电场和电场强度", "静电的防止与利用"]],
        ["第十章", "静电场中的能量", ["电势能和电势", "电势差", "电势差与电场强度", "电容器和电容", "带电粒子在电场中的运动"]],
        ["第十一章", "电路及其应用", ["电源和电流", "导体的电阻", "伏安法与电阻率", "串联电路和并联电路", "多用电表"]],
        ["第十二章", "电能　能量守恒定律", ["电路中的能量转化", "闭合电路欧姆定律", "电源电动势和内阻实验", "能源与可持续发展"]],
        ["第十三章", "电磁感应与电磁波初步", ["磁场和磁感应强度", "磁通量", "电磁感应现象", "电磁波", "能量量子化"]]
      ]
    },
    {
      id: "pep-h-elective-1",
      stage: "高中",
      grades: ["高二", "高三"],
      title: "选择性必修第一册",
      publisher: "人民教育出版社",
      structureBasis: "2019版人教高中物理教材知识结构",
      officialUrl: "https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517520664858048.pdf",
      chapters: [
        ["第一章", "动量守恒定律", ["动量", "动量定理", "动量守恒定律", "碰撞", "反冲现象和火箭"]],
        ["第二章", "机械振动", ["简谐运动", "简谐运动的描述", "单摆", "受迫振动和共振"]],
        ["第三章", "机械波", ["波的形成", "波的描述", "波的反射和折射", "波的干涉", "多普勒效应"]],
        ["第四章", "光", ["光的折射", "全反射", "光的干涉", "双缝干涉实验", "光的衍射", "光的偏振和激光"]]
      ]
    },
    {
      id: "pep-h-elective-2",
      stage: "高中",
      grades: ["高二", "高三"],
      title: "选择性必修第二册",
      publisher: "人民教育出版社",
      structureBasis: "2019版人教高中物理教材知识结构",
      officialUrl: "https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517520664858048.pdf",
      chapters: [
        ["第一章", "安培力与洛伦兹力", ["安培力", "洛伦兹力", "带电粒子在匀强磁场中的运动", "质谱仪和回旋加速器"]],
        ["第二章", "电磁感应", ["楞次定律", "法拉第电磁感应定律", "涡流和电磁阻尼", "互感和自感"]],
        ["第三章", "交变电流", ["交变电流", "交变电流的描述", "变压器", "电能的输送"]],
        ["第四章", "电磁振荡与电磁波", ["电磁振荡", "电磁场与电磁波", "无线电波的发射和接收", "电磁波谱"]],
        ["第五章", "传感器", ["传感器及其元件", "常见传感器的应用", "传感器实验"]]
      ]
    },
    {
      id: "pep-h-elective-3",
      stage: "高中",
      grades: ["高二", "高三"],
      title: "选择性必修第三册",
      publisher: "人民教育出版社",
      structureBasis: "2019版人教高中物理教材知识结构",
      officialUrl: "https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517520664858048.pdf",
      chapters: [
        ["第一章", "分子动理论", ["分子动理论", "油膜法估测分子大小", "分子运动速率分布", "分子动能和分子势能"]],
        ["第二章", "气体、固体和液体", ["温度和温标", "气体的等温变化", "气体的等压与等容变化", "固体", "液体"]],
        ["第三章", "热力学定律", ["功、热和内能改变", "热力学第一定律", "能量守恒定律", "热力学第二定律"]],
        ["第四章", "原子结构和波粒二象性", ["黑体辐射和能量子", "光电效应", "原子的核式结构", "氢原子光谱和玻尔模型", "粒子的波动性"]],
        ["第五章", "原子核", ["原子核的组成", "放射性衰变", "核力与结合能", "核裂变和核聚变", "基本粒子"]]
      ]
    },
    {
      id: "review-h3",
      stage: "高中",
      grades: ["高三"],
      title: "高三综合复习",
      publisher: "课程标准综合模板",
      structureBasis: "跨必修与选择性必修模块组织，不对应单一教材册。",
      officialUrl: "https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517520664858048.pdf",
      chapters: [
        ["专题一", "力学综合", ["运动图像", "受力与动力学", "曲线和圆周运动", "功和能", "动量"]],
        ["专题二", "电磁学综合", ["静电场", "恒定电流", "磁场", "电磁感应", "交变电流"]],
        ["专题三", "热学综合", ["分子动理论", "气体实验定律", "热力学定律"]],
        ["专题四", "振动、波与光", ["机械振动", "机械波", "几何光学", "波动光学"]],
        ["专题五", "近代物理", ["光电效应", "原子结构", "原子核"]],
        ["专题六", "物理实验", ["基本仪器", "力学实验", "电学实验", "图像与误差分析"]]
      ]
    }
  ].map(normalizeBook);

  const sourceCatalog = [
    {
      id: "pep-junior-new-2024",
      title: "人教版义务教育物理（八～九年级）新教材介绍",
      provider: "人民教育出版社",
      stage: "初中",
      year: 2024,
      access: "官方教材信息",
      rightsStatus: "仅索引目录与教材说明",
      local: false,
      tags: ["教材", "人教版", "目录", "课程标准"],
      description: "人教社对新教材框架、章—节体例、练习与应用和复习与提高栏目所作的官方说明。",
      url: "https://www.pep.com.cn/xw/zt/hd/12/xjcjs/cz/202409/t20240925_1995627.html"
    },
    {
      id: "pep-g8-up-catalog",
      title: "人教版物理八年级上册目录",
      provider: "人民教育出版社",
      stage: "初中",
      year: 0,
      access: "官方教材目录",
      rightsStatus: "仅索引目录",
      local: false,
      tags: ["八年级", "教材", "章节"],
      description: "机械运动、声现象、物态变化、光现象、透镜及其应用、质量与密度的章—节目录。",
      url: "https://www.pep.com.cn/products/jc/czjks/201510/t20151026_1250694.shtml"
    },
    {
      id: "pep-g8-down-catalog",
      title: "人教版物理八年级下册目录",
      provider: "人民教育出版社",
      stage: "初中",
      year: 0,
      access: "官方教材目录",
      rightsStatus: "仅索引目录",
      local: false,
      tags: ["八年级", "教材", "章节"],
      description: "力、运动和力、压强、浮力、功和机械能、简单机械的章—节目录。",
      url: "https://www.pep.com.cn/products/jc/czjks/201510/t20151026_1250782.shtml"
    },
    {
      id: "pep-g9-catalog",
      title: "人教版物理九年级全一册目录",
      provider: "人民教育出版社",
      stage: "初中",
      year: 0,
      access: "官方教材目录",
      rightsStatus: "仅索引目录",
      local: false,
      tags: ["九年级", "教材", "章节"],
      description: "内能、热机、电路、欧姆定律、电功率、生活用电、电与磁、能源等章—节目录。",
      url: "https://www.pep.com.cn/products/jc/czjks/201510/t20151026_1250693.shtml"
    },
    {
      id: "moe-high-physics-standard",
      title: "普通高中物理课程标准（2017年版2020年修订）",
      provider: "中华人民共和国教育部",
      stage: "高中",
      year: 2020,
      access: "官方公开",
      rightsStatus: "按官方页面条款使用",
      local: false,
      tags: ["高中", "课程标准", "必修", "选择性必修"],
      description: "高中物理课程结构、必修与选择性必修内容要求的官方依据。",
      url: "https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517520664858048.pdf"
    },
    {
      id: "hunan-teaching-aid-review-2026",
      title: "湖南省2026年中小学教辅材料评议公告",
      provider: "湖南省教育厅",
      stage: "全部",
      year: 2026,
      access: "官方授权规则",
      rightsStatus: "仅索引政策；题目正文仍需取得相应授权",
      local: true,
      tags: ["初中", "高中", "物理", "教辅", "授权", "2026"],
      description: "公告将初高中物理同步练习和考试辅导纳入评议范围，并明确使用受著作权保护的教材等作品须依法取得授权。",
      url: "https://jyt.hunan.gov.cn/jyt/sjyt/xxgk/zcfg/flfg/202604/t20260408_1175938.html"
    },
    {
      id: "hunan-unified-middle-exam",
      title: "湖南省初中学业水平考试命题与实验考试说明",
      provider: "湖南省教育厅",
      stage: "初中",
      year: 2025,
      access: "官方考试信息",
      rightsStatus: "仅索引政策与考试范围",
      local: true,
      tags: ["中考", "实验", "统一命题", "长沙"],
      description: "说明物理采用笔试与实验操作相结合，以及全省统一命题等考试安排。",
      url: "https://jyt.hunan.gov.cn/jyt/sjyt/jyzbc/zbczcwj/syjx/202503/t20250303_33600695.html"
    },
    {
      id: "cnjy-mingde-g8-2026",
      title: "长沙市明德教育集团2025—2026学年八年级下期末物理",
      provider: "21世纪教育网",
      stage: "初中",
      year: 2026,
      access: "平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["八年级", "明德", "期末", "含答案"],
      description: "搜索结果标注为扫描版并含答案；应用仅保存来源入口，不自动复制正文。",
      url: "https://zy.21cnjy.com/26166315"
    },
    {
      id: "cnjy-zhounan-g8-2026",
      title: "长沙市周南梅溪湖中学2025—2026学年八年级上期末物理",
      provider: "21世纪教育网",
      stage: "初中",
      year: 2026,
      access: "平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["八年级", "周南梅溪湖", "期末", "解析"],
      description: "平台页面提供试题与解析信息；应用仅保存来源入口。",
      url: "https://zy.21cnjy.com/25436887"
    },
    {
      id: "cnjy-hnsdfz-middle-2026",
      title: "湖南师大附中集团2026年中考一模物理",
      provider: "21世纪教育网",
      stage: "初中",
      year: 2026,
      access: "平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["九年级", "中考一模", "师大附中", "含答案"],
      description: "平台页面标注扫描版、含答案；应用仅保存来源入口。",
      url: "https://zy.21cnjy.com/25348752"
    },
    {
      id: "cnjy-changjun-middle-2026",
      title: "长沙市长郡部分学校2026届中考考前预测物理",
      provider: "21世纪教育网",
      stage: "初中",
      year: 2026,
      access: "平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["九年级", "中考预测", "长郡", "含答案"],
      description: "平台页面标注试题含答案；应用仅保存来源入口。",
      url: "https://zy.21cnjy.com/25976554"
    },
    {
      id: "book118-yali-middle-2026",
      title: "长沙市雅礼中学集团2026年中考一模物理",
      provider: "原创力文档",
      stage: "初中",
      year: 2026,
      access: "文档平台题源",
      rightsStatus: "正文收录前需购买并核验转载授权",
      local: true,
      tags: ["九年级", "中考一模", "雅礼"],
      description: "文档平台预览入口；购买下载不当然等于取得再分发许可。",
      url: "https://max.book118.com/html/2026/0527/5120210041013221.shtm"
    },
    {
      id: "jiaoxi-changjun-high3-2026",
      title: "长郡中学2026届高三月考（二）物理",
      provider: "教习网",
      stage: "高中",
      year: 2026,
      access: "平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["高三", "长郡", "月考", "含答案"],
      description: "页面标注试题与答案文件；应用仅保存来源入口。",
      url: "https://www.51jiaoxi.com/doc-17422770.html"
    },
    {
      id: "kaosheng-changsha-high3-2026",
      title: "长沙市2026年高三模拟考试物理",
      provider: "考生网",
      stage: "高中",
      year: 2026,
      access: "公开页面",
      rightsStatus: "正文收录前需核验来源许可",
      local: true,
      tags: ["高三", "长沙市", "模拟考试", "答案"],
      description: "长沙高三模拟考试资料入口；下载与使用条件以网站实时提示为准。",
      url: "https://m.kaosheng.com/down/show.php?itemid=23950"
    },
    {
      id: "cnjy-changsha-high2-2026",
      title: "长沙市2025—2026学年高二下学期6月模拟物理",
      provider: "21世纪教育网",
      stage: "高中",
      year: 2026,
      access: "平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["高二", "长沙", "期末", "含答案"],
      description: "平台页面标注试卷及答案；应用仅保存来源入口。",
      url: "https://zy.21cnjy.com/25955883"
    },
    {
      id: "book118-kaifu-high2-2026",
      title: "长沙市开福区2025—2026学年高二下期末物理",
      provider: "原创力文档",
      stage: "高中",
      year: 2026,
      access: "文档平台题源",
      rightsStatus: "正文收录前需购买并核验转载授权",
      local: true,
      tags: ["高二", "开福区", "期末", "解析"],
      description: "文档平台预览入口；购买下载不当然等于取得再分发许可。",
      url: "https://max.book118.com/html/2026/0706/6031053151012154.shtm"
    },
    {
      id: "cnjy-zhiji-g8-midterm-2026",
      title: "湖南师大附中植基中学2025—2026学年八年级下期中物理",
      provider: "21世纪教育网",
      stage: "初中",
      year: 2026,
      access: "平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["八年级", "植基中学", "期中", "含答案"],
      description: "页面标注扫描版并含答案；应用保存来源入口，授权后可通过扫描件或文件导入。",
      url: "https://zy.21cnjy.com/25600576"
    },
    {
      id: "cnjy-changjun-12school-high3-2026",
      title: "长沙市长郡中学2026年四月12校第二次联考高三物理",
      provider: "21世纪教育网",
      stage: "高中",
      year: 2026,
      access: "平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["高三", "长郡", "十二校联考", "含解析"],
      description: "页面标注扫描版并含解析；应用仅保存入口与授权状态。",
      url: "https://zy.21cnjy.com/25439697"
    },
    {
      id: "zizzs-yali-high1-october-2025",
      title: "雅礼中学2025—2026学年高一10月质量检测物理",
      provider: "自主选拔在线",
      stage: "高中",
      year: 2025,
      access: "公开资料入口",
      rightsStatus: "正文收录前需核验平台或权利人许可",
      local: true,
      tags: ["高一", "雅礼", "月考", "答案"],
      description: "页面说明试题和参考答案已整理；具体领取与使用条件以页面实时提示为准。",
      url: "https://www.zizzs.com/gk/shitiku/209887.html"
    },
    {
      id: "dqw-yali-high1-midterm-2026",
      title: "雅礼中学2025—2026学年高一下期中物理",
      provider: "名校考试研题中心",
      stage: "高中",
      year: 2026,
      access: "文档平台题源",
      rightsStatus: "正文收录前需购买并核验转载授权",
      local: true,
      tags: ["高一", "雅礼", "期中", "解析版"],
      description: "页面列有物理原卷版和解析版；应用仅保存入口。",
      url: "https://www.dqwhtiku.com/docs/detail?fileId=2055126498431221762"
    },
    {
      id: "zktiku-changsha-no1-high2-final-2026",
      title: "长沙市第一中学2025—2026学年高二下期末物理",
      provider: "名校教研平台",
      stage: "高中",
      year: 2026,
      access: "文档平台题源",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["高二", "长沙市一中", "期末", "含答案"],
      description: "页面标注试题 PDF 含答案；应用仅保存可追溯入口。",
      url: "https://zktiku.com.cn/document/preview?fileDetailId=2070338833858437123"
    },
    {
      id: "kaosheng-changsha-group-high3-december-2026",
      title: "长沙市2026届集团联考高三上12月一模物理",
      provider: "考生网",
      stage: "高中",
      year: 2026,
      access: "公开资料入口",
      rightsStatus: "正文收录前需核验来源许可",
      local: true,
      tags: ["高三", "集团联考", "一模", "解析"],
      description: "页面说明含完整试卷、答案与解析；使用条件以网站实时提示为准。",
      url: "https://down.kaosheng.com/show.php?itemid=13551"
    },
    {
      id: "jiaoxi-changsha-no1-high1-midterm-2026",
      title: "长沙市第一中学2026年高一下期中物理资料包",
      provider: "教习网",
      stage: "高中",
      year: 2026,
      access: "平台资料包",
      rightsStatus: "正文收录前需取得平台或权利人许可",
      local: true,
      tags: ["高一", "长沙市一中", "期中", "答案解析"],
      description: "资料包页面列有高一下物理试卷及答案解析入口。",
      url: "https://www.51jiaoxi.com/pack-25335.html"
    },
    {
      id: "ks5u-hunan-physics-index-2026",
      title: "湖南高中物理2026年长沙试卷更新索引",
      provider: "高考资源网",
      stage: "高中",
      year: 2026,
      access: "持续更新索引",
      rightsStatus: "正文收录前需逐条核验平台或权利人许可",
      local: true,
      tags: ["高一", "高二", "高三", "长沙", "答案", "解析"],
      description: "索引页列有长沙市一中、长郡、雅礼、湖南师大附中等学校的物理试卷与答案或解析。",
      url: "https://www.ks5u.com/proks5u/pro-hun.shtml"
    }
  ];

  window.PHYSICS_CURRICULUM_TAXONOMY = Object.freeze({
    version: 1,
    verifiedAt: "2026-07-23",
    books: Object.freeze(books)
  });
  window.PHYSICS_SOURCE_CATALOG = Object.freeze(sourceCatalog);
})();
