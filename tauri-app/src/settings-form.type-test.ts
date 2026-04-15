import type { AccountInfo } from "./types";

export type Expect<T extends true> = T;

export type AccountInfoExposesOrgId = Expect<
  "org_id" extends keyof AccountInfo ? true : false
>;

export type AccountInfoOrgIdIsFrontendSafeMetadata = Expect<
  AccountInfo["org_id"] extends string | null | undefined ? true : false
>;
