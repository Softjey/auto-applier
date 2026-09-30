/**
 * Writing values the way a person's typing would, so React/Vue/Angular-controlled
 * inputs actually notice. Setting `el.value` directly is silently reverted by
 * those frameworks; the native prototype setter plus real events is not.
 */
function setNative(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fire(el: HTMLElement, ...types: string[]): void {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

export function setText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  el.focus();
  setNative(el, value);
  fire(el, 'input', 'change');
  el.blur();
  // Verify what the page now holds, not what we sent (a controlled input can revert).
  return el.value === value;
}

export function setSelectValue(el: HTMLSelectElement, optionValue: string): boolean {
  setNative(el, optionValue);
  fire(el, 'input', 'change');
  return el.value === optionValue;
}

export function setChecked(el: HTMLInputElement, checked: boolean): boolean {
  if (el.checked !== checked) el.click(); // a real click keeps framework state in sync
  return el.checked === checked;
}

export function attachFile(el: HTMLInputElement, file: File): boolean {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  el.files = transfer.files;
  fire(el, 'input', 'change');
  return (el.files?.length ?? 0) > 0;
}

export function base64ToFile(base64: string, name: string, type = 'application/pdf'): File {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type });
}
