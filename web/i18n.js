(() => {
  'use strict';
  const entities = {
    "阿卡丽": "Akali",
    "卡蜜尔": "Camille",
    "可酷伯": "Kobuko",
    "蕾欧娜": "Leona",
    "奥恩": "Ornn",
    "洛": "Rakan",
    "雷克塞": "Rek'Sai",
    "苍蓝哨戒": "Pebbles",
    "韦鲁斯": "Varus",
    "维迦": "Veigar",
    "霞": "Xayah",
    "约里克": "Yorick",
    "绯红树怪": "Cinderling",
    "卡尔玛": "Karma",
    "阿利斯塔": "Alistar",
    "凯特琳": "Caitlyn",
    "伊莉丝": "Elise",
    "凯尔": "Kayle",
    "乐芙兰": "LeBlanc",
    "瑟庄妮": "Sejuani",
    "慎": "Shen",
    "提莫": "Teemo",
    "沃里克": "Warwick",
    "芸阿娜": "Yunara",
    "魔沼蛙": "Gromp",
    "暗影狼": "Murkwolf",
    "峡谷迅捷蟹": "Scuttlecrab",
    "阿兹尔": "Azir",
    "卡西奥佩娅": "Cassiopeia",
    "黛安娜": "Diana",
    "赫卡里姆": "Hecarim",
    "卡兹克": "Kha'Zix",
    "易": "Master Yi",
    "拉莫斯": "Rammus",
    "雷恩加尔": "Rengar",
    "崔丝塔娜": "Tristana",
    "深红锋喙鸟": "Mama Beak",
    "费德提克": "Fiddlesticks",
    "克格莫": "Kog'Maw",
    "远古石甲虫": "Krug",
    "蔚": "Vi",
    "阿狸": "Ahri",
    "厄斐琉斯": "Aphelios",
    "伊泽瑞尔": "Ezreal",
    "莉莉娅": "Lillia",
    "墨菲特": "Malphite",
    "莫甘娜": "Morgana",
    "瑟提": "Sett",
    "希维尔": "Sivir",
    "索拉卡": "Soraka",
    "婕拉": "Zyra",
    "阿木木": "Amumu",
    "绯红印记树怪": "Brambleback",
    "奈德丽": "Nidalee",
    "苍蓝雕纹魔像": "Sentinel",
    "拉露恩": "Alune",
    "艾希": "Ashe",
    "远古巨龙": "Elder Dragon",
    "纳尔": "Gnar",
    "艾翁": "Ivern",
    "凯南": "Kennen",
    "拉克丝": "Lux",
    "茂凯": "Maokai",
    "德莱文": "Draven",
    "塔里克": "Taric",
    "顶级掠食者": "Apex Predator",
    "魔岩巨兽": "Monolith",
    "黑荆棘": "Blackthorn",
    "灵魂莲华": "Blossom",
    "帝王斑蝶": "Caustic",
    "魔女": "Coven",
    "日月双蚀": "Eclipse",
    "永恒之森": "Elderwood",
    "花仙子": "Fae",
    "翠神": "Greenfather",
    "地狱火": "Inferno",
    "月蚀骑士": "Lunar",
    "自然之力！大元素使": "Avatar",
    "远古树精": "Old Growth",
    "宿敌": "Rival",
    "日蚀骑士": "Solar",
    "约德尔人和朋友": "Sprykin",
    "荆棘之兴": "Thornmaiden",
    "月华神女": "Attuned",
    "赏金猎人": "Bounty Seeker",
    "宝石骑士": "Emerald Aspect",
    "绝命花妖": "Flora Fatalis",
    "野兽之灵": "Primal",
    "峡谷野怪": "Riftbeast",
    "魔战士": "Adaptor",
    "斗士": "Brawler",
    "护卫": "Defender",
    "裁决使": "Executioner",
    "猎人": "Hunter",
    "神谕": "Invoker",
    "迅捷射手": "Rapidfire",
    "狂战士": "Ravager",
    "法师": "Spellweaver",
    "召唤师": "Summoner",
    "重装战士": "Vanguard",
    "主宰": "Juggernaut"
  };
  const messages = {
    "正在计算：": "Calculating: ",
    "转职：": "Emblems: ",
    "羁绊天梯 / 拼盘天梯": "TFT Trait Ladder",
    "羁绊天梯 / 拼盘天梯 · S18": "TFT Trait Ladder · Set 18",
    "S18 羁绊天梯 / 拼盘天梯计算器": "A trait-ladder optimizer for TFT and Golden Spatula that ranks lineups by acquisition cost and plans Kha'Zix evolutions.",
    "S18 · 自然之力": "Set 18 · Enchanted Wilds",
    "首页": "Home",
    "载入中…": "Loading…",
    "取消计算": "Cancel calculation",
    "规则": "Rules",
    "规则 ?": "Rules ?",
    "本局设置": "Game settings",
    "重置": "Reset",
    "转职": "Emblems",
    "费用概率": "Shop odds by cost",
    "本局卡池": "Session pool",
    "已持有": "Owned",
    "＋ 弈子": "＋ Add unit",
    "禁卡表 ·": "Banned units ·",
    "禁卡表": "Banned units",
    "方案": "Lineups",
    "冠冕": "Tactician's Crowns",
    "冠冕数量": "Number of Tactician's Crowns",
    "人口等级": "Player level",
    "卡兹克进化次数": "Kha'Zix evolutions",
    "卡兹克进化方案": "Kha'Zix evolution plan",
    "确认进化": "Confirm evolutions",
    "正在计算": "Calculating",
    "已激活的羁绊": "Active traits",
    "候选阵容方案": "Candidate lineups",
    "羁绊": "Traits",
    "职业": "Classes",
    "种族羁绊": "Origins",
    "独特羁绊": "Unique traits",
    "算法说明": "How lineups are calculated",
    "当前人口排序": "Sort lineups at this level",
    "损失 ↑": "Loss ↑",
    "羁绊 ↓": "Traits ↓",
    "所有状态使用统一的损失阈值": "Every state uses the same loss threshold",
    "损失阈值": "Loss threshold",
    "阵容": "Lineup",
    "损失": "Loss",
    "导出 ↓": "Export ↓",
    "关闭": "Close",
    "名字 / 羁绊": "Name / trait",
    "弈子": "Unit",
    "自动": "Auto",
    "禁用": "Disabled",
    "选择转职": "Choose emblems",
    "✓ 已确认": "✓ Confirmed",
    "◷ 计算尚未完成": "◷ Calculation incomplete",
    "暂无方案": "No lineups available",
    "✓ 已证明最优": "✓ Proven optimal",
    "◷ 尚未证明最优": "◷ Optimality unproven",
    "计算线程异常": "The calculation worker encountered an error.",
    "计算未完成": "Calculation incomplete",
    "已取消": "Calculation cancelled",
    "进化锁定": "Kha'Zix is owned while evolutions are enabled.",
    "卡兹克已禁用": "Kha'Zix is banned.",
    "资料载入失败": "Unable to load game data.",
    "资料加载失败": "Unable to load game data.",
    "请选择有效的转职。": "Choose valid emblems.",
    "冠冕数量应为 0–3。": "The number of Tactician's Crowns must be between 0 and 3.",
    "人口应为 1–20。": "The lineup must use between 1 and 20 slots.",
    "请选择有效的商店等级。": "Choose a valid shop level.",
    "请选择有效的起始羁绊数。": "Choose a valid minimum trait count.",
    "螳螂进化选项无效。": "The Kha'Zix evolution selection is invalid.",
    "进化次数与本局记录冲突。": "The evolution count conflicts with this game's confirmed evolutions.",
    "禁用列表中包含未知弈子。": "The ban list contains an unknown unit.",
    "卡兹克的进化与禁用条件冲突。": "Kha'Zix cannot evolve while banned.",
    "已持有的弈子名称无效。": "The owned unit selection contains an unknown unit.",
    "继承卡池中包含未知弈子。": "The inherited pool contains an unknown unit.",
    "拉克丝只能拥有一种形态。": "Only one Lux form can be owned at a time.",
    "离池张数必须为非负整数。": "Removed copies must be a nonnegative integer.",
    "结果包含重复弈子或多种拉克丝。": "The result contains duplicate units or multiple Lux forms.",
    "当前条件与卡兹克进化冲突。": "The current settings conflict with Kha'Zix's evolutions.",
    "浏览器计算结果未通过人口或羁绊校验。": "The result failed the population or trait validation.",
    "结果违反宿敌条件。": "The result violates the Rival restriction.",
    "结果缺少已进化卡兹克。": "The result is missing the evolved Kha'Zix.",
    "进化次数校验失败。": "The result failed the evolution count validation.",
    "结果包含当前无法获取的弈子。": "The result contains an unavailable unit.",
    "价值目标未通过独立校验。": "The acquisition cost failed independent validation.",
    "最大羁绊目标未通过独立校验。": "The maximum trait count failed independent validation.",
    "矩阵记忆内容无效。": "The saved progression history is invalid.",
    "阵容人口应等于人口等级加冠冕数量。": "The lineup size must equal the player level plus the number of Tactician's Crowns.",
    "无效的方案排序方式。": "The lineup sort order is invalid.",
    "求解上限…": "Finding the maximum trait count…"
  };
  const copy = {
    "copy1": {
      "zh": "计算目标弈子的出现概率与获取成本",
      "en": "Calculating unit probabilities and acquisition costs"
    },
    "copy2": {
      "zh": "商店中的一个格子出现目标弈子的概率记为 <var>p</var>，按下式估计：",
      "en": "Let <var>p</var> denote the probability that one shop slot contains the target unit. We estimate it as follows:"
    },
    "copy3": {
      "zh": "其中，<var>a</var> 是当前等级抽到该费用的概率，<var>r</var> 是目标弈子的剩余张数，<var>R</var> 是同费用弈子的剩余总张数。对于拉克丝，模型假设各形态等概率出现，因而还需除以可选形态的数量。",
      "en": "Here, <var>a</var> is the probability of rolling the target cost tier at the current level, <var>r</var> is the number of remaining copies of the target unit, and <var>R</var> is the total number of remaining copies in that tier. For Lux, the model assumes that all available forms are equally likely, so this probability is also divided by the number of forms."
    },
    "copy4": {
      "zh": "根据上述概率，计算单独等待这张弈子出现所需的商店次数：",
      "en": "We then calculate the expected number of shops required to find this unit on its own:"
    },
    "copy5": {
      "zh": "其中，<var>q</var> 是一次商店至少出现一张目标弈子的概率，<var>d</var> 是单独等待它出现所需的期望商店次数。商店无法刷到目标弈子时，新的获取成本记为正无穷。已持有弈子的获取成本记为 <span class=\"numeric\">0</span>。",
      "en": "Here, <var>q</var> is the probability that a shop contains at least one copy of the target unit, and <var>d</var> is the expected number of shops needed to find it. A unit that cannot appear in the shop has an infinite acquisition cost. Owned units have an acquisition cost of <span class=\"numeric\">0</span>."
    },
    "copy6": {
      "zh": "在人口、冠冕和进化次数变化时继承已获取的弈子",
      "en": "Carrying acquired units across levels, crowns, and evolutions"
    },
    "copy7": {
      "zh": "计算按人口等级、冠冕数量和进化次数逐步展开。当前状态记为 (<var>L</var>, <var>C</var>, <var>E</var>)，其前置状态为：",
      "en": "Calculations advance through player levels, crown counts, and evolution counts. For the state (<var>L</var>, <var>C</var>, <var>E</var>), the predecessor states are:"
    },
    "copy8": {
      "zh": "其中，<var>L</var> 是人口等级，<var>C</var> 是冠冕数量，<var>E</var> 是卡兹克进化次数。计算采用坐标有效的前置状态。",
      "en": "Here, <var>L</var> is the player level, <var>C</var> is the number of crowns, and <var>E</var> is the number of Kha'Zix evolutions. Only predecessor states with valid coordinates are used."
    },
    "copy9": {
      "zh": "汇总这些前置状态中所有候选阵容曾使用的弈子，作为已获取卡池。当前状态使用这些弈子的获取成本记为 <span class=\"numeric\">0</span>，并重新组合阵容。",
      "en": "The acquired pool contains every unit used by any candidate lineup in these predecessor states. These units have an acquisition cost of <span class=\"numeric\">0</span> in the current state, where the lineup is optimized again."
    },
    "copy10": {
      "zh": "取消某个英雄的持有状态后，会撤销该英雄的历史获取记录，再重新计算它的获取成本。其它英雄的获取记录保留。",
      "en": "When a unit is marked as no longer owned, its historical acquisition records are cleared and its acquisition cost is recalculated. The records for other units are retained."
    },
    "copy11": {
      "zh": "为每个羁绊数量选择获取成本最低的阵容",
      "en": "Finding the lowest acquisition cost for each trait count"
    },
    "copy12": {
      "zh": "对每个可达到的羁绊数量，分别用整数规划选择获取成本之和最小的阵容。求解同时满足人口限制和羁绊激活条件。同成本时，优先使用已持有弈子。",
      "en": "For each attainable trait count, integer programming finds a lineup with the smallest sum of acquisition costs, subject to population limits and trait activation rules. Equal-cost solutions favor owned units."
    },
    "copy13": {
      "zh": "前两项相同时，按固定的弈子编号和进化职业名称顺序确定方案。",
      "en": "If both criteria are equal, a fixed order of unit IDs and evolution classes determines the lineup."
    },
    "copy14": {
      "zh": "卡兹克的进化职业与阵容共同求解，已确认的进化保留。",
      "en": "Kha'Zix's evolution classes are optimized together with the lineup. Confirmed evolutions are retained."
    },
    "copy15": {
      "zh": "使用统一的损失公式和阈值比较不同状态的方案",
      "en": "Comparing states with a shared loss formula and threshold"
    },
    "copy16": {
      "zh": "为使不同状态使用同一尺度，将阵容的获取成本换算为损失：",
      "en": "To compare all states on the same scale, the lineup's acquisition cost is converted to loss:"
    },
    "copy17": {
      "zh": "其中，<var>ℓ</var> 是损失，<var>D</var> 是阵容中各弈子的获取成本之和。当 <var>D</var> = <span class=\"numeric\">10</span> 时，任何状态的损失均为 <span class=\"numeric\">0.11</span>。",
      "en": "Here, <var>ℓ</var> is the loss and <var>D</var> is the sum of the units' acquisition costs. A cost of <var>D</var> = <span class=\"numeric\">10</span> gives a loss of <span class=\"numeric\">0.11</span> in every state."
    },
    "copy18": {
      "zh": "统一阈值由固定参考方案计算：先对损失取对数，再分成两组，使各数值与所在组平均值的平方差之和最小。两组平均值的中点经指数运算得到阈值 <output id=\"algorithmThreshold\">—</output>，超出时损失数值标红。",
      "en": "The shared threshold is calculated from a fixed reference set. Logarithmic losses are split into two groups to minimize the sum of squared distances from each group's mean. Exponentiating the midpoint of the two means gives the threshold <output id=\"algorithmThreshold\">—</output>. Losses above this threshold appear in red."
    },
    "copy19": {
      "zh": "计算假设搜卡期间的卡池保持不变，并将商店五个格子的抽取视为相互独立。同一商店可同时出现多张目标弈子，<var>D</var> 表示各张弈子单独等待次数之和。",
      "en": "The model assumes that the pool remains unchanged while searching and that the five shop slots are independent. Several target units can appear in the same shop; <var>D</var> is the sum of the waiting times for finding each unit separately."
    },
    "copy20": {
      "zh": "每获得一枚转职纹章，对应羁绊的计数便增加 1。这项加成作用于整个阵容。",
      "en": "Each emblem adds 1 to its corresponding trait count across the entire lineup."
    },
    "copy21": {
      "zh": "设置卡兹克的进化次数后，计算器会同时选择阵容和进化职业。点击“确认进化”后，所选职业会保存在本局记录中。点击已确认的羁绊图标，可以撤销该次进化，并使进化次数减少 1。点击“重置”会清除本局记录。",
      "en": "Set Kha'Zix's evolution count to calculate a lineup and evolution classes together. “Confirm evolutions” saves those classes for this game. Clicking a confirmed trait icon undoes that evolution and reduces the evolution count by 1. “Reset” clears the game's records."
    },
    "copy22": {
      "zh": "拉克丝会为所选形态对应的羁绊贡献 2 个计数。远古巨龙占用 2 个人口，并为峡谷野怪羁绊贡献 2 个计数。",
      "en": "Lux contributes 2 to the trait of her selected form. Elder Dragon occupies 2 population slots and contributes 2 to Riftbeast."
    },
    "copy23": {
      "zh": "计算器根据当前商店中各弈子的出现概率，为每套阵容计算一个损失值。较低的损失表示需要额外获取的弈子更容易找到。当方案损失超过统一阈值时，损失数值会标红，对应的方案行也会置灰。",
      "en": "Each lineup receives a loss based on the probabilities of finding its units in the current shop. Lower loss means the additional units are easier to acquire. When a lineup's loss exceeds the shared threshold, the loss appears in red and the lineup row is dimmed."
    },
    "copy24": {
      "zh": "在阵容、本局卡池和持有选择窗口中，彩色头像表示你已持有这张卡，灰色头像表示你尚未持有这张卡。在禁卡表中，彩色头像表示计算时允许使用该弈子，灰色头像表示计算时排除该弈子。",
      "en": "In lineups, the session pool, and the ownership picker, colored portraits represent owned units and gray portraits represent units you do not own. In the ban list, colored portraits represent allowed units and gray portraits represent excluded units."
    },
    "copy25": {
      "zh": "当方案标注“✓ 已证明最优”时，表示求解器已经证明该方案在当前计算条件下最优；当方案标注“◷ 尚未证明最优”时，表示求解器已经给出可行方案，但尚未完成最优性验证。",
      "en": "“✓ Proven optimal” means the solver has proved the lineup optimal under the current calculation conditions. “◷ Optimality unproven” means a feasible lineup is available and its optimality has yet to be proved."
    }
  };

  function detectLanguage(browser = {}) {
    const languages = Array.isArray(browser.languages) && browser.languages.length ? browser.languages : [browser.language];
    for (const language of languages) {
      if (typeof language !== 'string') continue;
      if (/^zh(?:-|$)/i.test(language)) return 'zh-CN';
      if (/^en(?:-|$)/i.test(language)) return 'en';
    }
    return 'en';
  }
  const locale = detectLanguage(globalThis.navigator);
  const reverse = new Map(Object.entries({ ...entities, ...messages }).map(([zh, en]) => [en, zh]));
  const searchAliases = { '斗士': ['Bruiser'], '法师': ['Arcanist'], '约德尔人和朋友': ['Yordle'] };
  function searchNames(name) {
    const form = /^拉克丝 \((.+)\)$/.exec(name);
    const english = entities[name] || (form ? 'Lux (' + entities[form[1]] + ')' : '');
    return [name, english, ...(searchAliases[name] || [])].filter(Boolean);
  }
  const quantity = (count, singular) => count + ' ' + singular + (Number(count) === 1 ? '' : 's');
  function translate(value) {
    const source = String(value ?? '');
    const text = source.trim();
    if (!text) return source;
    let result = text;
    if (locale === 'zh-CN') result = reverse.get(text.replaceAll('’', "'")) || text;
    else if (messages[text] || entities[text]) result = messages[text] || entities[text];
    else {
      let m;
      if ((m = /^拉克丝 \((.+)\)$/.exec(text))) result = 'Lux (' + translate(m[1]) + ')';
      else if ((m = /^任意(.+)$/.exec(text))) result = 'Any ' + translate(m[1]);
      else if ((m = /^共 (\d+) 枚转职纹章$/.exec(text))) result = quantity(m[1], 'emblem');
      else if ((m = /^(.+)纹章( × \d+)?$/.exec(text))) result = translate(m[1]) + ' Emblem' + (m[2] || '');
      else if ((m = /^转职：(.+)$/.exec(text))) result = 'Emblems: ' + translate(m[1]);
      else if ((m = /^(\d+) 级商店$/.exec(text))) result = 'Level ' + m[1] + ' shop';
      else if ((m = /^(\d+)费弈子$/.exec(text))) result = m[1] + '-cost units';
      else if ((m = /^(\d+)费$/.exec(text))) result = m[1] + '-cost';
      else if ((m = /^(\d+) 人口$/.exec(text))) result = quantity(m[1], 'slot');
      else if ((m = /^(\d+) 级(…)?$/.exec(text))) result = 'Level ' + m[1] + (m[2] || '');
      else if ((m = /^(\d+) 羁绊…$/.exec(text))) result = quantity(m[1], 'trait') + '…';
      else if ((m = /^已找到 (\d+) 羁绊$/.exec(text))) result = 'Found a lineup with ' + quantity(m[1], 'trait');
      else if ((m = /^当前设置下最高可能激活 (\d+) 羁绊$/.exec(text))) result = 'The current settings can activate at most ' + quantity(m[1], 'trait') + '.';
      else if ((m = /^当前设置下已找到可激活 (\d+) 羁绊的方案$/.exec(text))) result = 'A lineup with ' + quantity(m[1], 'active trait') + ' has been found under the current settings.';
      else if (text.endsWith('；✓ 已达到 14 羁绊。')) result = translate(text.slice(0, -'；✓ 已达到 14 羁绊。'.length)) + ' ✓ Reached 14 traits.';
      else if ((m = /^✓ 已完成 (\d+) 个人口等级的计算，共得到 (\d+) 套阵容方案。$/.exec(text))) result = '✓ Calculated ' + quantity(m[1], 'player level') + ' and found ' + quantity(m[2], 'lineup') + '.';
      else if ((m = /^◷ 已计算 (\d+) 个人口等级，共得到 (\d+) 套阵容方案；部分结果尚未证明最优。$/.exec(text))) result = '◷ Calculated ' + quantity(m[1], 'player level') + ' and found ' + quantity(m[2], 'lineup') + '; optimality verification is incomplete.';
      else if ((m = /^(\d+)羁绊，损失([\d.]+)(，较难获取组)?$/.exec(text))) result = quantity(m[1], 'trait') + ', loss ' + m[2] + (m[3] ? ', above the loss threshold' : '');
      else if ((m = /^(.+) · 点击撤销进化$/.exec(text))) result = translate(m[1]) + ' · Click to undo this evolution';
      else if ((m = /^撤销(.+)进化$/.exec(text))) result = 'Undo ' + translate(m[1]) + ' evolution';
      else if ((m = /^(增加|减少)(.+)纹章数量$/.exec(text))) result = (m[1] === '增加' ? 'Increase ' : 'Decrease ') + translate(m[2]) + ' emblem count';
      else if ((m = /^(.+)纹章数量$/.exec(text))) result = translate(m[1]) + ' emblem count';
      else if ((m = /^卡池中存在未知弈子：(.+)$/.exec(text))) result = 'Unknown unit in the pool: ' + translate(m[1]);
      else if ((m = /^(.+) 的离池张数超过卡池总量。$/.exec(text))) result = 'Removed copies exceed the pool size for ' + translate(m[1]) + '.';
      else if ((m = /^(\d+)级 \/ 冠冕(\d+) \/ 进化(\d+)(.*)$/.exec(text))) result = 'Level ' + m[1] + ' / Tactician’s Crowns ' + m[2] + ' / Kha’Zix evolutions ' + m[3] + (m[4] ? ' · ' + translate(m[4].slice(3)) : '');
      else if (text.includes(' / ')) result = text.split(' / ').map(translate).join(' / ');
      else if (text.includes(' · ')) result = text.split(' · ').map(translate).join(' · ');
    }
    return source.replace(text, locale === 'en' ? result.replaceAll('’', "'") : result);
  }
  function localize(root) {
    function visit(node) {
      if (node.nodeType === 3) { node.nodeValue = translate(node.nodeValue); return; }
      if (node.nodeType === 1) {
        if (['SCRIPT', 'STYLE'].includes(node.tagName)) return;
        for (const attribute of ['title', 'alt', 'aria-label', 'placeholder']) {
          if (node.hasAttribute(attribute)) node.setAttribute(attribute, translate(node.getAttribute(attribute)));
        }
        if (node.matches('meta[name="description"]')) node.setAttribute('content', translate(node.getAttribute('content')));
        if (node.dataset.copy) { node.innerHTML = copy[node.dataset.copy][locale === 'en' ? 'en' : 'zh']; return; }
      }
      [...node.childNodes].forEach(visit);
    }
    visit(root);
  }
  function html(markup) {
    const container = document.createElement('div');
    container.innerHTML = markup;
    localize(container);
    return container.innerHTML;
  }
  function setHTML(element, markup) { element.innerHTML = html(markup); }
  globalThis.TraitI18n = { locale, entities, messages, copy, detectLanguage, translate, searchNames, localize, html, setHTML };
})();
