"use client";

import { createContext, useContext } from "react";

/** 目前登入成員的 id（訪客為 null），給需要上傳到自己資料夾的元件使用 */
const CurrentMemberContext = createContext<string | null>(null);

export function CurrentMemberProvider({ id, children }: { id: string | null; children: React.ReactNode }) {
  return <CurrentMemberContext.Provider value={id}>{children}</CurrentMemberContext.Provider>;
}

export function useCurrentMemberId() {
  return useContext(CurrentMemberContext);
}
