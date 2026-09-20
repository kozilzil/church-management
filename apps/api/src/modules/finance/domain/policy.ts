export function validApprovalLine(ids: string[], requester: string) {
  return (
    ids.length >= 1 &&
    ids.length <= 5 &&
    new Set(ids).size === ids.length &&
    !ids.includes(requester)
  );
}
export function canPay(requester: string, approvers: string[], payer: string) {
  return requester !== payer && !approvers.includes(payer);
}
export function integerWon(value: number) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 999999999999;
}
