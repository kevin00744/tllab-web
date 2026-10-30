// 圖示欄位（emoji）可以是 emoji，或上傳到 icons bucket 的圖片網址（與資料庫 icon_ok() 相同規則）
const ICON_URL = /^https?:\/\/[^\s<>"'`]+\/storage\/v1\/object\/public\/icons\/[^\s<>"'`]+$/;

export function isIconUrl(value: string | null | undefined): value is string {
  return !!value && value.length <= 500 && ICON_URL.test(value);
}

/** 只能放純文字的地方（下拉選單、title 屬性）：圖片圖示不顯示 */
export function iconText(value: string | null | undefined) {
  return isIconUrl(value) ? "" : (value ?? "");
}
