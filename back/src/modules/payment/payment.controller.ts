import {
  Controller,
  Body,
  Post,
  Get,
  Param,
  Put,
  Delete,
  Patch,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SKIP_ALL_THROTTLERS } from '../../auth/auth.throttle';
import { PaymentService } from './payment.service';
import { PaymentDto } from './dto/payment-dto';
import { ManualPaymentDto } from './dto/manual-payment-dto';
import { PlanCheckoutDto } from './dto/plan-checkout-dto';
import { PaymentQueryDto } from './dto/payment-query-dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { ActiveUser } from '../../common/decorators/active-user.decorator';
import type { UserActiveInterface } from '../../common/interfaces/user-active.interface';
import { Role } from '../../common/enum/role.enum';
import { ReceiptPrintService } from '../receipt/receipt-print.service';
import { MercadoPagoConfig } from '../mercadopago/mercadopago.config';
import type { ReceiptPayMethod } from '../receipt/receipt.html';
import type { Payment } from './entity/payment.entity';

// Payment methods that get an informational "cash/transferencia" ticket
// printed on the front desk's Point terminal — a receipt of what the admin
// already recorded, never a Mercado Pago charge. debito/credito already
// leave a receipt with whatever external card machine took them.
const PRINTABLE_PAY_METHODS: ReadonlySet<string> = new Set([
  'efectivo',
  'transferencia',
]);

// The whole payment module is admin-only except /me (self-service, below):
// no public page depends on reading or writing someone else's payments.
@Controller('api/v1/Payment')
@ApiTags('Payments')
@Auth(Role.ADMIN)
// Not rate limited — see auth.throttle.ts.
@SkipThrottle(SKIP_ALL_THROTTLERS)
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly receiptPrintService: ReceiptPrintService,
    private readonly mercadoPagoConfig: MercadoPagoConfig,
  ) {}

  // Attaches printStatus (and printError, if any) to a just-saved payment
  // when its method is printable. Printing is a side effect of an already
  // -committed payment, so a failure here never turns into a failed
  // response — it only changes what printStatus says.
  private async withPrintedReceipt(
    payment: Payment,
    admin: UserActiveInterface,
  ): Promise<Payment | Record<string, unknown>> {
    if (!PRINTABLE_PAY_METHODS.has(payment.payMethod)) {
      return payment;
    }
    if (
      !this.mercadoPagoConfig.enabled ||
      !this.mercadoPagoConfig.pointTerminalId
    ) {
      return { ...payment, printStatus: 'not_configured' };
    }

    const result = await this.receiptPrintService.printPaymentReceipt({
      paymentId: payment.id,
      amount: payment.amount,
      date: payment.date,
      payMethod: payment.payMethod as ReceiptPayMethod,
      terminalId: this.mercadoPagoConfig.pointTerminalId,
      cashier: admin.email,
    });

    return {
      ...payment,
      printStatus: result.status,
      ...(result.errorMessage ? { printError: result.errorMessage } : {}),
    };
  }

  // Self-service: payment history of the authenticated user (see specs.md
  // §2.2/§3.5). userId comes from the JWT, never from a param.
  @Get('me')
  @Auth(Role.USER)
  getMyPayments(@ActiveUser() user: UserActiveInterface) {
    return this.paymentService.findMineForUser(user.sub);
  }

  // In-person payment recorded by an admin (specs.md §3.5).
  @Post('manual')
  async createManualPayment(
    @ActiveUser() admin: UserActiveInterface,
    @Body() dto: ManualPaymentDto,
  ) {
    const payment = await this.paymentService.createManualPayment(
      dto,
      admin.sub,
    );
    return this.withPrintedReceipt(payment, admin);
  }

  // One in-person sale: plan + duration + amount + method in a single atomic
  // request. No method-level @Auth — the class-level @Auth(Role.ADMIN)
  // already covers it, and a bare @Auth() here would REPLACE it and widen
  // the route to any logged-in member.
  @Post('checkout')
  async registerPlanPayment(
    @ActiveUser() admin: UserActiveInterface,
    @Body() dto: PlanCheckoutDto,
  ) {
    const payment = await this.paymentService.registerPlanPayment(
      dto,
      admin.sub,
    );
    return this.withPrintedReceipt(payment, admin);
  }

  @Post()
  createPayment(@Body() paymentDto: PaymentDto) {
    return this.paymentService.createPayment(paymentDto);
  }

  @Get()
  getPayments(@Query() query: PaymentQueryDto) {
    return this.paymentService.findAll(query);
  }

  @Get('filter/deleted')
  getPaymentsDeleted() {
    return this.paymentService.findAllDeleted();
  }

  // Payment history of one specific user (Users panel). Declared before
  // '/:id' for the same reason as 'search'/'by-user' in the other modules.
  @Get('by-user/:id')
  getPaymentsByUser(@Param('id', ParseIntPipe) id: number) {
    return this.paymentService.findByUser(id);
  }

  @Get('/:id')
  getPaymentById(@Param('id', ParseIntPipe) id: number) {
    return this.paymentService.findPayment(id);
  }

  @Put()
  updatePayment(@Body() paymentDto: PaymentDto) {
    return this.paymentService.updatePayment(paymentDto);
  }

  @Delete('/:id')
  deletePayment(@Param('id', ParseIntPipe) id: number) {
    return this.paymentService.deletePayment(id);
  }

  @Patch('/restore/:id')
  restorePayment(@Param('id', ParseIntPipe) id: number) {
    return this.paymentService.restorePayment(id);
  }
}
