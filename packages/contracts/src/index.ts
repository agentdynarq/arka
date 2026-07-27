/**
 * contracts
 *
 * The shared boundary between the gateway and every service, and the only
 * place either lane changes without telling the other first. Frozen after
 * 27 July, see ../../arka-ops/DECISIONS.md.
 */

export {
  positiveAmount,
  nonNegativeAmount,
  signedAmount,
  isoTimestamp,
  cellId,
  idempotencyKey,
  role,
  apiError,
  paginated,
} from './common.ts'
export type { Role, ApiError } from './common.ts'

export { cellRouteResponse, cellHealthStatus, cellHealthSnapshot } from './cell.ts'
export type { CellRouteResponse, CellHealthStatus, CellHealthSnapshot } from './cell.ts'

export {
  loginRequest,
  loginChallengeResponse,
  mfaVerifyRequest,
  sessionResponse,
  stepUpReason,
  stepUpRequest,
  stepUpResponse,
  reVerificationRequest,
  reVerificationResult,
  kycDocumentUploadResult,
  accountOpeningRequest,
  accountOpeningStatus,
  accountOpeningResult,
} from './identity.ts'
export type {
  LoginRequest,
  LoginChallengeResponse,
  MfaVerifyRequest,
  SessionResponse,
  StepUpReason,
  StepUpRequest,
  StepUpResponse,
  ReVerificationRequest,
  ReVerificationResult,
  KycDocumentUploadResult,
  AccountOpeningRequest,
  AccountOpeningStatus,
  AccountOpeningResult,
} from './identity.ts'

export {
  balanceResponse,
  ledgerConfirmationStatus,
  transactionHistoryItem,
  transactionHistoryResponse,
} from './accounts.ts'
export type {
  BalanceResponse,
  LedgerConfirmationStatus,
  TransactionHistoryItem,
} from './accounts.ts'

export {
  transferRequest,
  transferStatus,
  transferResult,
  qrPaymentPayload,
  qrRedemptionRequest,
  dailyLimitResponse,
  dailyLimitChangeRequest,
  agentCashDirection,
  agentCashRequest,
  clientHints,
} from './payments.ts'
export type {
  TransferRequest,
  TransferStatus,
  TransferResult,
  QrPaymentPayload,
  QrRedemptionRequest,
  DailyLimitResponse,
  DailyLimitChangeRequest,
  AgentCashDirection,
  AgentCashRequest,
  ClientHints,
} from './payments.ts'

export { transactionAlert, securityAlertKind, securityAlert } from './notifications.ts'
export type { TransactionAlert, SecurityAlertKind, SecurityAlert } from './notifications.ts'

export {
  quarantineRequest,
  quarantineApproval,
  quarantineState,
  quarantineStatus,
  integrityVerificationResult,
  integrityExportRequest,
  integrityExportResult,
  auditTrailEntry,
} from './recovery.ts'
export type {
  QuarantineRequest,
  QuarantineApproval,
  QuarantineState,
  QuarantineStatus,
  IntegrityVerificationResult,
  IntegrityExportRequest,
  IntegrityExportResult,
  AuditTrailEntry,
} from './recovery.ts'
