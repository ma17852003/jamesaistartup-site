// ============================================================
// James Wu AI 帝國 — Command Center 資料層
// 從 CLAUDE.md + MEMORY.md 現況萃取（2026-07-20）
// ⚠️ 誠實可視化：pipeline 狀態反映真實，不美化
// 更新方式：直接改這個檔，重整頁面即可
// ============================================================

window.EMPIRE_DATA = {
  meta: {
    owner: "James Wu / 吳東戰",
    updated: "2026-10-27",
    tagline: "一人公司 · 85 位 AI 員工 · CEO 指揮中心",
    northStar: "造王者 90 天 10 台（幫老闆把 AI 員工建好裝進店裡）"
  },

  // ── 頂部戰情指標（真實 / 需 James 確認的用 note 標）──
  warRoom: [
    { label: "進行中專案", value: "6", unit: "條", tone: "active", note: "🟢全力推進級" },
    { label: "凍結 / 未激活", value: "10+", unit: "條", tone: "frozen", note: "誠實列示" },
    { label: "確定進帳 pipeline", value: "≈ 0", unit: "", tone: "danger", note: "乒乓 5萬做完即空（2026-07 現況）" },
    { label: "AI 員工", value: "37", unit: "位", tone: "neutral", note: "5 部門 + 營運支援 + 個人顧問（2026-07-27 名冊同步）" }
  ],

  // ── CEO 指揮層 ──
  command: [
    { code: "Elon",    role: "CEO", frame: "第一性原理", icon: "⚡", desc: "拆解任務·分派·重大決策·白癡指數", accent: "ceo" },
    { code: "Jobs",    role: "CEO 產品與品味", frame: "聚焦裁決", icon: "🍎", desc: "砍什麼·體驗回推·溢價正當性·發表會敘事", accent: "ceo" },
    { code: "Buffett", role: "CFO", frame: "資本配置", icon: "💰", desc: "機會成本·護城河·值不值得做", accent: "fin" },
    { code: "Jassy",   role: "CMO", frame: "飛輪設計", icon: "📣", desc: "北極星指標·客戶痴迷·成長飛輪", accent: "mkt" },
    { code: "Cook",    role: "CTO", frame: "系統整合", icon: "⚙️", desc: "技術架構·開發優先序·擴充性", accent: "dev" }
  ],

  // ── 五大部門 + 營運支援 + 個人顧問 ──
  departments: [
    {
      id: "dev", name: "開發團隊", head: "CTO Cook", icon: "⚙️", status: "running",
      statusLabel: "運轉中", accent: "#3B82F6",
      skillCoverage: 0.85,
      agents: [
        { code: "dev-team", role: "全端開發", frame: "—", note: "n8n·Claude API·Firebase·Flutter·Python·Node" },
        { code: "architect", role: "系統架構師（全元）", frame: "技術選型・跨模組設計", note: "全元專案層：只在 enterprise-automation-deploy 叫得到" },
        { code: "n8n-dev", role: "n8n 工程師（全元）", frame: "workflow・Code 節點", note: "全元專案層" },
        { code: "frontend-dev", role: "前端工程師（全元）", frame: "offline portal・手機表單", note: "全元專案層" },
        { code: "qa", role: "品保工程師（全元）", frame: "端對端・silent fail 偵測", note: "全元專案層" },
        { code: "devops", role: "部署工程師（全元）", frame: "docker-compose・NocoDB schema・tunnel", note: "全元專案層" }
      ],
      note: "主力產能來源；乒乓 WebApp、各 FOMO 系統、客戶部署都靠它"
    },
    {
      id: "mkt", name: "行銷團隊", head: "CMO Jassy", icon: "📣", status: "running",
      statusLabel: "運轉中", accent: "#10B981",
      skillCoverage: 0.9,
      agents: [
        { code: "marketing-director", role: "行銷總監", frame: "統籌", note: "協調所有子 agent" },
        { code: "trend-hunter", role: "熱點偵測員", frame: "—", note: "加密/水族/AI 三領域" },
        { code: "copywriter", role: "社群文案師", frame: "Naval / Miller", note: "Threads·IG·FB" },
        { code: "youtube-script", role: "YouTube 腳本師", frame: "MrBeast", note: "病毒式結構" },
        { code: "email-outreach", role: "開發信撰寫師", frame: "Hormozi", note: "B2B 陌生開發" },
        { code: "competitor-monitor", role: "競品監控員", frame: "—", note: "台灣同業 + 澳洲市場" },
        { code: "case-study-writer", role: "案例文章師", frame: "—", note: "B2B 開發案例" },
        { code: "report-builder", role: "報告整合員", frame: "—", note: "日報/週報彙整" },
        { code: "prompt-enhancer", role: "指令優化師", frame: "Anthropic", note: "口語→結構化 prompt" },
        { code: "marketing-team", role: "行銷團隊（總線）", frame: "—", note: "全元/YouTube/AIRA 內容產出" }
      ],
      note: "內容飛輪核心；YouTube 頻道是帝國引流母艦"
    },
    {
      id: "platform", name: "平台專家組", head: "CMO Jassy", icon: "📱", status: "running",
      statusLabel: "運轉中", accent: "#22D3EE",
      skillCoverage: 0.85,
      gate: "任何平台發文一律先過對應專家（管演算法語言，不搶主筆）",
      agents: [
        { code: "x-expert", role: "X 平台專家", frame: "x-algorithm", note: "內建開源權重表：回覆=10讚·複製連結=40讚·檢舉=−468讚" },
        { code: "threads-expert", role: "Threads 專家", frame: "AK-Booster", note: "指揮 10 個 Threads 技能；管兩個帳號" },
        { code: "ig-expert", role: "IG 專家", frame: "—", note: "Reels/輪播/限動三格式三 KPI" },
        { code: "fb-expert", role: "FB 專家", frame: "40 支 Reels 鉤子", note: "全元 SMB 獲客主場（社團策略）" },
        { code: "tiktok-expert", role: "TikTok 專家", frame: "開疆評估", note: "只做 YT 切片零成本分發；交易線不碰" },
        { code: "linkedin-expert", role: "LinkedIn 專家", frame: "—", note: "B2B 信任線；不發加密內容" }
      ],
      note: "2026-08-14 新設；戰略層歸 dankoe-media-director，日常協調走 marketing-director"
    },
    {
      id: "inv", name: "投資團隊", head: "投資執行長 Elon", icon: "📊", status: "running",
      statusLabel: "運轉中", accent: "#F59E0B",
      skillCoverage: 0.8,
      gate: "木頭姊 Cathie Wood（所有分析必經長線審視關卡）",
      agents: [
        { code: "investment-cathie-wood", role: "長線宏觀（必經關卡）", frame: "Cathie Wood", note: "⚠️ 顛覆性敘事審視" },
        { code: "investment-analyst", role: "首席分析師", frame: "—", note: "整合輸出日報" },
        { code: "investment-daytrader", role: "日內交易師", frame: "DMC / ICT", note: "BTC/ETH Kill Zone" },
        { code: "investment-altcoin", role: "山寨幣獵人", frame: "—", note: "MEXC 掃描" },
        { code: "investment-fx", role: "外匯連動分析師", frame: "—", note: "美元指數/宏觀" },
        { code: "investment-mexc", role: "MEXC 偵察員", frame: "—", note: "新幣熱度" },
        { code: "investment-risk", role: "風險長 CRO", frame: "—", note: "止損/倉位" },
        { code: "investment-ceo", role: "投資執行長", frame: "Elon", note: "統籌調度所有子分析師、最終決策" },
        { code: "investment-team", role: "投資團隊（總線）", frame: "—", note: "幣市日報·LINE/Discord 推播" },
        { code: "daytrading-master", role: "日內交易大師", frame: "FOMO 打法", note: "盤口物理學·裸K時間分型·訂單流；內建自家證偽檔案" },
        { code: "quant-validator", role: "量化驗證長（第二道閘）", frame: "五道關卡", note: "⚠️ 預設答案是「不通過」；20+ 策略只有 1 個過關" },
        { code: "ict-chart-analyst", role: "ICT 圖表分析師", frame: "SMC / ICT", note: "TradingView MCP 直連桌面板，直接把分析畫在圖上" },
        { code: "bubble-top-auditor", role: "泡沫頂部驗收官（崩盤預言登記與驗收）", frame: "判準先寫死＋全樣本基準率", note: "管 AITools_IPO_Watch 每日排程（巨型 IPO 上市自動記 B）；預設「估值定位，不是賣出扳機」；2026-10-06 新設" },
        { code: "flow-swing-expert", role: "資金波段專家", frame: "強弱資金＋劇本帳本", note: "3–14 天波段劇本；先登記才交件，每天 08:20 自動對答案；2026-10-28 新設" },
        { code: "swing-master", role: "波段交易大師", frame: "四層證據＋峰谷狀態機", note: "日線/4H 波段；日內大師姊妹位" },
        { code: "macro-cycle-officer", role: "長週期體制判定官", frame: "康波／債務長波", note: "預設「無法判定」；不做週期計數" },
        { code: "narrative-hunter", role: "敘事獵手", frame: "熱點→鏈上代幣", note: "四步；代幣真名解析最易錯" },
        { code: "camillo-mispricing-hunter", role: "錯位定價獵手", frame: "Camillo 社會套利", note: "三型 A看不到/B框架錯/C不信" },
        { code: "bottleneck-hunter", role: "瓶頸獵手", frame: "Serenity 九步", note: "供應鏈瓶頸小型股；登記後才對答案" },
      ],
      note: "FOMO 水族館內容 + 訊號系統背後的大腦；OI 報單已驗證會賺"
    },
    {
      id: "sales", name: "銷售 + 人脈", head: "Hormozi", icon: "🎯", status: "standby",
      statusLabel: "待命", accent: "#8B5CF6",
      skillCoverage: 0.6,
      agents: [
        { code: "alex-hormozi", role: "銷售狙擊手", frame: "Alex Hormozi", note: "Grand Slam Offer·定價·成交話術·讓報價本身值得說是" },
        { code: "email-outreach", role: "開發信撰寫師", frame: "Hormozi 框架", note: "B2B 陌生開發信" },
        { code: "keith-ferrazzi", role: "人際網絡師", frame: "Keith Ferrazzi", note: "關係資本" },
        { code: "sean-ellis", role: "成長駭客", frame: "Sean Ellis", note: "增長飛輪/A-B 測試" },
        { code: "david-spinks", role: "社群建造者", frame: "David Spinks", note: "FOMO 社群結構" },
        { code: "case-study-writer", role: "案例文章師", frame: "—", note: "共用" },
        { code: "crm-manager", role: "CRM 管線管理師", frame: "—", note: "NocoDB CRM base＋n8n 每日 09:00 跟進提醒；成交前管線" },
        { code: "sales-company", role: "客戶公司研究", frame: "—", note: "銷售研究五件組" },
        { code: "sales-competitive", role: "競爭情報", frame: "—", note: "銷售研究五件組" },
        { code: "sales-contacts", role: "聯絡人挖掘", frame: "—", note: "銷售研究五件組" },
        { code: "sales-opportunity", role: "商機評估", frame: "—", note: "銷售研究五件組" },
        { code: "sales-strategy", role: "銷售策略", frame: "—", note: "銷售研究五件組" }
      ],
      note: "pipeline 目前近乎枯竭（牙醫/蘇董/格棋/信義全斷）—— 待重啟開發"
    },
    {
      id: "brand", name: "品牌 + 內容", head: "Naval · Miller", icon: "🔮", status: "running",
      statusLabel: "運轉中", accent: "#06B6D4",
      skillCoverage: 0.75,
      agents: [
        { code: "dankoe-media-director", role: "自媒體總監", frame: "Dan Koe", note: "跨品牌內容戰略軍師＋審稿（造王者/YouTube/FOMO）；161 支影片知識庫" },
        { code: "naval", role: "個人品牌哲學家", frame: "Naval Ravikant", note: "Threads 深度貼文" },
        { code: "donald-miller", role: "品牌敘事師", frame: "StoryBrand", note: "銷售頁文案" },
        { code: "mrbeast", role: "內容導演", frame: "MrBeast", note: "選題/縮圖/鉤子" },
        { code: "steve-jobs", role: "產品魔法師", frame: "Steve Jobs", note: "產品體驗" },
        { code: "fomo-ta-creator", role: "技術分析師", frame: "—", note: "加密教學內容" },
        { code: "video-director", role: "影片導演（影片製作組組長）", frame: "HyperFrames＋Qwen3-TTS", note: "腳本→配音→對拍→動畫→渲染一條龍，交件前跑 qa_check（Q1–Q9），自己不發布；2026-10-06 新設" },
        { code: "visual-creator", role: "視覺生成師（影片製作組供料）", frame: "Ideogram 4", note: "本機免費生圖＋LTX 片段／SadTalker 對嘴（接影片導演的單）" },
        { code: "web-design-stylist", role: "網站風格設計師", frame: "Fable Five", note: "設計系統/Landing" },
        { code: "product-marketing-context", role: "品牌聲音守則", frame: "—", note: "全產品線調性" },
        { code: "viral-critic", role: "爆紅審查官", frame: "上架前最後閘門", note: "預設不過；扣分必附改法" },
        { code: "content-shipper", role: "內容出貨官", frame: "排程版 viral-critic", note: "publish_enabled 前的自動閘門" },
      ],
      note: "James 個人 IP + 各產品前端美學的把關者"
    }
  ],

  // ── 營運支援層（服務所有部門）＋ 記憶協調 ──
  ops: [
    { code: "swarm-coordinator", name: "蜂群指揮官", items: ["並行派工", "多視角同審", "成本閘門 N>6 先問", "去重彙整"] },
    { code: "knowledge-architect", name: "知識建築師", items: ["三層記憶治理", "Wiki 整理", "Obsidian 整合", "記憶工具評估"] },
    { code: "customer-success", name: "客戶成功經理", items: ["客戶健康度", "ROI 文件化", "90天回訪", "轉介紹系統"] },
    { code: "project-manager", name: "專案管理師 PMO", items: ["每日晨會", "健康檢查", "範疇蔓延守門", "優先序決策"] },
    { code: "data-analyst", name: "數據分析師", items: ["YouTube 分析", "顧問漏斗", "FOMO 留存", "時間 ROI"] },
    { code: "seo-specialist", name: "SEO 專家", items: ["關鍵字策略", "文章規劃", "競品排名", "月度報告"] },
    { code: "legal-advisor", name: "法務顧問", items: ["合約審查", "IP 保護", "FOMO 分潤合規", "台/澳法規"] },
    { code: "equity-structure-architect", name: "股權架構師", items: ["三層控制權", "台灣公司法翻譯", "澳洲 Pty Ltd", "算票不算股"] },
    { code: "finance-tax", name: "財務稅務顧問", items: ["現金流", "台/澳稅務", "產品線利潤", "30% 稅務預留"] },
    { code: "source-auditor", name: "外部素材解構官", items: ["論述稽核", "預測驗收", "手法拆解", "找死亡條件"] },
  ],

  // ── 個人知識顧問 ──
  personal: [
    { code: "research-scholar", name: "學術文獻研究員", frame: "OpenAlex/PubMed", note: "找論文查實證；OpenAlex·Unpaywall·arXiv·Europe PMC·PubMed 全免費合法" },
    { code: "serenity-advisor", name: "Serenity 顧問（美股 AI 供應鏈 KOL 研究）", frame: "X 推文存檔＋AI 多空標註", note: "每句引述附原文連結；對公平對照組無顯著選股力（p≈0.08）；2026-10-04 新設", st: "running" },
    { code: "senior-investment-advisor", name: "資深投資顧問", frame: "金融史事件研究", note: "22 條序列＋35 事件；數字當場算", st: "running" },
    { code: "oldwang-advisor", name: "老王 AI 顧問", frame: "台股・1198 支逐字稿", note: "每句引述跑檢索拿原話", st: "running" },
    { code: "special-advisor", name: "特別顧問", frame: "SMC/SNR・514 支", note: "加密合約外部打法研究", st: "running" },
    { code: "suozhang-advisor", name: "所長顧問", frame: "箱體中軸線・163 支", note: "主動糾正「他不是威科夫派」", st: "running" },
    { code: "dual-mentor-advisor", name: "雙師顧問", frame: "雙來源交叉・863 支", note: "獨門：量化教學 vs 實戰言行落差", st: "running" }
  ],

  // ── 產品線 Pipeline（誠實分級，反映 2026-07 現況）──
  pipeline: [
    { name: "全元科技顧問", tier: "green", model: "年收 2% + 0.01%", path: "enterprise-automation-deploy", note: "🟢 全力推進" },
    { name: "合力乒乓 WebApp", tier: "green", model: "NT$50,000 建置中", path: "合力乒乓專案", note: "🟢 做完即空，pipeline 見底" },
    { name: "YouTube 頻道", tier: "green", model: "內容飛輪", path: "Trump", note: "🟢 引流母艦" },
    { name: "造王者內容引擎", tier: "green", model: "AI 員工變現", path: "ai-tool-scout / brand-machine", note: "🟢 逆天改命戰略主軸" },
    { name: "FOMO 水族館", tier: "yellow", model: "NT$980/月 · 90天觀察", path: "Trump", note: "🟡 最低投入" },
    { name: "AIRA 邊緣 AI 引介", tier: "yellow", model: "成交抽 10%", path: "—", note: "🟡 被動等待" },
    { name: "AI 課程 / Skool / 澳洲 B2B", tier: "frozen", model: "等 YouTube 月均 5萬觀看", path: "—", note: "❄️ 冰凍" },
    { name: "牙醫 / 蘇董 / 格棋 / 信義", tier: "frozen", model: "B2B 案源", path: "各專案", note: "❄️ 2026-07 全斷" },
    { name: "HelpMe 醫療", tier: "dormant", model: "LINE Bot + Retell", path: "HelpMe", note: "💤 未激活" },
    { name: "CycleNav 投資 WebApp", tier: "dormant", model: "康波週期", path: "TradingView", note: "💤 未激活" },
    { name: "LevelMEUp", tier: "dormant", model: "遊戲化人生 RPG", path: "LevelMEUp", note: "💤 未激活" },
    { name: "Soul Architect", tier: "dormant", model: "數位遺產", path: "SoulArchitect", note: "💤 未激活" }
  ],

  // ── 專案 ↔ 用到哪些人 ↔ 待辦 ↔ 等 James 決定（來源：記憶系統）──
  projects: [
    { name:"合力乒乓 WebApp", tier:"green", room:"dev",
      agents:["dev-team","web-design-stylist"],
      todos:["建置收尾"], decisions:[],
      activity:"NT$50,000 建置中，做完 pipeline 見底" },
    { name:"全元科技顧問", tier:"green", room:"dev",
      agents:["dev-team","project-manager"],
      todos:["Sprint 1 開工"], decisions:["Sprint 1 排程拍板"],
      activity:"Sprint 1 待開始" },
    { name:"造王者內容引擎", tier:"green", room:"mkt",
      agents:["marketing-director","copywriter","trend-hunter","dankoe-media-director"],
      todos:["每日自動發文維運"], decisions:[],
      activity:"逆天改命戰略主軸" },
    { name:"月費殺手內容變現", tier:"green", room:"brand",
      agents:["youtube-script","copywriter","mrbeast","dankoe-media-director"],
      todos:["EP1 錄音"], decisions:["開真發佈","EP1 錄音排程"],
      activity:"待 James 開真發佈 + EP1 錄音" },
    { name:"品牌製造機 Brand Machine", tier:"green", room:"brand",
      agents:["copywriter","web-design-stylist","marketing-director"],
      todos:["影子模式 3 天"], decisions:["M8/M9：開真發佈+停舊"],
      activity:"待 James M8/M9" },
    { name:"BabyEats 寶寶餐廳雷達", tier:"green", room:"dev",
      agents:["dev-team","web-design-stylist"],
      todos:["Tunnel E2E 測試"], decisions:["給 Places API key","給 ACCESS_CODE"],
      activity:"等 James 給 key" },
    { name:"造王者 AI 能見度雷達", tier:"yellow", room:"dev",
      agents:["dev-team","seo-specialist"],
      todos:[], decisions:["給 keys/token","設 Tunnel","定價拍板"],
      activity:"待 James 給 keys / 定價" },
    { name:"妖島獵人懸賞平台", tier:"yellow", room:"sales",
      agents:["dev-team","email-outreach"],
      todos:[], decisions:["拍板活動包定價","給 LINE token"],
      activity:"五高管收斂：先賣再開發；待拍板" },
    { name:"市集數位集章活動包", tier:"yellow", room:"sales",
      agents:["dev-team","email-outreach","case-study-writer"],
      todos:["訪談 5 家拿訂金"], decisions:["拿到 NT$20K 訂金才開發"],
      activity:"先賣再做" },
    { name:"Reels AI 獲客助理", tier:"yellow", room:"brand",
      agents:["visual-creator","copywriter"],
      todos:["30 天日曆 + 單日腳本"], decisions:[],
      activity:"port 3500" },
    { name:"FOMO 內容引擎", tier:"yellow", room:"mkt",
      agents:["fomo-ta-creator","copywriter","legal-advisor"],
      todos:["法遵三道防線維運"], decisions:[],
      activity:"分潤隻字不提（法遵）" },
    { name:"台股 AI 操盤手", tier:"green", room:"inv",
      agents:["investment-analyst","investment-daytrader"],
      todos:["每日 20:30 pipeline 維運"], decisions:[],
      activity:"已上線外網" },
    { name:"FOMO_AI交易員(波賽冬)", tier:"green", room:"inv",
      agents:["investment-daytrader","investment-risk","dev-team"],
      todos:["forward test 盯騙炮K棒表現"], decisions:[],
      activity:"四態引擎+SMC騙炮 · ⚠️MEXC真倉live · 教練每日08:00覆盤" },
    { name:"AutoDM 自動私訊 + CRM", tier:"green", room:"dev",
      agents:["dev-team"],
      todos:["日報 09:30 維運"], decisions:[],
      activity:"LIVE" },
    { name:"FOMO 上架階梯雷達", tier:"yellow", room:"inv",
      agents:["investment-altcoin","fomo-ta-creator"],
      todos:["開工"], decisions:["排程確認"],
      activity:"待開工，只報訊號不下單" }
  ],

  tierMeta: {
    green:   { label: "🟢 全力推進", color: "#10B981" },
    yellow:  { label: "🟡 最低投入", color: "#F59E0B" },
    frozen:  { label: "❄️ 冰凍",     color: "#64748B" },
    dormant: { label: "💤 未激活",   color: "#475569" }
  }
};
