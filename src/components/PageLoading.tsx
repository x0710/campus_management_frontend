import { Spin } from 'antd'

/** 懒加载路由的加载占位：居中 spinner，仅替换内容区，不影响顶栏/侧栏。 */
export default function PageLoading() {
  return (
    <div
      style={{
        minHeight: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spin size="large" />
    </div>
  )
}
