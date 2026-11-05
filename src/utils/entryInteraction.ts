/** 条目内的按钮、链接和表单控件保持各自操作，不触发整行进入。 */
export function isEntryActionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'button, a, input, textarea, select, [role="button"], [role="checkbox"], [role="switch"], .ant-select, .ant-checkbox-wrapper, .ant-popover, .approval-actions',
  ))
}
