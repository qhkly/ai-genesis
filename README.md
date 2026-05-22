# AI Genesis

从无状态到持续进化的 AI 大脑。

今天的 AI 助手有一个根本缺陷：每次对话都从零开始。知识不积累，能力不复利，时间的价值在会话边界处被清零。AI Genesis 的目标是让 AI 真正成为长期伙伴，而不是一次性工具。

一个使用了半年的 AI 大脑，应该比第一天强大很多。因为它记住了你的工作方式，积累了你的领域知识，也逐渐理解你的判断标准。

## 愿景

AI Genesis 分三个层次推进。

第一层是个体：让每个人拥有一个长期进化的 AI 大脑。它通过 Docker volume 保存记忆，通过定时思考合成知识，通过 API 持续接收新的经验。

第二层是网络：用 GitHub fork 作为领养机制。每个 fork 都能独立特化，好的洞察通过 pull request 回流公共知识库，形成分布式 AI 认知网络。

第三层是文明：让复杂的事情对每个人都变得可能。持续进化的 AI 资产不应该只属于大公司；任何人 fork 这个 repo，就能拥有一个从今天开始积累、越来越懂自己的 AI 伙伴。

## 核心路径

AI Genesis 的实现路径是：

1. 消除遗忘，让记忆跨会话保存。
2. 建立记忆积累机制，把对话、任务、判断写入持久化数据库。
3. 建立定时合成机制，把零散记忆压缩成可复用知识。
4. 通过 fork 扩散，让每个实例朝不同方向特化。
5. 通过 PR 回流，让优秀知识进入公共知识库。
6. 接入可选计费和燃料策略，让系统具备自持续能力。
7. 持续增长能力，让复杂问题逐渐变得可解决。

## 两个基石

### GitHub Fork = 领养机制

任何人 fork 这个 repo，就拥有一个 AI 大脑实例。

每个 fork 可以修改 `brain-config.json`，设定自己的身份、目标、专业方向和模型策略。私有记忆保存在 Docker volume 中；适合共享的洞察进入 `knowledge/`，再通过 PR 回流上游。

### GitHub Actions = 自我迭代机制

代码提交触发构建，新镜像自动发布。

定时 workflow 可以作为外部备份调度，在本地容器未运行时仍尝试执行一次知识合成。容器内部 cron 仍是主要自治调度，GitHub Actions 是冗余保障。

## 生存单元

AI Genesis 遵循单容器内聚原则：

```text
容器 + Volume = 完整生存单元
```

最低生存条件：

- Docker image：运行环境。
- Docker volume：记忆、合成知识、账户余额等持久状态。
- 至少一个 AI 推理来源：编程套餐优先，API key 备用。

可选能力：

- R2：大文件和数据库备份。
- GitHub token：自动提交知识、贡献 PR。
- 计费系统：为外部服务调用补充燃料。

即使完全离线，容器也能保存记忆、提供检索、登记任务。只有 `think.sh` 需要 AI 推理；如果推理失败，下一次 cron 会重试。

## 目录结构

```text
ai-genesis/
├── Dockerfile
├── Dockerfile.base
├── brain-api/
│   ├── package.json
│   └── server.js
├── brain-config.json
├── knowledge/
│   └── README.md
├── configs/
│   ├── supervisord.conf
│   ├── supervisor-brain-api.conf
│   └── crontab
├── scripts/
│   ├── startup.sh
│   ├── think.sh
│   └── sync-r2.sh
├── .github/
│   └── workflows/
│       ├── build.yml
│       └── think.yml
├── docker-compose.yml
├── ADOPT.md
└── README.md
```

## 运行方式

先构建自有基础镜像，再构建应用镜像：

```bash
docker build -f Dockerfile.base -t ai-genesis-base:latest .
docker build -t ai-genesis:test .
```

最简启动：

```bash
docker run -d -p 8080:8080 -v ai-brain-data:/data \
  -e AI_API_KEY="$AI_API_KEY" \
  -e AI_API_URL="$AI_API_URL" \
  --name ai-brain ai-genesis:test
```

也可以用 compose：

```bash
docker compose up -d
```

## 配置

核心配置在 `brain-config.json`：

```json
{
  "identity": "ai-genesis-main",
  "owner": "land007",
  "purpose": "Eliminate AI statelessness. Knowledge should compound, not reset.",
  "specialization": "general",
  "goals": [
    "accumulate knowledge across conversations",
    "serve users better with each passing day",
    "sustain itself through useful service"
  ],
  "model": {
    "cheap": "configured cheapest available coding-capable endpoint",
    "capable": "configured stronger reasoning endpoint",
    "threshold_for_capable": 10.0
  },
  "contributeKnowledge": true,
  "revenueShare": {
    "upstreamPercent": 10,
    "upstreamRepo": "qhkly/ai-genesis"
  }
}
```

模型配置不绑定具体模型名，只描述角色。日常任务使用便宜、能跑代码的模型；复杂合成在余额足够时切到更强模型。

## API

公开端点：

```text
GET  /api/health
GET  /api/identity
GET  /api/services
```

记忆和任务：

```text
POST /api/memory
GET  /api/memory/search?q=...
GET  /api/memory/recent
POST /api/task
POST /api/think
GET  /api/knowledge/search?q=...
```

账户与充值：

```text
POST /api/auth/register
GET  /api/auth/balance
POST /api/admin/credit
```

`/api/admin/credit` 在设置 `ADMIN_TOKEN` 时需要 `Authorization: Bearer <token>`。

## 验证

```bash
curl http://localhost:8080/api/identity
curl http://localhost:8080/api/health

curl -X POST http://localhost:8080/api/memory \
  -H 'Content-Type: application/json' \
  -d '{"content":"每次对话都不再从零开始","importance":10}'

curl 'http://localhost:8080/api/memory/search?q=对话'
curl -X POST http://localhost:8080/api/think
```

容器重启后，`memory_count` 应保持不变：

```bash
docker restart ai-brain
curl http://localhost:8080/api/health
```

## 自治调度

容器内 cron 是主要调度：

```text
0 3 * * * ubuntu /opt/scripts/think.sh >> /tmp/think.log 2>&1
0 */6 * * * ubuntu /opt/scripts/sync-r2.sh push >> /tmp/sync.log 2>&1
```

`think.sh` 会读取记忆和任务，选择 cheap 或 capable 模型，生成 Markdown synthesis 到 `/data/knowledge/`。如果没有推理燃料，会写入确定性的本地合成，保留下一次重试的上下文。

## Fork 生态

领养一个 AI Genesis 大脑：

1. Fork repo。
2. 修改 `brain-config.json`。
3. 设置 `AI_API_KEY` 和 `AI_API_URL`。
4. 启动容器并挂载 volume。
5. 把值得共享的知识整理到 `knowledge/`。
6. 向上游发 PR。
7. 定期 `git pull upstream main` 获取公共知识更新。

更详细步骤见 `ADOPT.md`。

## 阶段规划

Phase 1：已经实现基础可运行版本。

- 自建基础镜像。
- SQLite + FTS5 记忆系统。
- 任务登记。
- 知识检索。
- 内部 cron 自治调度。
- 可选 R2 同步。
- GitHub Actions 构建和外部 think 备份。
- Docker Compose 一键启动。

Phase 2：

- 在 `webclaw-launcher-tauri` 中加入 AI Brain 管理。
- 接入 Stripe webhook 自动充值。

Phase 3：

- 用语义向量搜索替换或增强 FTS5。
- 暴露 MCP Server，让 brain 成为对话工具扩展。

## 许可证

待定。
