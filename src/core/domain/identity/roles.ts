export const ROLES = [
  'PLATFORM_ADMIN',
  'STORE_OWNER',
  'STORE_EMPLOYEE',
  'CUSTOMER',
  'PENDING_OWNER',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string | null | undefined): value is Role {
  return ROLES.includes(value as Role);
}
