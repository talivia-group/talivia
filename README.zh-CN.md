# Talivia

语言：[English](README.md) | [简体中文](README.zh-CN.md)

本仓库提供 Talivia 的精简开源版。Talivia 是一款以收入为核心的分析平台，完整产品可在
[talivia.com](https://talivia.com) 使用。自托管版本包含核心网站分析、会话回放、网站协作者、
共享分析、数据导入与导出，以及来自 Stripe、LemonSqueezy、Polar、Dodo、Yolfi 或手动付款
接口的客户收入数据。

![Talivia 仪表板](./public/talivia-gh-main.png)

## 开源版与 Talivia Cloud

开源版是 Talivia 完整产品中可自托管的子集。如需托管服务和更多集成，包括 Google Search
Console、Bing Webmaster Tools、GitHub 活动，以及来自 X、Reddit、TikTok 等平台的社交媒体
提及，请使用 [Talivia Cloud](https://talivia.com)。

## 文档

产品和集成指南请参阅 [Talivia 官方文档](https://talivia.com/docs)。

## 本地开发

环境要求：Node.js 22 LTS 或 24 LTS、pnpm 10 或更高版本，以及一个空的 PostgreSQL 数据库。

```bash
cp .env.example .env
openssl rand -hex 32
```

将生成的值填入 `APP_SECRET`，然后安装依赖、执行数据库迁移并启动 Talivia：

```bash
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
pnpm dev
```

打开 `http://localhost:3000`，使用以下信息登录：

- 用户名：`admin`
- 密码：`admin`

登录后请立即在 **设置 → 账户** 中修改此初始密码。管理员可以在同一账户页面创建其他使用
用户名和密码登录的账户，并更改其角色。系统绝不会显示密码哈希；每位用户需自行修改密码。

常用检查命令：

```bash
pnpm lint
pnpm test
pnpm build
```

初始迁移仅适用于空数据库。目前无法从 Talivia 托管版数据库迁移到此版本。

## 配置

Talivia 有两项必填配置和一项可选集成：

| 变量 | 是否必填 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 数据库连接字符串。 |
| `APP_SECRET` | 是 | 至少 32 字节的随机值，用于对会话进行签名并加密已保存的服务商凭据。 |
| `COINGECKO_API_KEY` | 否 | 启用加密货币汇率换算。 |

未配置 CoinGecko 或 CoinGecko 暂时不可用时，应用仍可正常使用。

## 首次设置

1. 在 Talivia 中创建一个网站。
2. 将该网站的追踪代码片段复制到您的网站中。
3. 确认仪表板上出现一次访问记录。
4. 如有需要，在网站设置中启用会话回放。
5. 在 **网站设置 → 付款** 中连接客户收入来源。

支持的收入来源包括 Stripe、LemonSqueezy、Polar、Dodo、Yolfi 和手动付款接口。系统会保留
订阅生命周期、退款、争议以及首次接触和最终接触归因数据。

付款服务商的网络回调地址会根据传入请求的来源自动生成。通过反向代理运行 Talivia 时，请转发
原始的 `Host` 和 `X-Forwarded-Proto` 请求头。

## Docker

环境要求：安装了 Docker Compose 的 Docker Engine。

```bash
cp .env.example .env
openssl rand -hex 32
```

将生成的值填入 `APP_SECRET`，然后启动 Talivia：

```bash
docker compose up --build -d
docker compose ps
```

打开 `http://localhost:3000` 并立即修改初始 `admin` 密码。容器会在应用启动前自动执行开源版的
数据库迁移。

## 备份与升级

升级前，请备份 PostgreSQL 数据库和所有与部署相关的存储。使用 Compose 部署时，可通过以下
命令创建数据库逻辑备份：

```bash
docker compose exec -T postgres pg_dump -U talivia -d talivia_oss > talivia-backup.sql
```

后续版本会在 `prisma/migrations` 中添加按顺序执行的迁移。使用
`pnpm exec prisma migrate deploy` 应用迁移；官方容器会在启动时自动执行此命令。切勿修改已经
应用到持久化数据库的迁移。

## 人工智能代理与模型上下文协议

Talivia 还提供适用于 Codex、Claude Code、ChatGPT 和其他兼容模型上下文协议客户端的
[开源人工智能代理工具包](https://github.com/talivia-group/agent)。它可以帮助代理安装网站追踪、
生成针对不同框架的配置方案、验证实时分析事件，并将访问记录与付款归因关联起来。

通过 OAuth 连接托管的模型上下文协议服务器：

```text
https://talivia.com/mcp
```

也可以通过标准输入输出在本地运行人工智能代理工具包：

```bash
npx -y @talivia/agent mcp
```

有关设置方法和受支持的客户端，请参阅
[人工智能代理工具包指南](https://talivia.com/ai-agent-kit)。托管的模型上下文协议端点连接
Talivia Cloud；此自托管版本不提供 Talivia Cloud 的 OAuth 端点。

## 安全与贡献

请参阅 [SECURITY.md](SECURITY.md) 了解安全漏洞报告方式和部署指南，并参阅
[CONTRIBUTING.md](CONTRIBUTING.md) 了解开发协作流程。

Talivia 采用 [MIT 许可证](LICENSE)。
