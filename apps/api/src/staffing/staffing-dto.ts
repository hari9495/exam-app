import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Staffing desk slice 1 request bodies. Money is rupees as text ("1200.50"), turned into paise exactly by the service.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const MULT = ['1', '1.25', '1.5', '1.75', '2', '2.5', '3'];

export class ClientDto {
  @trim() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @trim() @IsString() @MaxLength(200) legalName?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(15) gstin?: string | null;
  @IsString() @Matches(/^IN-[A-Z]{2}$/) state!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(500) billingAddress!: string;
  @IsOptional() @IsIn(['onboarding', 'active', 'on_hold']) status?: 'onboarding' | 'active' | 'on_hold';
  @IsOptional() @IsUUID() accountManagerUserId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(180) paymentTermsDays?: number | null;
  @IsOptional() @Matches(DAY) contractStart?: string | null;
  @IsOptional() @Matches(DAY) contractEnd?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(365) noticeDays?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(60) slaFirstSubmissionDays?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(60) slaFeedbackDays?: number | null;
  @IsOptional() @IsIn(['194C', '194J', null]) tdsSection?: '194C' | '194J' | null;
  @IsOptional() @IsIn(['month', 'placement']) invoiceGrouping?: 'month' | 'placement';
}

export class UpdateClientDto extends ClientDto {
  @IsInt() @Min(1) version!: number;
}

export class ClientContactDto {
  @trim() @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(120) role!: string;
  @trim() @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @trim() @Matches(/^\+?[0-9 ]{8,16}$/) phone?: string | null;
  @IsOptional() @IsBoolean() billing?: boolean;
}

export class RateLineDto {
  @trim() @IsString() @MinLength(1) @MaxLength(120) role!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(200) skill!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(120) location!: string;
  @IsIn(['hour', 'day', 'month']) unit!: 'hour' | 'day' | 'month';
  @IsString() @Matches(MONEY) billRate!: string;
  @IsString() @Matches(MONEY) payRate!: string;
  @IsOptional() @IsIn(MULT) ot?: string;
  @IsOptional() @IsIn(MULT) holiday?: string;
  @Matches(DAY) validFrom!: string;
  @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string | null;
}

export class RateChangeDto {
  @Matches(DAY) validFrom!: string;
  @IsString() @Matches(MONEY) billRate!: string;
  @IsString() @Matches(MONEY) payRate!: string;
  @IsOptional() @IsIn(MULT) ot?: string;
  @IsOptional() @IsIn(MULT) holiday?: string;
  @trim() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class StaffingSettingChangeDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.]{2,79}$/) key!: string;
  @IsString() @MaxLength(40) value!: string;
}

export class SaveStaffingSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StaffingSettingChangeDto)
  changes!: StaffingSettingChangeDto[];
}

export class InvoiceSeriesDto {
  @IsUUID() legalEntityId!: string;
  @trim() @IsString() @MaxLength(15) gstin!: string;
  @Matches(/^\d{4}-\d{2}$/) financialYear!: string;
  // GST invoice numbers: at most 16 characters in all, letters, digits, '-' and '/' (CGST Rules r.46(b)); the prefix
  // leaves at least 3 for the number (the service checks the whole length).
  @trim() @Matches(/^[A-Za-z0-9/-]{1,13}$/) prefix!: string;
  @IsInt() @Min(1) @Max(99_999_999) nextNumber!: number;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

/* ---------------- Slice 2 ---------------- */

export class ClientJobDto {
  @IsUUID() lineId!: string;
  @IsOptional() @trim() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) headcount?: number;
}

export class SubmitPersonDto {
  @IsIn(['employee', 'candidate']) kind!: 'employee' | 'candidate';
  @IsUUID() id!: string;
}

export class SubmitToClientDto {
  @IsUUID() jobId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SubmitPersonDto)
  people!: SubmitPersonDto[];
  @IsUUID() contactId!: string;
  @IsString() @Matches(MONEY) billRate!: string;
  @IsBoolean() masked!: boolean;
}

export class MoveSubmissionDto {
  @IsIn(['submitted', 'client_review', 'interview', 'selected', 'rejected']) stage!: 'submitted' | 'client_review' | 'interview' | 'selected' | 'rejected';
  @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @trim() @IsString() @MaxLength(500) feedback?: string;
}

export class PlacementCreateDto {
  @IsUUID() submissionId!: string;
  @Matches(DAY) startOn!: string;
  @Matches(DAY) endOn!: string;
}

export class PlacementExtendDto {
  @Matches(DAY) endOn!: string;
  @trim() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsInt() @Min(1) version!: number;
}

export class PlacementEndDto {
  @Matches(DAY) endOn!: string;
  @IsIn(['client', 'performance', 'resigned']) reason!: 'client' | 'performance' | 'resigned';
  @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
  @IsInt() @Min(1) version!: number;
}

export class BenchAddDto {
  @IsUUID() employeeId!: string;
  @Matches(DAY) sinceOn!: string;
  @IsOptional() @trim() @IsString() @MaxLength(300) note?: string;
}

export class VendorDto {
  @trim() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @trim() @IsEmail() @MaxLength(254) contactEmail?: string | null;
  @IsOptional() @trim() @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/) pan?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(15) gstin?: string | null;
  @IsOptional() @IsIn(['194C', '194J']) tdsSection?: '194C' | '194J' | null;
  @IsOptional() @IsIn(['preferred', 'standard', 'probation']) tier?: 'preferred' | 'standard' | 'probation' | null;
  @IsOptional() @Matches(DAY) agreementSignedOn?: string | null;
  @IsOptional() @IsBoolean() bankVerified?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ShareJobDto {
  @IsUUID() jobId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('all', { each: true }) agencyIds!: string[];
  @IsOptional() @IsString() @Matches(MONEY) rateCap?: string | null;
  @IsInt() @Min(1) @Max(100) maxSubmissions!: number;
  @Matches(DAY) expiresOn!: string;
  @IsBoolean() maskClient!: boolean;
}

export class CapExceptionDto {
  @trim() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ForwardDto {
  @IsUUID() contactId!: string;
}

/* ---------------- Slice 3: hours, invoices, receipts, fees, vendor invoices, client portal ---------------- */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const QTY = /^\d{1,3}(\.\d{1,2})?$/;

export class HoursDto {
  @Matches(DAY) weekStart!: string;
  @IsString() @Matches(QTY) hours!: string;
  @IsOptional() @IsString() @Matches(QTY) overtime?: string;
}

export class ApproveHoursDto {
  @IsUUID() contactId!: string;
  @IsInt() @Min(1) version!: number;
}

export class DraftInvoiceDto {
  @IsUUID() clientId!: string;
  @Matches(MONTH) month!: string;
  @IsUUID() seriesId!: string;
  @IsOptional() @trim() @IsString() @MaxLength(60) po?: string;
}

export class VersionDto {
  @IsInt() @Min(1) version!: number;
}

export class CreditNoteDto {
  @IsString() @Matches(MONEY) amount!: string;
  @trim() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ReissueDto {
  @trim() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class AllocationDto {
  @IsUUID() invoiceId!: string;
  @IsString() @Matches(MONEY) amount!: string;
}

export class ReceiptDto {
  @IsUUID() clientId!: string;
  @Matches(DAY) receivedOn!: string;
  @IsString() @Matches(MONEY) amount!: string;
  @IsOptional() @IsString() @Matches(MONEY) tds?: string;
  @IsOptional() @trim() @IsString() @MaxLength(60) reference?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations!: AllocationDto[];
}

export class CollectionDto {
  @IsOptional() @IsString() @Matches(MONEY) tds26as?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(500) dispute?: string | null;
  @IsInt() @Min(1) version!: number;
}

export class TaperRowDto {
  @IsInt() @Min(0) @Max(120) fromMonth!: number;
  @IsString() @Matches(/^\d{1,3}(\.\d{1,2})?$/) pct!: string;
}

export class ClientTermsDto {
  @IsIn(['percent', 'fixed']) feeKind!: 'percent' | 'fixed';
  @IsOptional() @IsString() feePct?: string;
  @IsOptional() @IsString() @Matches(MONEY) feeAmount?: string;
  @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => TaperRowDto) taper!: TaperRowDto[];
  @IsInt() @Min(0) @Max(365) guaranteeDays!: number;
  @IsIn(['replace', 'refund']) remedy!: 'replace' | 'refund';
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class VendorBillDto {
  @IsUUID() placementId!: string;
  @Matches(MONTH) month!: string;
  @trim() @IsString() @Matches(/^[A-Za-z0-9/._-]{1,40}$/, { message: 'A vendor invoice number is up to 40 letters, digits, / . _ or -.' }) vendorInvoiceNo!: string;
  @IsOptional() @Matches(DAY) invoiceDate?: string;
}

export class VendorBillPaidDto {
  @Matches(DAY) paidOn!: string;
}

export class ContactPortalDto {
  @IsBoolean() access!: boolean;
}

export class PortalEmailDto {
  @trim() @IsEmail() @MaxLength(254) email!: string;
}

export class PortalVerifyDto {
  @trim() @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class PortalDecisionDto {
  @IsIn(['shortlist', 'reject']) decision!: 'shortlist' | 'reject';
  @IsOptional() @trim() @IsString() @MaxLength(500) feedback?: string;
}

export class HireDto {
  @Matches(DAY) hiredOn!: string;
  @IsString() @Matches(MONEY) ctc!: string;
  @IsUUID() seriesId!: string;
  @IsOptional() @trim() @IsString() @MaxLength(60) po?: string;
}

export class LeftDto {
  @Matches(DAY) leftOn!: string;
}

export class PortalInterviewDto {
  @IsUUID() submissionId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) startsAt!: string;
  @IsIn(['video', 'site', 'phone']) mode!: 'video' | 'site' | 'phone';
  @IsOptional() @trim() @IsString() @MaxLength(300) panel?: string;
}

export class VendorConsultantDto {
  @IsOptional() @IsUUID() consultantId!: string | null;
}

export class PortalSendBackDto {
  @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}
