## 费曼物理 v4.2.2-rc1（教学内容开发候选）

三端共用本次教学内容更新：Android 学生端、Android 教师端和 Windows。

- 修正 100 道高二静电场与电路原创参数题的册别与仓库课程目录映射；保留现有题目 ID 和旧学习记录。
- 为八年级平均速度、九年级欧姆定律、高一牛顿第二定律补课程讲解、模型条件、教师追问及对应教学活动；新增两条电学前概念诊断和五组错因补救材料。
- 自动评分题保留 `answerSchema`；实验、作图与开放表述继续待人工复核。四道高一多表征题仍是待教师审核草稿。
- 旧版课程安装标记会触发兼容元数据更新，不清空 state v10 或旧 `.pslab` 数据。

**重要边界**：1,897 道内置完整题中，766 道与仓库内部教材节目录匹配，1,131 道仍待教材实本核验；不是教材授权或教师逐题审核结论。Windows 安装器未正式代码签名，Android APK 为本机开发签名。未完成真机跨设备课堂和教学效果验证。班级公网服务须单独部署；本机离线学习保持可用。

SHA-256 见附件 `SHA256SUMS-v4.2.2-rc1.txt`。不要把此预发布版本当作正式商店发行版。旧 `v4.2.0-rc1` 原样保留。

详细依据与测试边界：[内容核验](https://github.com/luo12200159/Physics/blob/v4.2.2-rc1/docs/content-quality-v4.2.2.md) · [测试结果](https://github.com/luo12200159/Physics/blob/v4.2.2-rc1/docs/content-test-results-v4.2.2.md) · [教师待审核清单](https://github.com/luo12200159/Physics/blob/v4.2.2-rc1/docs/content-teacher-review.md)。
