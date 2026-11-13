# 基于 React + TypeScript + Vite 的大学业务管理系统前端

项目需配合[后端](https://github.com/x0710/CampusManager)使用

面向使用人员的操作说明请见：[校园管理平台使用手册](docs/使用手册.md)。

---

### 环境要求

请确保本地已安装以下工具：

- yarn 前端包管理工具
- Node.js（本项目的构建和测试已在 Node.js 26 验证）

---

### 启动方式

1. 启动后端项目

请参见[后端项目#启动方式](https://github.com/x0710/CampusManager)

2. 部署前端

```bash
# 1. 克隆远程仓库
git clone git@github.com:x0710/campus_management_frontend.git
cd campus-management-frontend

# 2. 安装依赖并运行前端开发服务
yarn install --frozen-lockfile
yarn run dev
```

验证和构建：

```bash
yarn test
yarn lint
yarn build
```

站点基础路径通过 `VITE_APP_BASE` 配置，默认 `/campus/party`。
复制 `.env.example` 为 `.env.local`：

```dotenv
VITE_APP_BASE=/campus/party
# 留空时 API 自动使用站点基础路径下的 /api，也可独立填写完整后端地址。
VITE_API_BASE=
```

Vite 的 `base` 与运行时的 `APP_BASE` 共用这项配置；页面路由、JS/CSS、公共图片、
登录跳转和 CAS 前端回调均从基础路径派生。修改后需重启开发服务，生产环境需重新构建。
`API_BASE` 默认跟随站点基础路径，也可用 `VITE_API_BASE` 单独覆盖。
同源部署需配置 Nginx 静态文件映射与页面回退，跨域 API 需由后端允许前端来源的 CORS 请求。
本地 Vite 代理将配置的 API 路径转发到 `http://localhost:8000/api`。

默认部署地址：

| 入口 | 路径 |
| --- | --- |
| 站点与门户选择 | `/campus/party` |
| 登录 | `/campus/party/login` |
| 党员个人端 | `/campus/party/member` |
| 支部、学院、学校端 | `/campus/party/branch`、`/campus/party/academy`、`/campus/party/school` |
| 管理、学生、教师、领导端 | `/campus/party/admin`、`/campus/party/student`、`/campus/party/teacher`、`/campus/party/leader` |
| 静态资源 | `/campus/party/assets/...` |
| API | `/campus/party/api/...` |

旧 `/campus/login`、`/campus/admin/...`、`/portal/...` 等地址进入前端后会迁移并保留参数和锚点。
多应用共用域名时，Nginx 是否继续把旧地址交给本应用需单独配置；新链接始终使用站点基础路径。
修改部署基础路径后，后端 `CAS_SERVICE_URL` 和 Nginx 映射也需同步调整。

手机端使用抽屉菜单，顶部操作自动换行，宽表格可在内容区横向滚动。

支持日期查询的列表提供「创建日期（UTC）」筛选，日期格式为 `YYYY-MM-DD`，
包含所选起止日，也可仅填写一端；修改或清空筛选会回到第一页。
创建日期与请假时间、违规发生时间、日历事件时间分开查询。
用户列表和组织成员列表的日期条件会随页面返回保留，并在切换账户时隔离。

登录页支持用户名密码和 CAS 统一身份认证。点击「统一身份认证登录」后，
浏览器先访问 `/campus/party/api/auth/cas/login`，由后端设置流程 Cookie、生成 `state` 并跳转学校认证中心。
认证成功后，学校须跳回前端页面 `/campus/party/auth/cas/callback?ticket=...&state=...`。
前端页面再携带 `ticket`、`state` 和浏览器 Cookie 请求后端 `/campus/party/api/auth/cas/callback`，
收到 `token`、`user`、`last_login_at` 后保存登录态并进入站点根路径。CAS 登录不触发本地首次改密。

后端环境变量必须配置为前端回调页的完整 HTTPS 地址（域名请替换为实际部署域名）：

```dotenv
CAS_SERVICE_URL=https://partymc.jgsu.edu.cn/campus/party/auth/cas/callback
```

修改后需重启后端并从登录入口重新发起认证；学校注册的 service 规则须允许此地址及后端追加的随机 `state`。
登录入口、前端回调页和后端验票接口须使用同一域名的 HTTPS，以携带后端设置的安全 Cookie。

Nginx 须把前端回调页交给静态站点，把 API 路径转发到后端。以下假定构建产物放在
`/var/www/html/campus/party/`，后端监听 `127.0.0.1:8000`；请按实际目录和端口调整：

```nginx
location /campus/party/api/ {
    proxy_pass http://127.0.0.1:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /campus/party/auth/cas/callback {
    root /var/www/html;
    try_files /campus/party/index.html =404;
    add_header Cache-Control "no-store" always;
    add_header Referrer-Policy "no-referrer" always;
}
```

如果浏览器认证后直接显示包含 token 的 JSON，说明学校仍回调到后端 API，或 Nginx 把前端回调地址代理到了后端。
此时前端页面没有运行，不能接收该 JSON；需要同时检查后端 `CAS_SERVICE_URL` 与上述 Nginx 路由。



---

### 服务端口说明

- 前端服务器默认监听 `5173` 端口

---

### 访问入口

| 功能 | 地址 |
| :--- | :--- |
| 前端入口 | `http://localhost:5173` |


---

