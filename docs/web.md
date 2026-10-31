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
- 每个人口分别保留“损失 ↑”或“羁绊 ↓”排序。排序直接使用已有结果。
- 重新计算期间，阵容、已激活羁绊和候选方案区域保留原来的高度，以覆盖层显示计算状态，并暂停旧结果的交互。新结果返回后，三个区域一次性更新并恢复自然高度。已完成的人口从缓存直接显示；取消和计算失败各自显示对应状态。
- 通过阵容头像切换持有状态时，阵容保持可见并允许继续点击，其余结果区域显示计算提示。头像颜色立即同步，连续点击合并到最后一次计算，返回结果后再更新阵容。
- 计算完成后，外观没有变化的卡片与图片保持原位，持有颜色和损失数值分别更新。“任意羁绊”的可选弈子在点击时读取最新计算结果。
- 高损失方案的灰色行和红字使用固定的全局损失阈值，所有状态共用同一标准，方法见[算法说明](algorithm.md)。头像灰色表示尚未持有；禁卡表中表示已禁用。
- 卡兹克进化次数使用 0–4 单选框。求解器联合选择职业和阵容；查看方案后“确认进化”将职业记入本局。随后计算保留这些职业，并优化新增次数。点击已确认的羁绊图标可逐项撤销进化，同时将进化次数减 1，并重新计算。
- “本局卡池”位于桌面侧栏，用于标记已持有的弈子；卡按费用分组，点击头像切换持有状态。进化记录、持有标记、禁卡表、卡池及矩阵记忆在刷新页面后保留，“重置”开始新一局。
- 手机页面依次展示本局设置、人口与进化设置、当前阵容、对应羁绊、候选方案、本局卡池，各区保持展开。平板将羁绊放在当前阵容与候选方案之间。
- “任意xx”可点击查看同费用或更低费用的候选卡，并修改持有标记。关闭弹窗时统一提交，持有状态改变后重新计算。普通角色卡在阵容中点击即可切换持有状态，并重新计算。
- 拉克丝在首页用彩色羁绊图标单选。禁卡表默认亮色，点击后变灰；禁卡会撤销持有标记并重新计算递推依赖。

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
  "sort": "value"
}
```

`emblems` 为逐枚转职列表；API 的 `population` 是总栏位数，上例为 6 级加 1 冠冕。商店等级默认采用 `population-crowns`。其他参数包括 `populations`、`shop_level`、`owned`、`taken`、`lux` 和 `time_limit`。`population` 与 `populations` 二选一。每个人口返回 `plans`、双排序的 `orderings`、`loss_boundary`、`inherited_units` 和 `acquired_units`；每个方案的 `selected_evolutions` 给出本次优化的职业。下一次请求通过 `fixed_evolutions` 传回已确认的职业，通过 `memory` 回传上次响应的矩阵记忆。新增持有后保留前置卡池，保持最低损失时优先使用实际已持有的卡。

CLI 通过同一接口计算，支持 `--evolution-count`、`--evolutions`、`--exclude` 和 `--sort`。网页静态版使用相同约束的 JavaScript 引擎。

## 发布

1. 上传源码到 GitHub 仓库，保留 `.github/workflows/pages.yml`。
2. 仓库 Settings → Pages → Source 选择 GitHub Actions。
3. 推送到 `main` 或 `master`，或手动运行 GitHub Pages 工作流。

工作流执行 Python 和网页测试，发布 `web/`。所有站内资源使用相对路径，支持 GitHub 项目子路径。`python scripts/package_web.py` 生成源码包和静态站点包，输出到 `results/`。

## 依赖和验证

求解器为随项目提供的 jsLPSolver 1.0.3（Unlicense），每次求解限时 8 秒，最优性状态依照分支搜索完成情况输出。

美术资源来自腾讯 CDN：英雄 `champions/{chessId}.png`、羁绊 `origins/` 和 `classes/`、转职 `equip/`。地址保存在 `web/data.json`，备用地址及文字回退处理加载失败。图像权利归 Riot Games / 腾讯等权利人所有。

```bash
python scripts/calibrate_loss.py
python scripts/export_web_data.py
python -m unittest discover -v
npm run test:web
```

网页引擎回归与 42 组 Python 结果对照，并验证多转职计数、冠冕概率、进化联合优化、历史约束、排序、分界和替代卡；DOM 回归使用真实 Worker 检查交互。布局检查覆盖中英文首页和转职弹窗，在 Chrome 155 中采集了 360、390、720、980、1440 和 1920 像素视口的对照截图，并逐张审查；窄屏修正另行完成四组定向复验。采集副本使用内嵌头像、图标和字体，以及原有渐变背景。130 个外链 PNG 的历史签名与尺寸检查见[图片记录](web-assets.json)。

计算按人口等级、冠冕和进化次数的三维矩阵递推，前置状态中出现过的卡按零获取成本复用。API 的 `states` 返回格子记录，`predecessors` 给出前置坐标，`progression` 返回当前冠冕及进化次数下的等级序列。`minimum_traits` 默认 2，可指定更低基线。
