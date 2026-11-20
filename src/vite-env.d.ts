/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BASE?: string
  readonly VITE_API_BASE?: string
  /** 当前项目：party（党建，默认）| campus（校园平台），见 src/projects/ */
  readonly VITE_PROJECT?: 'party' | 'campus'
}
