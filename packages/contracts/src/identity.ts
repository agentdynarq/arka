/**
 * Authentication, MFA, step-up and the two identity journeys unique to the
 * scenario: re-verifying against the preserved registry (FR-01) and opening
 * a new account with KYC upload (FR-02).
 */
import { z } from 'zod'
import { isoTimestamp, role } from './common.ts'

export const loginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})
export type LoginRequest = z.infer<typeof loginRequest>

/** MFA is mandatory on login (FR-03). A login never completes to a session directly. */
export const loginChallengeResponse = z.object({
  mfaToken: z.string().min(1),
  expiresAt: isoTimestamp,
})
export type LoginChallengeResponse = z.infer<typeof loginChallengeResponse>

export const mfaVerifyRequest = z.object({
  mfaToken: z.string().min(1),
  totpCode: z.string().regex(/^\d{6}$/, 'a TOTP code is six digits'),
})
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequest>

export const sessionResponse = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  role,
  expiresAt: isoTimestamp,
})
export type SessionResponse = z.infer<typeof sessionResponse>

/**
 * Step-up authentication (FR-04): a second proof demanded at the moment of a
 * risky action rather than at login. The reason is informational only, it
 * never changes what proof is required.
 */
export const stepUpReason = z.enum(['new_payee', 'over_limit', 'unrecognised_device'])
export type StepUpReason = z.infer<typeof stepUpReason>

export const stepUpRequest = z.object({
  actionToken: z.string().min(1),
  reason: stepUpReason,
  totpCode: z.string().regex(/^\d{6}$/),
})
export type StepUpRequest = z.infer<typeof stepUpRequest>

export const stepUpResponse = z.object({
  stepUpToken: z.string().min(1),
  expiresAt: isoTimestamp,
})
export type StepUpResponse = z.infer<typeof stepUpResponse>

/**
 * FR-01. `livenessSimulated` is always `true` and is part of the contract on
 * purpose, so no consumer of this response can present a simulated check as a
 * real one. See docs/adr/0005 and the honesty note in PHASE-2-PLAN.md.
 */
export const reVerificationRequest = z.object({
  customerId: z.string().min(1),
  registryDocumentId: z.string().min(1),
})
export type ReVerificationRequest = z.infer<typeof reVerificationRequest>

export const reVerificationResult = z.object({
  verified: z.boolean(),
  livenessSimulated: z.literal(true),
  checkedAt: isoTimestamp,
})
export type ReVerificationResult = z.infer<typeof reVerificationResult>

/** FR-02. Upload happens first, the resulting id is referenced by account opening. */
export const kycDocumentUploadResult = z.object({
  documentId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  uploadedAt: isoTimestamp,
})
export type KycDocumentUploadResult = z.infer<typeof kycDocumentUploadResult>

export const accountOpeningRequest = z.object({
  fullName: z.string().min(1),
  dateOfBirth: z.iso.date(),
  email: z.email(),
  phone: z.string().min(1),
  kycDocumentId: z.string().min(1),
})
export type AccountOpeningRequest = z.infer<typeof accountOpeningRequest>

export const accountOpeningStatus = z.enum(['pending_review', 'approved', 'rejected'])
export type AccountOpeningStatus = z.infer<typeof accountOpeningStatus>

export const accountOpeningResult = z.object({
  customerId: z.string().min(1),
  status: accountOpeningStatus,
})
export type AccountOpeningResult = z.infer<typeof accountOpeningResult>
