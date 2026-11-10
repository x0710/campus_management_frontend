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

---

### 服务端口说明

- 前端服务器默认监听 `5173` 端口

---

### 访问入口

| 功能 | 地址 |
| :--- | :--- |
| 前端入口 | `http://localhost:5173` |


---

