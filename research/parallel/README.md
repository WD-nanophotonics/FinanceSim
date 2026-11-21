# 并行尾部风险实验：11月28日启动手册

新增实验不替换llm/statistical/hybrid，不改写历史预测、评分或原生成器。
首期信息截止2026-11-28 12:00 JST，观察11月27日到12月4日变化。
本手册不是已生成的11月28日预测；真实报价、长期历史与当期判断仍待取得。

## 固定政策和更新

[policies/tail-risk-v1.json](policies/tail-risk-v1.json)是机器可读注册。

| 版本 | 更新 | 作用 |
|---|---|---|
| 原三组 | 原有流程，逐项原值复制 | 同目标对照 |
| ewma_gaussian | 固定0.97衰减，日变化平方递推 | 单独检验动态波动率 |
| joint_fhs | 相同EWMA，滚动1250个残差 | 同日期、连续5工作日联合抽样 |
| joint_fhs_llm | 重用FHS原始路径 | 仅叠加受限的事前情景 |

系数是探索性预注册起点，**不是历史优选或已校准参数**。不根据四周成绩调参。
至少1311行工作日水平：60个变化初始化，随后1250个残差。
初始方差用最早60个变化的二阶矩；残差除以观察该日变化之前的波动率。
观察后才更新方差；模拟路径内也按同一规则更新。窗口残差按开市日去均值。
股票用100×log(今日/昨日)，最终复合为简单周收益%；国债用100×水平差，单位bp。
零漂移指对数收益/收益率变化无主观漂移，不宣称简单收益均值严格为零。
固定20000次抽样、种子20261128；均值、中位数、概率、区间来自同一分布。

完整工作日网格必须显式标记三资产开闭市：休市输入null、变化为零且不更新方差，
下一开市日用上次真实水平计算变化；开市缺测直接失败，不能靠前向填充修复。
历史5日区块要逐日完全匹配未来开闭市掩码，至少20块，否则不可生成。
v1仅覆盖三个美国变量，参考和目标周五都须有真实报价；周五休市需另注册扩展。
观察窗口从下一周一00:00 UTC保守开始，之后提交不能算完整一周事前预测。

LLM四个互斥周情景：none、增长避险、通胀避险、反弹。
非none各权重<=20%、总和=1，幅度固定；只允许事前写权重、时间、依据。
none=1允许但须明确说明。不能改sigma、情景幅度，不能看到候选数值后重写独立LLM判断。
情景是额外冲击假设，可能与历史风险重复计入，须通过无LLM版本检验；不是已校准概率。
历史模拟不能保证覆盖未出现过的危机；另存压力情景时不赋予未经验证的概率。

## 输入准备

运行`python -m financesim.tail_experiment preflight`检查政策和待办。
它不会把政策通过误报为live_ready。[input-template.json](input-template.json)含必需字段，
故意留空真实历史、尺度和需要审查的时间；不能直接拿模板生成预测。

资料必须来自原三组与新实验共同锁定的供应商、指数、单位和收盘规则。
10Y用财政部par yield，不用盘中交易收益率。若原来源无足够历史，应先登记未来的共同口径切换，历史不动。
每行history包含date、observed_at（当日最晚观测）、sessions与values；源真实性仍须外部核验。
acquired_at填真实取数时间，不伪造多年以前的历史首次可得时间。

可从外部取得的CSV导入：

```text
python -m financesim.tail_experiment import-panel research/parallel/inputs/2026-11-28-bundle.json -o research/parallel/inputs/2026-11-28-snapshot.json
```

bundle保留模板其余字段，用下列字段替代history（路径相对bundle）：

```json
{
  "series_files": {
    "sp500": {"path": "raw/sp500.csv", "date_column": "date", "value_column": "value"},
    "nasdaq100": {"path": "raw/nasdaq100.csv", "date_column": "date", "value_column": "value"},
    "us10y": {"path": "raw/us10y.csv", "date_column": "date", "value_column": "value"}
  },
  "history_calendar_file": "history-calendar.json"
}
```

日历文件是含date/observed_at/sessions的数组，按真实日历审查，不从CSV空值推断休市。
保留原始CSV和日历；导入器保存各文件SHA-256，拒绝开市缺测和日期重复。
首次尺度用启动前历史日变化样本标准差×sqrt(5)，股票为简单收益百分点、国债为bp。
使用import-panel且首期三个尺度全部为null时自动计算，包含显式休市的零变化；后续必须复制launch-lock。
在数据审查时写入正数，launch-lock固定尺度、sources、policy hash；未来不因成绩改分母。
历史检验须另有当时可得性证据，只标回测，不进入live账本。

## 封存操作

1. 取得11月27日收盘及长期历史，审核日历。全部输入在11月28日中午前可得。
2. 按现有流程独立生成原三组11月28日文件，先记录LLM判断，再运行候选。
3. 模型与政策先提交，代码工作区干净，把完整HEAD填入code_commit。
4. 依次执行；所有输出只能创建新路径：

```text
python -m financesim.tail_experiment preflight --input research/parallel/inputs/2026-11-28-snapshot.json
python -m financesim.tail_experiment generate research/parallel/inputs/2026-11-28-snapshot.json --legacy research/weekly/2026-11-28-forecast.json -o research/parallel/forecasts/2026-11-28-v1.json
python -m financesim.tail_experiment lock research/parallel/forecasts/2026-11-28-v1.json -o research/parallel/locks/2026-11-28-launch-lock.json
```

适配器保留原三组中心/概率/区间，核对URL、参考值与目标日期。原JSON嵌入实验记录并hash绑定。
source identity和精确目标收盘时间须审查补充。后续generate加
`--launch-lock research/parallel/locks/2026-11-28-launch-lock.json`。

5. **12:00 JST前**提交并推送输入、原三组、候选与lock。生成时间来自实际时钟。
6. 推送后核对远端，再追加凭据：

```text
python -m financesim.tail_experiment receipt research/parallel/forecasts/2026-11-28-v1.json -o research/parallel/receipts/2026-11-28-v1.json
```

receipt是唯一联网命令，使用gh API核对首次新增提交、远端字节及代码提交时间；分支发布可加`--ref 分支名`。
受限环境先申请联网执行，不从受限失败推断凭据问题。receipt可晚于中午，预测提交必须准时。
hash不证明发布时间；Git日期也不是独立可信时间戳服务，须保留这一限制。
迟交但周一前发布的记录仍保留，单列观察，不进主验收；周一后不能当完整一周事前预测。
修正须新路径并说明supersedes，同一期主账本只能登记一次，不重开预测机会。

## 评分与验收

实际值结构为`{asset: {status, value, observed_at, available_at, source_identity}}`。
仅verified进入评分，缺测/其他状态列pending；来源必须逐字段匹配、观测时间必须等于冻结目标。
真实资料修正另存，不改原结果。

```text
python -m financesim.tail_experiment score research/parallel/forecasts/2026-11-28-v1.json research/parallel/outcomes/2026-12-05.json -o research/parallel/verifications/2026-12-05-v1.json
python -m financesim.tail_experiment report research/parallel/cohorts.json --launch-lock research/parallel/locks/2026-11-28-launch-lock.json -o research/parallel/reviews/13-week-v1.json
```

cohorts.json是数组，每项含forecast、verification、receipt文件路径；追加时保留旧清单版本。
输出逐变量MAE/RMSE所需损失、方向Brier、覆盖/宽度/越界方向及幅度、尾部分位数损失，
以及标普/纳指跌幅>=5%、10Y上升/下降>=25bp、两股指共同跌幅>=5%的概率及Brier。
衍生事件不算独立样本；六市场广度仍按原流程保留，本实验不伪造另外三个市场的联合抽样。

主评分为50/80/90区间的适当加权评分：sum(alpha/2×IS)/sum(alpha/2)。
旧版缺中位数，所以公平比较仅用“区间项”；新实验另存中位数与完整WIS，不能把旧均值冒充中位数。
尾部损失用90%中央区间两端的5%/95%分位数pinball loss，分别看上下尾越界率。

累计入口重放每期评分，拒绝重复周、hash不符、不同policy/source/scales或无远端匹配凭据。
主验收只用三变量完整、准时、真实、事前的共同周；迟交缺测单列。周缺口或缺首期阻止区块推断与升级。

- 8周运行诊断，13周中期观察，均不晋升、不按成绩临时调参。
- 26周：按锁定尺度标准化、三变量等权，逐周配对比较。
- 对原hybrid和动态Gaussian，主评分至少改善10%，至少2/3变量改善。
- 任何变量主评分或中心MAE不得恶化>10%；归一化尾部损失整体改善。
- 整个三变量周向量一起抽连续4周区块，2000次、固定种子，配对差95%近似区间上界<0。
- LLM版本还须同样通过无LLM FHS对照。
- 通过也只标eligible_for_review，永不自动晋升；26周不足则另登记未来检查点，不每周重复试显著性。

26周每变量5%尾部预计仅约1.3次越界，不能证明罕见风险已校准；小样本区块自助法也仅近似。

## 准备状态

代码/规则/入口已准备，真实首期仍需要截至11月27日的报价、长期历史、日历与原三组。
11月21日FRED CSV接口检查返回404。替代接口预取结果保存在
[真实历史暂存](data/2026-11-21-history-staging.json)：标普和纳指各2514个日收盘，
财政部10Y为2024至2026年的722条；2016至2023年页面未返回可解析日收益率，逐源失败均保留。
这仍不足以满足联合模型的完整历史要求，**不可降低门槛或用盘中10Y/合成数据替代**。
日历未从缺报价推断；Yahoo与原纳指供应商不同，须先为未来全部对照统一来源并审核。
可在允许联网的环境重新预取，始终使用新的日期/修订路径：

```text
python research/scripts/prepare_parallel_history.py --start 2016-11-21 --end 2026-11-20 -o research/parallel/data/2026-11-21-history-staging-correction01.json
```

脚本只产生STAGING记录，保存来源URL、响应hash、逐源错误和两位小数价格，不产生预测、不推断休市。
封存前无法解决则明确登记未启动，不追补。本改动不新增定时任务，现有周度执行者读INDEX后按本手册执行。

```text
python -m unittest discover -s tests -v
python -m financesim.tail_experiment preflight
python research/scripts/check_parallel_readiness.py
```

合成测试验证数值、泄漏、缺测、日历、不可覆盖、远端核对、启动锁和26周验收；不是实际预测成绩。
