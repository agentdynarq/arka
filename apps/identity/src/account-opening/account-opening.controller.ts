import { Body, Controller, Post, UseInterceptors, UploadedFile, HttpException, HttpStatus, Inject } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { accountOpeningRequest } from '@arka/contracts'
import type { KycDocumentUploadResult, AccountOpeningResult } from '@arka/contracts'
import { IdentityService, IdentityError } from '@arka/identity'

/** The subset of Multer's uploaded-file shape this controller reads. Avoids a type-only dependency on `@types/multer`. */
interface UploadedMulterFile {
  readonly originalname: string
  readonly mimetype: string
  readonly buffer: Buffer
}

/** FR-02: KYC document upload, then account opening referencing it. */
@Controller('v1/identity')
export class AccountOpeningController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Post('kyc-upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadKyc(@UploadedFile() file: UploadedMulterFile | undefined): Promise<KycDocumentUploadResult> {
    if (!file) {
      throw new HttpException({ code: 'INVALID_REQUEST', message: 'A file is required' }, HttpStatus.BAD_REQUEST)
    }
    const document = await this.identity.uploadKycDocument(file.originalname, file.mimetype, file.buffer)
    return {
      documentId: document.documentId,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.uploadedAt,
    }
  }

  @Post('account-opening')
  async openAccount(@Body() body: unknown): Promise<AccountOpeningResult> {
    const request = accountOpeningRequest.parse(body)
    try {
      const record = await this.identity.openAccount(request)
      return { customerId: record.customerId, status: record.status }
    } catch (error) {
      if (error instanceof IdentityError) {
        throw new HttpException({ code: error.code, message: error.message }, HttpStatus.BAD_REQUEST)
      }
      throw error
    }
  }
}
