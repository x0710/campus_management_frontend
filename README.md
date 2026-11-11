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

生产环境需将 `/api` 反向代理到后端，并为前端路由配置回退到 `index.html`。

前端统一使用 `/campus` 路径：登录页 `/campus/login`，党员端 `/campus/party`，
支部端 `/campus/party/branch`，学院党委端 `/campus/party/academy`，
学校党委端 `/campus/party/school`，管理端 `/campus/admin`。各端的模块和详情路径挂在对应入口下。
`/campus` 按当前用户任职进入默认门户；原 `/login`、`/home`、`/portal/...` 地址会自动迁移并保留查询参数和锚点。
前端静态资源与后端 `/api` 地址继续使用站点根路径，无需修改 CAS 的后端回调地址。

支持日期查询的列表提供「创建日期（UTC）」筛选，日期格式为 `YYYY-MM-DD`，
包含所选起止日，也可仅填写一端；修改或清空筛选会回到第一页。
创建日期与请假时间、违规发生时间、日历事件时间分开查询。
用户列表和组织成员列表的日期条件会随页面返回保留，并在切换账户时隔离。

登录页支持用户名密码和 CAS 统一身份认证。点击「统一身份认证登录」后，
浏览器在当前页面直接访问学校 CAS 登录页 `https://authserver.jgsu.edu.cn/authserver/login`，
通过 `service` 查询参数传入 `https://partymc.jgsu.edu.cn/campus/api/auth/cas/callback`，认证后由 CAS 自动跳回该地址。
该地址打开前端公开回调页，由页面携带 `ticket`（有 `state` 时同时携带）请求后端
`GET /api/auth/cas/callback`。后端验票返回与密码登录一致的 `token`、`user`、`last_login_at` 后，
前端保存登录态并跳转 `/campus`，由门户解析页进入当前用户的门户。CAS 登录不触发本地首次改密。

部署时 `/campus/api/auth/cas/callback` 必须回退到前端 `index.html`，不能直接代理到后端输出 JSON；
`/api/auth/cas/callback` 继续代理到后端。两者的路径不同，其余业务接口仍使用 `/api`。

Nginx 可为前端回调增加精确匹配（使用现有前端静态目录的 `root`）：

```nginx
location = /campus/api/auth/cas/callback {
    try_files $uri /index.html;
}
```

后端对应配置为 `CAS_SERVICE_URL=https://partymc.jgsu.edu.cn/campus/api/auth/cas/callback`。
当前本地后端回调还要求后端登录入口生成的 `state` 和流程 Cookie，需配套支持前端直接发起的认证流程；
前端不会伪造该流程凭据或绕过后端校验。


---

### 服务端口说明

- 前端服务器默认监听 `5173` 端口

---

### 访问入口

| 功能 | 地址 |
| :--- | :--- |
| 前端入口 | `http://localhost:5173` |


---

