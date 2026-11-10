# 网页计算器与 GitHub Pages

`web/` 可直接发布到 GitHub Pages。浏览器通过 Worker 计算，英雄头像、羁绊及转职图标使用外部图片链接。选择和本局记录保存在 localStorage。

网页提供英文和简体中文。按浏览器的语言偏好顺序选择首个中文或英文；没有匹配项时默认英文。英文仓库名建议为 `tft-trait-ladder`，英文简介见 [README](../README.md)。语言识别、翻译和本局记录的关系见[语言说明](localization.md)。

## 本地开发

```bash
npm run dev
```

打开 `http://localhost:8000`。服务监测 Python、数据、网页文件的修改，自动重载后端并刷新页面。使用 VS Code 远程工作区时，在“端口”面板转发 8000。可通过 `npm run dev -- --port 8080` 更换端口。

静态预览可运行 `python -m http.server 8000 --directory web`。`python scripts/build_standalone.py` 生成内嵌脚本和数据的 `results/traitladder-preview.html`，图片继续使用外链。

## 操作

- 方案区依次为冠冕、人口等级、卡兹克进化次数，使用相同的横排数字单选。冠冕为 0–3，商店等级随人口等级，阵容栏位等于人口等级加冠冕数量。
- 每种转职可通过上下箭头设置 0–9 枚，全部设为 0 表示没有转职。弹窗内修改数量后，关闭时统一计算；数量保持原样时沿用已有结果。重复纹章的数量随本局保存。其他条件变化自动计算；连续变化合并到 250 毫秒后执行，旧计算会被取消。
- 数量选择器与选择项右侧边框对齐，上箭头、数字和下箭头纵向排列。转职选择、已激活列表、角色卡图标、拉克丝形态和进化职业共用先羁绊、后职业的目录顺序。
- 英雄头像保持 1∶1，阵容名称条高 32 像素。阵容列表通常每行 5 张卡，手机为 4 张；选择弹窗通常为 4 列，手机为 3 列。英文转职弹窗在桌面为 3 列、手机为 2 列。窄于 390 像素时，中英文转职弹窗均为 2 列，英文选项中的图标位于名称上方。卡片高度由头像和文字区共同确定。
- 每个人口分别保留“损失 ↑”或“羁绊 ↓”排序。排序直接使用已有结果，只改变显示顺序；默认选中仍取“损失 ↑”首项。点选方案按完整人口等级、冠冕、进化坐标保存；重复访问恢复该格点选。不同羁绊数损失相同时，羁绊更多的方案优先。同一羁绊数内，求解器在同成本时优先实际持有牌，继承牌不计作实际持有。
- 重新计算期间，阵容、已激活羁绊和候选方案区域保留原来的高度，以覆盖层显示计算状态，并暂停旧结果的交互。新结果返回后，三个区域一次性更新并恢复自然高度。已完成的人口从缓存直接显示；取消和计算失败各自显示对应状态。
- 通过阵容头像切换持有状态时，阵容保持可见并允许继续点击，其余结果区域显示计算提示。头像颜色立即同步，连续点击合并到最后一次计算，返回结果后再更新阵容。
- 计算完成后，外观没有变化的卡片与图片保持原位，持有颜色和损失分别更新。“任意羁绊”的可选弈子在点击时读取最新计算结果。
- 损失较高的方案的灰色行和红字使用固定的全局损失阈值，所有状态共用同一标准，方法见[算法说明](algorithm.md)。头像灰色表示尚未持有；禁卡表中表示已禁用。
- 卡兹克进化次数使用 0–4 单选框。求解器联合选择职业和阵容；查看方案后“确认进化”将职业记入本局。随后计算保留这些职业，并优化新增次数。点击已确认的羁绊图标可逐项撤销进化，同时将进化次数减 1，并重新计算。
- “本局卡池”位于桌面侧栏，用于标记已持有的弈子；卡按费用分组，点击头像切换持有状态。进化记录、持有标记、禁卡表、卡池、各状态点选及矩阵记忆在刷新页面后保留，“重置”开始新一局。
- 手机页面依次展示本局设置、人口与进化设置、当前阵容、对应羁绊、候选方案、本局卡池，各区保持展开。平板将羁绊放在当前阵容与候选方案之间。
- “任意xx”可点击查看同费用或更低费用的候选卡，并修改持有标记。关闭弹窗时统一提交，持有状态改变后重新计算。普通角色卡在阵容中点击即可切换持有状态，并重新计算。
- 拉克丝形态在首页用彩色羁绊图标单选。持有选择、本局卡池和禁卡表各显示一个拉克丝头像；指定形态后，头像附带对应的彩色羁绊角标，自动或禁用时显示基础头像。持有状态统一按拉克丝记录，指定形态后该形态的获取成本为零；自动时求解器比较各形态。旧版持有记录会迁移到形态设置中。禁卡表默认亮色，点击后变灰；禁卡会撤销持有标记并重新计算递推依赖。

14 层以结果中的达成标记展示。条件分支见[裁决转 14 层资料](ladder14.md)。

## JSON API

```bash
.venv/bin/python -m traitladder.api --port 8001
```

`GET /api/catalog` 返回棋池和羁绊。`POST /api/solve` 接受：

```json
{
  "emblems": ["花仙子", "法师"],
  "population": 7,
  "crowns": 1,
  "evolution_count": 2,
  "fixed_evolutions": ["法师"],
  "excluded_units": ["雷恩加尔"],
  "trait_counts": [7, 8],
  "sort": "value",
  "selections": {"5,1,1": 6}
}
```

`emblems` 为逐枚转职列表；API 的 `population` 是总栏位数，上例为 6 级加 1 冠冕。商店等级默认采用 `population-crowns`。其他参数包括 `populations`、`shop_level`、`owned`、`taken`、`lux` 和 `time_limit`。`population` 与 `populations` 二选一。每个人口返回 `plans`、双排序的 `orderings`、`difficulty_boundary`、`inherited_units`、`acquired_units` 和展示用的 `candidate_units`；每个方案的 `selected_evolutions` 给出本次优化的职业。下一次请求通过 `fixed_evolutions` 传回已确认的职业，通过独立 `selections` 保存点选。`memory` 可省略；旧格式仍接受，但不参与计算。持有变化后按当前输入重新求解，保持最低成本时优先实际持有牌。

`selections` 是可选对象，键为规范的 `"L,C,E"`（人口等级 1–10、冠冕 0–3、进化 0–4），值为用户点选的羁绊数整数。例如 `{"5,1,1": 6}` 表示在 5 级、1 冠冕、1 进化状态选 6 羁绊；不表示总栏位为 5。每次请求应传全部仍需保留的点选，省略的状态取 `orderings.value` 首项。只改变 `sort` 不会改变继承。

各状态返回 `requested_trait_count`（未传为 null）、`selected_trait_count`（无可行方案为 null）与 `selection_status`：`user` 为有效点选，`default` 为未点选，`fallback` 为所点羁绊数不存在、已回退到损失排序首项。即使该候选未包含在 `trait_counts` 返回视图中，选中元数据仍按完整候选确定。

`inherited_units` 是本次各前驱状态 `acquired_units` 的并集；`acquired_units` 仅为该继承集合与本格选中阵容的并集。方案、成本、损失、排序、继承和默认选择只由本次输入、持有及点选决定。以前计算的记录不再并入任何状态。

`candidate_units` 汇总前置和当前全部候选（含置灰），网页将它们加入独立持久保存的 `gamePool`，供“本局卡池”展示以前出现过的候选；展示记录不会降低成本。响应 `memory.states[].cards` 仅保存当前已访问格子的已收集集合，`memory.selections` 仅记录快照时的点选；旧请求 `memory` 内容全部忽略，不恢复点选。范围标记 `inheritance: selected-plan-v1` 保持兼容。点选变化时复用本格候选，更新其已收集集合，并让严格后继缓存失效、按需重算。取消持有后按本次选中路径和商店概率重新计算。网页 `localStorage` 独立保存 `selections`、持有和展示卡池，“重置”清空本局设置与快照。

拉克丝的持有状态通过 `owned: ["拉克丝"]` 记录，形态由 `lux` 指定。例如 `lux: "地狱火"` 表示计算地狱火形态；`auto` 表示由求解器选择形态，`none` 表示在方案中禁用拉克丝。已持有时，允许登场的形态获取成本均为零；取消持有后按商店概率重新计算。

CLI 通过同一接口计算，支持 `--evolution-count`、`--evolutions`、`--exclude` 和 `--sort`。网页静态版使用相同约束的 JavaScript 引擎。

## 发布

1. 上传源码到 GitHub 仓库，保留 `.github/workflows/pages.yml`。
2. 仓库 Settings → Pages → Source 选择 GitHub Actions。
3. 推送到 `main` 或 `master`，或手动运行 GitHub Pages 工作流。

工作流执行 Python 和网页测试，发布 `web/`。所有站内资源使用相对路径，支持 GitHub 项目子路径。`python scripts/package_web.py` 生成源码包和静态站点包，输出到 `results/`。

## 依赖和验证

求解器为随项目提供的 highs-js 1.15.4 / HiGHS 1.15.1（均为 MIT），每个 Worker 运行独立的单线程 WebAssembly。主 Worker（`web/worker.js`）按三维矩阵递推，每格先求羁绊上限，再将各目标羁绊数派给 `web/solve-worker.js` 子池并行求解；格间依赖保持串行。子池大小为 `max(1, min(hardwareConcurrency - 1, 4))`，未提供硬件并发数时使用 1。结果按目标顺序汇合，进度按完成数量回报。取消会终止子池并丢弃旧请求的结果，下次请求重新初始化子池；已完成格的缓存仍可复用。没有 `Worker` 的环境以及直接调用引擎而未传 `solveTargets` 的调用方保持串行。

每次阵容求解（含同成本时的持有优先和确定性排序）共用 8 秒预算，通过 HiGHS 的 `time_limit` 选项传入剩余秒数，使用 `performance.now()` 计时。只有 HiGHS 返回 `Optimal`，且全部排序阶段完成证明时，方案才标为 `optimal`；超时为 `limit`，证明无解为 `infeasible`。

`web/vendor/highs.js`、`highs.wasm` 和两份 MIT 许可证随静态站分发，无需 npm 安装或构建。主、子 Worker 以相对于自身的路径加载资源，兼容 GitHub Pages 子路径。`scripts/build_standalone.py` 将 wasm 以 base64 内嵌到单文件预览的主 Worker 中，并通过 Blob URL 创建子 Worker，初始化时传入数据和 wasm 字节，也支持同格并行；每个子 Worker 各自持有数据和 wasm 实例，因此会增加内存及首次初始化开销。`scripts/package_web.py` 自动包含整个 `web/` 目录中的新资源（包括 `solve-worker.js`）。

美术资源来自腾讯 CDN：英雄 `champions/{chessId}.png`、羁绊 `origins/` 和 `classes/`、转职 `equip/`。地址保存在 `web/data.json`，备用地址及文字回退处理加载失败。图像权利归 Riot Games / 腾讯等权利人所有。

```bash
python scripts/calibrate_loss.py
python scripts/verify_values.py
python scripts/export_web_data.py
python -m unittest discover -v
npm run test:web
```

网页引擎回归与全部 210 组新递推 Python 结果逐候选对照，并验证多转职计数、冠冕概率、进化联合优化、历史约束、排序、分界和替代卡；DOM 回归使用真实 Worker 检查交互。布局检查覆盖中英文首页和转职弹窗，在 Chrome 155 中采集了 360、390、720、980、1440 和 1920 像素视口的对照截图，并逐张审查；窄屏修正另行完成四组定向复验。采集副本使用内嵌头像、图标和字体，以及原有渐变背景。130 个外链 PNG 的历史签名与尺寸检查见[图片记录](web-assets.json)。

计算按人口等级、冠冕和进化次数的三维矩阵递推，只沿各有效前置状态选中的一套方案传递已收集集合，供后继按零获取成本复用。未选中候选只参与本局卡池展示。API 的 `states` 返回格子记录，`predecessors` 给出前置坐标，`progression` 返回当前冠冕及进化次数下的等级序列。`minimum_traits` 默认 2，可指定更低基线。

方案数值使用 `difficulty`（D，单位次商店），页面保留一位小数，零显示为 0。旧 `loss`、`loss_lower_bound`、`value_score`、`value_upper_bound`、`value_boundary` 已删除；`difficulty_lower_bound` 保留，主目标证明状态改名 `difficulty_status`。JS 对应 `difficulty`、`difficultyStatus` 与 `difficultyBoundary`，不再输出 `loss` 或 `value`。API 的排序参数及 `orderings.value` 保留兼容键 `value`，表示 D 升序；`traits` 表示羁绊数降序。分界数据 v5 仍在 log(V) 上标定，只将输出换算到 D 坐标。

显示名称沿用“损失 / Loss”：损失等于 D，是阵容中各张待补弈子平均需要等待的商店次数之和，单位为次商店；无需补牌时为 0。字段 `difficulty`、`difficulty_boundary` 等继续沿用 D 坐标命名。
